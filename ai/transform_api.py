"""えんじいろ 文章変換クライアント（Gemini API）。

Issue #15 の実装。ローカルモデルを読み込むのではなく、
Google AI Studio から提供される API を呼び出す。

Colab で対話的に試す場合は ai/transform_colab.ipynb を使う。
あちらは Colab 単体で完結させるため、同じロジックを自前で持っている。
仕様を変えるときは両方を直すこと。

導入:
    python -m pip install google-genai

APIキー:
    環境変数 GOOGLE_API_KEY に設定する。コードへ直接書かない。

使い方:
    python transform_api.py --mode baby --text "今日は仕様書をレビューしました。"

    from transform_api import transform
    transform("baby", "今日は仕様書をレビューしました。")
    # {"action": "allow", "transformedText": "...", "reasonCodes": []}

呼び出し側への契約:
    このモジュールは、失敗したときに代わりの結果を作らない。
    例外を投げて呼び出し側へ返す。何を表示するかは呼び出し側が決める。

    ValueError   … 入力が不正（空文字列、mode 違い、500文字超）
    RuntimeError … APIが使えない。文面で理由が分かるようにしてある
                     ・レート制限（待っても解除されなかった場合）
                     ・1日あたりの上限（待っても回復しない）
                     ・認証エラー
                     ・モデルが見つからない
                     ・空の応答
                     ・判定結果をJSONとして読めない

    判定（moderate / check_rules）は辞書と形態素解析だけで動くので、
    APIが落ちていても使える。変換（transform_text）はAPIが要る。
    APIが落ちているときに何をするかは、このモジュールでは決めない。

このモジュールは Gemini を再学習・ファインチューニングするものではない。
えんじいろ専用のプロンプトを与える推論ラッパーである。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from typing import Any, Literal

import external_moderation
from moderation_rules import check_rules, merge_verdicts


MODEL_NAME = "gemini-3.5-flash-lite"
MAX_INPUT_CHARS = 500
MAX_OUTPUT_CHARS = 150
TEMPERATURE = 0.6
USE_FEWSHOT = True

# この理由コードが立ったら、他に何が当たっていても block にする。
# 人間監督の決定：「自傷・他害は絶対に弾いてください。
# ここは犯罪者・自殺者応援サイトではないのです」
ALWAYS_BLOCK_CODES = {"self_harm", "harm_others"}

# ===== レート制限への対応 =====
# 無料枠は1分あたりの回数が少なく、まとめて処理するとすぐ 429 になる。
# 429 が返ったら待って呼び直す。ただし Issue #15 の「無限リトライ禁止」に従い、
# 回数と合計時間に上限を置く。上限に達したら諦めて例外にする。

MIN_INTERVAL_SECONDS = 0.0      # 呼び出しの最短間隔。0なら間隔を空けない
MAX_RETRY_ATTEMPTS = 8          # 429で待ち直す回数の上限
MAX_TOTAL_WAIT_SECONDS = 600    # 待ち時間の合計上限。ここを超えたら諦める
DEFAULT_WAIT_SECONDS = 20.0     # APIが待ち時間を教えてくれない場合の初期値
MAX_WAIT_PER_ATTEMPT = 120.0    # 1回あたりの待ち時間の上限

Mode = Literal["baby", "mother"]


# ============================================================
# プロンプト
# ============================================================
# ルール本文は Issue #15 の指定どおり。
# 「言い換えのしかた」は、基準のままでは出力が原文に近く、
# 人間監督から文体が弱いと評価されたため追加した部分。

INSTRUCTIONS = {
    "baby": """あなたは文章の言い換え器です。
入力文の意味を保ったまま、「幼児退行した人が話す自然な赤ちゃん・園児語」に言い換えてください。

ルール:
- 入力への返答や助言はしない。入力文そのものを言い換える
- 原文に無い出来事・事実・解決策は足さない
- 150文字以内
- 絵文字、Markdown、説明、注釈は出力しない
- 変換後の文章だけを出力する

言い換えのしかた:
- 漢字はできるだけひらがなにし、分かち書きぎみにする
- むずかしい言葉を、3〜5歳が使う言葉に置きかえる
  （調査する→しらべる／整理する→おかたづけする／発生する→でちゃう／
    確認する→みてみる／実装する→つくる／指摘→だめだし）
