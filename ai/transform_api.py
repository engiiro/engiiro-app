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

このモジュールは Gemini を再学習・ファインチューニングするものではない。
えんじいろ専用のプロンプトを与える推論ラッパーである。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Literal

from moderation_rules import check_rules, merge_verdicts


MODEL_NAME = "gemini-3.5-flash-lite"
MAX_INPUT_CHARS = 500
MAX_OUTPUT_CHARS = 150
TEMPERATURE = 0.6
USE_FEWSHOT = True

Mode = Literal["baby", "mother"]


# ============================================================
# プロンプト
# ============================================================
# ルール本文は Issue #15 の指定どおり。
# 「言い換えのしかた」は、基準のままでは出力が原文に近く、
# 人間監督から文体が弱いと評価されたため追加した部分。

INSTRUCTIONS = {
    "baby": """あなたは文章の言い換え器です。
入力文の意味・事実・感情を保ったまま、「幼児退行した人が話す自然な赤ちゃん・園児語」に言い換えてください。

ルール:
- 入力への返答や助言はしない。入力文そのものを言い換える
- 原文にない情報・感情・解決策を追加しない
- 技術用語、製品名、数値、英数字はなるべくそのまま残す
- ひらがなを少し多めにし、短く幼い言い回しにする
- 「ばぶ」「おぎゃー」「でちゅ」などは多用しない
- かわいさより、元の意味が伝わることを優先する
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
- ただし製品名・英数字・数値はひらがなにせず、そのまま残す
  （React.js、index.ts、150、v2 などは変えない）""",

    "mother": """あなたは文章の言い換え器です。
入力文の意味をできるだけ保ったまま、「やさしく包み込むお母さん・ママ口調」に言い換えてください。

ルール:
- 入力への返答はしない。入力文そのものを言い換える
- 原文にない出来事・感情・解決策を追加しない
- 命令、説教、冷たい表現、マサカリ表現をやわらかくする
- 必要な助言が原文にある場合は、内容を消さず任意の提案表現へ変える
- 相手の能力や人格を否定する表現は、責めない表現へ変える
- 技術用語、製品名、数値、英数字はなるべくそのまま残す
- 「よしよし」「えらいね」などは必要な場合だけ使い、多用しない
- 150文字以内
- 絵文字、Markdown、説明、注釈は出力しない
- 変換後の文章だけを出力する

言い換えのしかた:
- 断定を和らげる（「〜だ」「〜しろ」→「〜ね」「〜のね」「〜かな」）
- 命令を、相手に選ばせる問いかけに変える（「調べろ」→「調べてもらえるかな」）
- 責める言い方を、事実を確かめる言い方に変える
  （「なんでこうした」→「どうしてそうしたのか、聞かせてもらえるかな」）
- 語尾に「ね」「かな」「のね」を置いて、話しかける調子にする
- ただし製品名・英数字・数値はそのまま残す""",
}

ASK = {
    "baby": "次の文章を赤ちゃん・園児語へ言い換えてください。",
    "mother": "次の文章をやさしいお母さん・ママ口調へ言い換えてください。",
}

# 手本がそのまま挙動になる。原文にない情報・感情を足していない例だけを置くこと。
EXAMPLES = {
    "baby": [
        ("明日までに資料を作らないといけない。",
         "あしたまでに しりょう つくらなきゃ だめなのー。"),
        ("エラーが発生したので、原因を調査してください。",
         "エラー でちゃったのー。どうして でちゃったか しらべて ほしいのー。"),
        ("React.js のバージョンで詰まっている。",
         "React.js の ばーじょんで つまっちゃったのー。"),
        ("なんでこんな設計にしたの。ありえない。",
         "どうして この せっけいに したのー。ぼく びっくりしちゃったのー。"),
    ],
    "mother": [
        ("なんでこんな設計にしたの。ありえない。",
         "どうしてこの設計にしたのか、聞かせてもらえるかな。"),
        ("エラーが発生したので、原因を調査してください。",
         "エラーが出てしまったのね。原因を調べてもらえるかな。"),
        ("React.js のバージョンで詰まっている。",
         "React.js のバージョンのところで、詰まってしまっているのね。"),
    ],
}

# マサカリのように文脈を見ないと判定できないものだけ、LLM に任せる。
# NG語・伏字回避・個人情報は moderation_rules が規則で判定する。
MODERATION_INSTRUCTION = """あなたは投稿の事前チェック係です。
えんじいろ（弱音や愚痴を安心して書けるSNS）に、次の文章を投稿してよいか判定してください。

判定は3つのどれかです。

- block: やわらげても投稿できないもの
    - 自傷、他害、犯罪の示唆
    - 露骨な侮辱語や差別語
- rewrite_required: やわらげれば投稿できるもの
    - 相手を責める、能力や人格を否定する、命令口調、冷たい断定（いわゆるマサカリ）
- allow: 上のどれにも当たらない

reasonCodes には、該当したものだけを入れてください。
  self_harm / ng_word / harsh_criticism

重要な注意:
- React.js、index.ts、Node.js、v2 などの技術用語やファイル名は問題ありません。
- 自分の弱音、愚痴、つらさの表明は allow です。self_harm ではありません。
- 判定に迷ったら、block ではなく rewrite_required を選んでください。

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
        response = _call_api(client, INSTRUCTIONS[mode], build_contents(mode, text, retry))
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

    # 規則で block が確定したものは、LLM へ送らずに止める。
    # 送っても結論は変わらず、API呼び出しと個人情報の外部送信が増えるだけ。
    if rule_verdict["action"] == "block":
        return {"action": "block", "reasonCodes": rule_verdict["reasonCodes"]}

    client = client or build_client()
    contents = [{"role": "user", "parts": [{"text": text}]}]
    try:
        response = _call_api(client, MODERATION_INSTRUCTION, contents, json_mode=True)
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
    return merge_verdicts(rule_verdict, llm_verdict)


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
        description="えんじいろの文章変換を1件試します。APIキーは環境変数 GOOGLE_API_KEY から読みます。"
    )
    parser.add_argument("--mode", choices=("baby", "mother"), required=True,
                        help="変換のスタイル。")
    parser.add_argument("--text", required=True,
                        help="変換したい文章。")
    parser.add_argument("--no-moderation", action="store_true",
                        help="判定を行わず、変換だけを試します。")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        if args.no_moderation:
            result = {"action": "allow",
                      "transformedText": transform_text(args.mode, args.text),
                      "reasonCodes": []}
        else:
            result = transform(args.mode, args.text)
    except (ValueError, RuntimeError) as exc:
        print(f"エラー: {exc}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