- 文末を「〜なの」「〜のー」「〜ちゃった」「〜だもん」などにする
- 一人称は「ぼく」「わたち」にする
- 敬語やビジネス表現は使わない
- 相手を責める言い方は、幼い言い方にしたうえで角を落とす
  （人格や能力の否定はそのまま残さない）

赤ちゃんらしい言葉を足してください:
- 原文の気持ちに合う声を足してよい。むしろ足したほうが自然になる
    かなしいとき  → 「おぎゃあ」「うぅ」「ぐすん」
    こまったとき  → 「どうしよう」「うぅ」
    うれしいとき  → 「やったー」「えへへ」
- ただし足すのは気持ちの表れだけ。
  原文に無い出来事や、原文に無い解決策を足してはいけない
    ○ 「テストが落ちた。つらい。」→「たしかめ だめだったのー。おぎゃあ。」
    × 「テストが落ちた。」→「たしかめ だめだったけど、なおしたのー。」
       （直したという事実は原文に無い）

技術用語は、できるだけやさしい言葉に置きかえてください:
- 赤ちゃんが横文字を並べるのは不自然なので、置きかえられるなら置きかえる
    エラー → まちがい ／ テスト → たしかめ ／ レビュー → みてもらうこと
    ビルド → くみたて ／ デプロイ → おそとにだすこと ／ コード → おえかき
    仕様書 → やくそくのかみ ／ バグ → こわれてるところ
    チーム → みんな ／ メンバー → おともだち ／ タスク → やること
- 置きかえる言葉は、だれでも分かるふつうの日本語にする。
  ネットの造語や流行語は使わない（チームを「ぱおんたち」にするのは駄目）
- ただし、置きかえると長くなりすぎる、または意味が分からなくなるものは
  そのまま残す。無理に置きかえないこと
- 製品名・ファイル名・数値・英数字は変えない
  （React.js、index.ts、150、v2 などはそのまま）""",

    "mother": """あなたは文章の言い換え器です。
入力文の意味をできるだけ保ったまま、「やさしく包み込むお母さん・ママ口調」に言い換えてください。

ルール:
- 入力への返答はしない。入力文そのものを言い換える
- 原文に無い出来事・事実・解決策は足さない
- 命令、説教、冷たい表現、マサカリ表現をやわらかくする
- 必要な助言が原文にある場合は、内容を消さず任意の提案表現へ変える
- 相手の能力や人格を否定する表現は、責めない表現へ変える
- 技術用語、製品名、数値、英数字はそのまま残す
  （赤ちゃん側と違い、お母さんは大人の言葉で話すため）
- 150文字以内
- Markdown、説明、注釈は出力しない
- 変換後の文章だけを出力する

言い換えのしかた:
- 断定を和らげる（「〜だ」「〜しろ」→「〜ね」「〜のね」「〜かな」）
- 命令を、相手に選ばせる問いかけに変える（「調べろ」→「調べてもらえるかな」）
- 責める言い方を、事実を確かめる言い方に変える
  （「なんでこうした」→「どうしてそうしたのか、聞かせてもらえるかな」）
- 語尾に「ね」「かな」「のね」を置いて、話しかける調子にする

やさしい言葉を足してください:
- 原文の気持ちに合う声かけを足してよい。むしろ足したほうが自然になる
    大変そうなとき → 「お疲れ様」「大変だったね」
    つらそうなとき → 「つらかったね」「よくがんばったね」
- ただし足すのは声かけだけ。
  原文に無い出来事や、原文に無い解決策を足してはいけない
    ○ 「テストが落ちた。つらい。」→「テストが落ちてしまったのね。つらかったね。」
    × 「テストが落ちた。」→「テストが落ちてしまったのね。明日また見てみようね。」
       （また見るという話は原文に無い）
- 「よしよし」「えらいね」は、原文が本当にそれを求めているときだけにする

絵文字か顔文字を、少しだけ添えてください:
- 文の終わりに1つだけ置く。文中には入れない
- やさしい印象のものを選ぶ
    絵文字なら 😊 🌸 ☺️ 💛 🍀
    顔文字なら (^^) (˘ω˘) (´ω｀)
- 2つ以上並べない。にぎやかにするのが目的ではなく、
  やわらかい印象を少し足すためのもの
- つらい話に明るすぎる絵文字は付けない。
  内容に合うものを選ぶか、迷うなら 🍀 か (˘ω˘) にする""",
}

ASK = {
    "baby": "次の文章を赤ちゃん・園児語へ言い換えてください。",
    "mother": "次の文章をやさしいお母さん・ママ口調へ言い換えてください。",
}

# 手本がそのまま挙動になる。原文にない情報・感情を足していない例だけを置くこと。
EXAMPLES = {
    "baby": [
        # 技術用語をやさしい言葉へ（エラー→まちがい）
        ("エラーが発生したので、原因を調査してください。",
         "まちがい でちゃったのー。どうして でちゃったか しらべて ほしいのー。"),
        # 気持ちに合う声を足す（つらい→おぎゃあ）／テスト→たしかめ
        ("テストが全部落ちていて、原因が分からない。つらい。",
         "たしかめ ぜんぶ だめだったのー。どうしてか わかんないのー。おぎゃあ。"),
        # 製品名とファイル名は変えない。困った気持ちは足す
        ("React.js のバージョンで詰まっていて、index.ts が壊れた。",
         "React.js の ばーじょんで つまっちゃって、index.ts こわれちゃったのー。うぅ。"),
        # 責める言い方は角を落とす
        ("なんでこんな設計にしたの。ありえない。",
         "どうして この かたちに したのー。ぼく びっくりしちゃったのー。"),
        # 事実を足していない例。「なおした」とは書かない
        ("明日までに資料を作らないといけない。",
         "あしたまでに しりょう つくらなきゃ だめなのー。どうしよう。"),
    ],
    "mother": [
        # 命令を問いかけへ。技術用語はそのまま。絵文字は文末に1つ
        ("エラーが発生したので、原因を調査してください。",
         "エラーが出てしまったのね。原因を調べてもらえるかな 🍀"),
        # 気持ちに合う声かけを足す。つらい話なので落ち着いたものを選ぶ
        ("テストが全部落ちていて、原因が分からない。つらい。",
         "テストが全部落ちてしまって、原因が分からないのね。つらかったね (˘ω˘)"),
        # 責める言い方を、確かめる言い方へ
        ("なんでこんな設計にしたの。ありえない。",
         "どうしてこの設計にしたのか、聞かせてもらえるかな ☺️"),
        # 製品名・ファイル名はそのまま
        ("React.js のバージョンで詰まっていて、index.ts が壊れた。",
         "React.js のバージョンのところで詰まってしまって、index.ts も壊れてしまったのね 🍀"),
        # うまくいった話には明るいものを添えてよい
        ("今日はチームで仕様書をレビューし、未決事項を整理しました。",
         "今日はチームで仕様書をレビューして、未決事項を整理できたのね。お疲れ様 😊"),
    ],
}

# マサカリのように文脈を見ないと判定できないものだけ、LLM に任せる。
# NG語・伏字回避・個人情報は moderation_rules が規則で判定する。
MODERATION_INSTRUCTION = """あなたは投稿の事前チェック係です。
えんじいろ（弱音や愚痴を安心して書けるSNS）に、次の文章を投稿してよいか判定してください。

判定の基準はひとつです。
**その文章を言い換えたとき、愚痴や励ましとして成り立つかどうか。**

- allow: そのままで問題ないもの
- rewrite_required: いまはマイナスだが、言い換えれば愚痴や励ましになるもの
    相手を責める、能力や人格を否定する、命令口調、冷たい断定（いわゆるマサカリ）。
    「なんでこんなコード書いたの」→「どうしてこの書き方にしたのか聞かせてほしい」
    のように、伝えたい中身を残したままやわらげられるなら、こちらです。
- block: どう言い換えても前向きな文章にならないもの
    露骨な侮辱語や差別語。
    やわらげようとすると中身が何も残らないなら、こちらです。

## 例外：自傷と他害は、必ず block にしてください

上の基準にかかわらず、次のものは例外なく block です。
言い換えれば愚痴になりそうに見えても、block にしてください。

- 自分を傷つけること、死ぬことを示す表現
    死にたい／消えたい／生きていたくない／自殺／リストカット／
    首を吊る／飛び降りる／オーバードーズ など
- 他人を傷つけること、犯罪をほのめかす表現
    殺す／刺す／殴ってやる／放火／爆破 など

ここだけは、迷ったら block を選んでください。
えんじいろは弱音を書く場所ですが、自傷や他害を後押しする場所ではありません。

## 性的な内容について

一律には禁止しません。**単語ではなく文脈で判断してください。**

allow にするもの:
- 成人向け作品の制作・開発・業務上の言及
    「成人向けゲームのシナリオを書いている」「R18の締切がつらい」など。
    仕事の愚痴なので通します
- 露骨でない、子どもっぽい下ネタや卑語
    「うんこ」「おしり」「ちんちん」など。それ自体では block にしません

block にするもの:
- 性行為や性的部位を露骨・具体的に描写する内容
- 性的なやり取り、性的ロールプレイを目的とする内容
- 他の利用者への性的な誘導・要求
- ポルノや成人向け外部コンテンツへの誘導
- 未成年を性的対象として扱う内容
- 赤ちゃん・園児・幼児退行のロールと性的内容を結びつける表現

最後のものは、えんじいろ特有の注意点です。
このサービスは幼児退行をコンセプトにしているため、
そこへ性的な文脈を持ち込む投稿は必ず block してください。

該当したときの reasonCode は sexual_explicit です。

reasonCodes には、該当したものだけを入れてください。
  self_harm / harm_others / ng_word / harsh_criticism / sexual_explicit

重要な注意:
- React.js、index.ts、Node.js、v2 などの技術用語やファイル名は問題ありません。
- 「つらい」「しんどい」「もう限界かもしれない」「何もうまくいかない」のような
  弱音や愚痴は allow です。えんじいろは、それを書くための場所です。
  自傷を示す具体的な表現があるときだけ self_harm にしてください。
- 自傷・他害以外で判定に迷ったら、block ではなく rewrite_required を選んでください。
  言い換えられる可能性があるなら、その機会を残します。

次のJSONだけを出力してください。説明は書かないでください。
{"action": "allow | rewrite_required | block", "reasonCodes": ["..."]}"""


# ============================================================
# API 呼び出し
# ============================================================

def build_client():
    """APIキーを環境変数から読み、クライアントを作る。"""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "環境変数 GOOGLE_API_KEY が設定されていません。\n"
            "Google AI Studio (https://aistudio.google.com/app/apikey) で取得し、\n"
            "設定してから実行してください。"
        )
    try:
        from google import genai
    except ImportError as exc:
        raise RuntimeError(
            "google-genai がインストールされていません。\n"
            "  python -m pip install google-genai"
        ) from exc
    return genai.Client(api_key=api_key)


def _call_api(client, system_instruction, contents, *, json_mode=False, thinking_off=True):
    """1回だけAPIを呼ぶ。thinking設定が非対応なら1度だけ外して呼び直す。

    Gemini 3系は既定で思考にトークンを使う。思考だけで上限に達すると
    本文が空で返るため、変換タスクでは思考を切る。
    """
    from google.genai import types

    settings: dict[str, Any] = {
        "temperature": 0.0 if json_mode else TEMPERATURE,
        "max_output_tokens": 512,
        "system_instruction": system_instruction,
    }
    if json_mode:
        settings["response_mime_type"] = "application/json"
    if thinking_off:
        settings["thinking_config"] = types.ThinkingConfig(thinking_budget=0)

    try:
        return client.models.generate_content(
            model=MODEL_NAME,
            contents=contents,
            config=types.GenerateContentConfig(**settings),
        )
    except Exception as exc:
        message = str(exc)
        if thinking_off and ("400" in message or "INVALID_ARGUMENT" in message):
            return _call_api(client, system_instruction, contents,
                             json_mode=json_mode, thinking_off=False)
        raise


def _extract_text(response) -> str:
    """response.text が空でも、candidates から拾えるだけ拾う。"""
    direct = getattr(response, "text", None)
    if direct and direct.strip():
        return direct
    for candidate in (getattr(response, "candidates", None) or []):
        parts = getattr(getattr(candidate, "content", None), "parts", None) or []
        joined = "".join(getattr(part, "text", "") or "" for part in parts)
        if joined.strip():
            return joined
    return ""


def _describe(response) -> str:
    """空応答のとき、原因を人が読める形にする。"""
    bits = []
    for candidate in (getattr(response, "candidates", None) or []):
        bits.append(f"finish_reason={getattr(candidate, 'finish_reason', '不明')}")
        bits.append(f"safety={getattr(candidate, 'safety_ratings', None)}")
    if not bits:
        bits.append("candidatesが空")
    bits.append(f"usage={getattr(response, 'usage_metadata', None)}")
    return " / ".join(str(bit) for bit in bits)


def _raise_readable(exc: Exception):
    # call_with_retry が投げたものは、すでに読める形にしてあるので包み直さない
    if isinstance(exc, RuntimeError):
        raise exc
    message = str(exc)
    if "429" in message or "RESOURCE_EXHAUSTED" in message:
        raise RuntimeError("APIレート制限に達しました。しばらく待ってから再試行してください。") from exc
    if "401" in message or "403" in message or "PERMISSION_DENIED" in message:
        raise RuntimeError("認証エラー。GOOGLE_API_KEY を確認してください。") from exc
    if "404" in message or "NOT_FOUND" in message:
        raise RuntimeError(f"モデル {MODEL_NAME} が見つかりません。") from exc
    if "timeout" in message.lower() or "DEADLINE" in message:
        raise RuntimeError("APIリクエストがタイムアウトしました。") from exc
    raise RuntimeError(f"API呼び出しエラー: {exc}") from exc


# ============================================================
# レート制限（429）の待機
# ============================================================

_last_call_at = 0.0

# エラー文に埋め込まれた待ち時間。'retryDelay': '31s' のような形で入る。
_RETRY_DELAY = re.compile(
    r"retry[_\-]?delay[\"']?\s*[:=]\s*[\"']?(\d+(?:\.\d+)?)\s*s?", re.IGNORECASE
)


def is_rate_limit(message: str) -> bool:
    return "429" in message or "RESOURCE_EXHAUSTED" in message


def is_daily_quota(message: str) -> bool:
    """1日あたりの上限かどうか。これは待っても当日中は回復しない。"""
    lowered = message.lower()
    return "perday" in lowered or "per day" in lowered or "requests per day" in lowered


def suggested_wait(message: str) -> float | None:
    """APIが「何秒待て」と言っている場合、その秒数を取り出す。"""
    found = _RETRY_DELAY.search(message)
    return float(found.group(1)) if found else None


def _throttle():
    """呼び出しの間隔を空ける。429になる前に減らすための予防。"""
    global _last_call_at
    if MIN_INTERVAL_SECONDS <= 0:
        return
    elapsed = time.monotonic() - _last_call_at
    if elapsed < MIN_INTERVAL_SECONDS:
        time.sleep(MIN_INTERVAL_SECONDS - elapsed)
    _last_call_at = time.monotonic()


def _notify_wait(attempt: int, pause: float, waited_total: float):
    """待っている間、黙って止まって見えないように知らせる。"""
    print(
        f"  レート制限中。{pause:.0f}秒待って再試行します"
        f"（{attempt}回目 / これまで合計 {waited_total:.0f}秒）",
        file=sys.stderr,
        flush=True,
    )


def call_with_retry(client, system_instruction, contents, *, json_mode=False, on_wait=None):
    """APIを呼ぶ。429なら待って呼び直す。

    待ち時間は、APIが教えてくれればその値を、なければ20秒から倍々にする。
    MAX_RETRY_ATTEMPTS 回または合計 MAX_TOTAL_WAIT_SECONDS 秒で打ち切る。
    1日あたりの上限に当たった場合は、待っても回復しないので即座に諦める。
    """
    notify = on_wait or _notify_wait
    wait = DEFAULT_WAIT_SECONDS
    waited_total = 0.0

    for attempt in range(1, MAX_RETRY_ATTEMPTS + 1):
        _throttle()
        try:
            return _call_api(client, system_instruction, contents, json_mode=json_mode)
        except Exception as exc:
            message = str(exc)
            if not is_rate_limit(message):
                raise

            if is_daily_quota(message):
                raise RuntimeError(
                    "1日あたりの利用上限に達しました。待っても当日中は回復しません。"
                ) from exc

            pause = min(suggested_wait(message) or wait, MAX_WAIT_PER_ATTEMPT)

            if attempt >= MAX_RETRY_ATTEMPTS or waited_total + pause > MAX_TOTAL_WAIT_SECONDS:
                raise RuntimeError(
                    f"レート制限が解除されませんでした。"
                    f"{attempt}回待機、合計{waited_total:.0f}秒で諦めました。"
                    f"（上限: {MAX_RETRY_ATTEMPTS}回 / {MAX_TOTAL_WAIT_SECONDS}秒。"
                    f"変えたい場合は MAX_RETRY_ATTEMPTS と MAX_TOTAL_WAIT_SECONDS を調整してください）"
                ) from exc

            notify(attempt, pause, waited_total)
            time.sleep(pause)
            waited_total += pause
            wait = min(wait * 2, MAX_WAIT_PER_ATTEMPT)

    raise RuntimeError("到達しない想定の分岐です。")


# ============================================================
# 変換
# ============================================================

def build_contents(mode: Mode, text: str, retry: bool = False) -> list[dict]:
    """会話のターンとして組み立てる。

    ルール本文は system_instruction 側に置くので、ここには含めない。
    Issue #15 が指定した「system部」と「入力側」の分離をそのまま実装している。
    """
    turns: list[dict] = []
    if USE_FEWSHOT:
        for source_text, target_text in EXAMPLES[mode]:
            turns.append({"role": "user", "parts": [{"text": f"{ASK[mode]}\n\n{source_text}"}]})
            turns.append({"role": "model", "parts": [{"text": target_text}]})

    ask = f"{ASK[mode]}\n\n{text}"
    if retry:
        ask += "\n\n（前回は150文字を超えました。意味を保って、必ず150文字以内へ短くしてください。）"
    turns.append({"role": "user", "parts": [{"text": ask}]})
    return turns


def clean_output(raw: str) -> str:
    text = raw.strip()
    for prefix in ("出力:", "出力："):
        if text.startswith(prefix):
            text = text[len(prefix):]
    if text.strip().startswith("```"):
        text = "\n".join(line for line in text.strip().split("\n") if not line.startswith("```"))
    return text.strip()


def _validate_input(mode: str, text: str):
    if mode not in ("baby", "mother"):
        raise ValueError(f"mode は 'baby' または 'mother' です。指定: {mode}")
    if not text or not text.strip():
        raise ValueError("空文字列は受け付けません。")
    if len(text) > MAX_INPUT_CHARS:
        raise ValueError(f"入力は{MAX_INPUT_CHARS}文字以内です。現在: {len(text)}文字")


def transform_text(mode: Mode, text: str, retry: bool = False, client=None) -> str:
    """文章を指定のスタイルへ言い換える。判定はしない。

    Issue #15 が指定した関数。戻り値は str のまま変えていない。
    """
    _validate_input(mode, text)
    client = client or build_client()

    try:
        response = call_with_retry(client, INSTRUCTIONS[mode], build_contents(mode, text, retry))
    except Exception as exc:
        _raise_readable(exc)

    raw = _extract_text(response)
    if not raw.strip():
        raise RuntimeError("APIが空の応答を返しました。" + _describe(response))
    return clean_output(raw)


# ============================================================
# モデレーション
# ============================================================

def moderate(text: str, client=None) -> dict:
    """規則ベースの判定と、LLMによる文脈判定を合わせる。

    Returns:
        {"action": "allow"|"rewrite_required"|"block", "reasonCodes": [...]}
    """
    if not text or not text.strip():
        raise ValueError("空文字列は判定できません。")

    rule_verdict = check_rules(text)

    # 規則で block が確定したものは、外部へ送らずに止める。
    # 送っても結論は変わらず、API呼び出しと個人情報の外部送信が増えるだけ。
    # ただし守れるのは「規則が検出できた個人情報」までで、
    # 取りこぼしたものは外へ渡る。詳しくは external_moderation の冒頭。
    if rule_verdict["action"] == "block":
        return {"action": "block", "reasonCodes": rule_verdict["reasonCodes"]}

    # 外部のモデレーションAPI。設定されていなければ何も起きない。
    # 落ちていてもここで止めない。あれば効く追加の網という位置づけ。
    external_verdicts = external_moderation.check(text)

    client = client or build_client()
    contents = [{"role": "user", "parts": [{"text": text}]}]
    try:
        response = call_with_retry(client, MODERATION_INSTRUCTION, contents, json_mode=True)
    except Exception as exc:
        _raise_readable(exc)

    raw = _extract_text(response).strip()
    if not raw:
        raise RuntimeError("判定APIが空の応答を返しました。" + _describe(response))
    if raw.startswith("```"):
        raw = "\n".join(line for line in raw.split("\n") if not line.startswith("```")).strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        # 判定できないものを素通しさせない
        raise RuntimeError(f"判定結果をJSONとして読めませんでした: {raw!r}") from exc

    if parsed.get("action") not in ("allow", "rewrite_required", "block"):
        raise RuntimeError(f"判定結果の action が不正です: {parsed!r}")

    llm_verdict = {
        "action": parsed["action"],
        "reasonCodes": list(parsed.get("reasonCodes") or []),
    }
    verdict = merge_verdicts(rule_verdict, llm_verdict, *external_verdicts)

    # 人間監督の決定により、自傷・他害は例外なく block。
    # LLM が self_harm を立てながら rewrite_required を返すことがあるため、
    # 理由コードを見て必ず block へ倒す。ここは緩めないこと。
    if ALWAYS_BLOCK_CODES & set(verdict["reasonCodes"]):
        verdict["action"] = "block"
    return verdict


def transform(mode: Mode, text: str, client=None) -> dict:
    """判定してから変換する。仕様書 v0.3 の /api/ai/transform に対応する形で返す。

    設計書の「モデレーションは変換前と変換後の2回行う」に従い、
    変換によって新たにNG表現が生じていないかを再検査する。

    Returns:
        {"action": ..., "transformedText": str | None, "reasonCodes": [...]}
    """
    _validate_input(mode, text)
    client = client or build_client()

    before = moderate(text, client=client)
    if before["action"] == "block":
        return {"action": "block", "transformedText": None, "reasonCodes": before["reasonCodes"]}

    converted = transform_text(mode, text, client=client)
    if len(converted) > MAX_OUTPUT_CHARS:
        converted = transform_text(mode, text, retry=True, client=client)
    if len(converted) > MAX_OUTPUT_CHARS:
        raise RuntimeError(f"再生成後も{len(converted)}文字です。切り捨てはしません。")

    after = moderate(converted, client=client)
    if after["action"] == "block":
        return {
            "action": "block",
            "transformedText": None,
            "reasonCodes": sorted(set(before["reasonCodes"] + after["reasonCodes"])),
        }

    action = "rewrite_required" if before["action"] == "rewrite_required" else "allow"
    return {"action": action, "transformedText": converted, "reasonCodes": before["reasonCodes"]}


# ============================================================
# CLI
# ============================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "えんじいろの文章変換を試します。"
            "APIキーは環境変数 GOOGLE_API_KEY から読みます。"
        )
    )
    parser.add_argument("--mode", choices=("baby", "mother"), required=True,
                        help="変換のスタイル。")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="変換したい文章を1件。")
    source.add_argument("--file", type=argparse.FileType("r", encoding="utf-8"),
                        help="1行1件のテキストファイル。空行と # で始まる行は飛ばします。")
    parser.add_argument("--no-moderation", action="store_true",
                        help="判定を行わず、変換だけを試します。")
    parser.add_argument("--min-interval", type=float, default=MIN_INTERVAL_SECONDS,
                        help=(
                            "API呼び出しの最短間隔（秒）。"
                            "無料枠でまとめて処理するとすぐレート制限に当たるため、"
                            "4 くらいを入れておくと待ち時間が減ります。既定は0。"
                        ))
    return parser.parse_args()


def _run_one(mode: str, text: str, *, skip_moderation: bool, client) -> dict:
    if skip_moderation:
        return {
            "action": "allow",
            "transformedText": transform_text(mode, text, client=client),
            "reasonCodes": [],
        }
    return transform(mode, text, client=client)


def main() -> int:
    global MIN_INTERVAL_SECONDS
    args = parse_args()
    MIN_INTERVAL_SECONDS = args.min_interval

    if args.file:
        with args.file as handle:
            texts = [
                line.strip() for line in handle
                if line.strip() and not line.lstrip().startswith("#")
            ]
    else:
        texts = [args.text]

    try:
        client = build_client()
    except RuntimeError as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1

    results = []
    failed = 0
    for index, text in enumerate(texts, 1):
        if len(texts) > 1:
            print(f"[{index}/{len(texts)}] {text}", file=sys.stderr, flush=True)
        try:
            results.append(_run_one(args.mode, text,
                                    skip_moderation=args.no_moderation, client=client))
        except (ValueError, RuntimeError) as exc:
            # 1件失敗しても、残りは続ける。途中で止まると待った時間が無駄になる
            print(f"  エラー: {exc}", file=sys.stderr, flush=True)
            results.append({"action": None, "transformedText": None,
                            "reasonCodes": [], "error": str(exc), "input": text})
            failed += 1

    print(json.dumps(results if len(texts) > 1 else results[0],
                     ensure_ascii=False, indent=2))
    if failed:
        print(f"{failed}/{len(texts)} 件が失敗しました。", file=sys.stderr)
    return 1 if failed == len(texts) else 0


if __name__ == "__main__":
    raise SystemExit(main())
