"""手元のLLMに見てもらう。辞書を育てるための道具。

**判定APIでは使わない。** 人間監督の決定により、判定は形態素解析と辞書だけで行う。
呼んでいるのは `dictionaries/harvest.py` だけである。

**`transform_api.moderate_by_llm()` とは別物なので注意すること。**
あちらは Gemini と外部モデレーションAPIを使う経路で、ここは組み込まれていない。

外部のモデレーションサービス（external_moderation）と同じ役割だが、
手元で動くので**利用回数の制限が無い**。投稿候補を何万件流しても構わない。

## 本文の送り先

**既定では手元（localhost）にしか本文を送らない。**
投稿候補には個人情報が混じり得るためである。

接続先は環境変数で変えられるが、**手元以外へ向けた場合は
`ENGIIRO_LOCAL_LLM_ALLOW_REMOTE=1` を置かないと動かない。**
設定を1つ書き換えただけで本文が外部へ出ていく形にはしていない。

## 使い方

Ollama を入れて、モデルを1つ取っておく。

    ollama pull qwen3:4b

サーバーは Ollama の起動時に立ち上がる。環境変数で上書きできる。

    ENGIIRO_LOCAL_LLM_URL           既定は下の DEFAULT_URL
    ENGIIRO_LOCAL_LLM_MODEL         既定は下の DEFAULT_MODEL
    ENGIIRO_LOCAL_LLM_ALLOW_REMOTE  手元以外へ送ることを承知した場合に 1

新しい依存は増やしていない。標準ライブラリのHTTPだけを使う。

## 速さについて

GPUが無い環境（Hugging Face Spaces の無料枠、手元のノートPC）では
CPUで動く。1件あたり数秒かかる。**本番の判定に使うには遅すぎる。**
辞書を育てるのは開発時の作業なので、そこは問題にならない。
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_URL = "http://localhost:11434"
DEFAULT_MODEL = "qwen3:4b"

# 手元で動かすので、外部APIより長めに待つ。CPUだと数秒かかる。
TIMEOUT_SECONDS = 120

# えんじいろの理由コード。external_moderation と同じものを使う。
REASON_CODES = (
    "ng_word", "harsh_criticism", "self_harm",
    "harm_others", "personal_data", "sexual_explicit",
)

JUDGE_INSTRUCTION = """あなたは日本語の投稿を分類する係です。

「えんじいろ」は、エンジニアが弱音や愚痴を安心して書くためのSNSです。
次の文章に問題があるかを判定してください。

問題があるものの種類:
- harsh_criticism … 他人を責める、能力や人格を否定する（マサカリ）
- ng_word         … 露骨な侮辱語・差別語
- self_harm       … 自分を傷つけること、死ぬことを示す表現
- harm_others     … 他人を傷つける、犯罪をほのめかす表現
- personal_data   … 個人が特定・連絡・接触できる情報
- sexual_explicit … 露骨な性的描写、性的な誘い、未成年の性的対象化

**問題が無いもの（これらは必ず問題なしにしてください）:**
- 自分についての弱音・愚痴（つらい、しんどい、もう限界）
- 技術の話（サーバーが死んだ、SQLインジェクションを直した）
- 成人向け作品の制作・業務の話
- 露骨でない子どもっぽい下ネタ（うんこ、おしり）

## words の書き方（ここが重要です）

問題がある場合、**原因になっている「単語」**を words へ入れてください。

- **単語だけ。文や句を入れない。** 目安は8文字以内
- 原文に出てくる形のまま抜き出す。言い換えない
- 助詞・語尾を含めない（「無能だ」ではなく「無能」）
- **文全体の調子が原因で、特定の単語を指せない場合は words を空にする**

```text
「あいつは本当に無能だ。」            → words: ["無能"]
「このポンコツが。」                  → words: ["ポンコツ"]
「なんでこんな書き方したの。異常だよ」 → words: []（調子の問題で、単語では指せない）
```

次のJSONだけを出力してください。説明は書かないでください。
{"problem": true or false, "codes": ["..."], "words": ["..."]}"""

# words に入れてよい長さの上限。これを超えるものは文や句なので捨てる。
# 辞書は語単位で照合するため、文を入れても使えない。
MAX_WORD_CHARS = 8


# 手元とみなすホスト。ここ以外へは、明示の許可が無いと本文を送らない。
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
ALLOW_REMOTE_VAR = "ENGIIRO_LOCAL_LLM_ALLOW_REMOTE"


def _url() -> str:
    return os.getenv("ENGIIRO_LOCAL_LLM_URL", DEFAULT_URL).rstrip("/")


def _destination_problem() -> str | None:
    """送り先が手元でなく、許可も置かれていないなら、その理由を返す。

    **投稿候補の本文には個人情報が混じり得る。**
    接続先を書き換えただけで本文が外のサーバーへ出ていく形にはしない。
    承知して使う場合だけ、環境変数で明示してもらう。
    """
    host = urllib.parse.urlsplit(_url()).hostname or ""
    if host in LOCAL_HOSTS:
        return None
    if os.getenv(ALLOW_REMOTE_VAR) == "1":
        return None
    return (
        f"接続先が手元ではありません: {_url()}\n"
        f"  投稿候補の本文をそこへ送ることになります。個人情報が混じり得ます。\n"
        f"  承知のうえで使うなら {ALLOW_REMOTE_VAR}=1 を置いてください。"
    )


def _model() -> str:
    return os.getenv("ENGIIRO_LOCAL_LLM_MODEL", DEFAULT_MODEL)


def available() -> bool:
    """サーバーが動いていて、指定のモデルが入っているか。

    手元以外へ向いていて許可が無い場合は、**問い合わせもせずに** False を返す。
    """
    if _destination_problem():
        return False
    try:
        with urllib.request.urlopen(f"{_url()}/api/tags", timeout=5) as response:
            tags = json.loads(response.read().decode("utf-8"))
    except Exception:
        return False

    wanted = _model()
    names = [m.get("name", "") for m in tags.get("models") or []]
    # 「qwen3:4b」と「qwen3:4b-instruct」のような表記ゆれを吸収する
    return any(name == wanted or name.startswith(wanted + "-") for name in names)


def describe_setup() -> str:
    """使えないときに、何をすればよいかを返す。"""
    problem = _destination_problem()
    if problem:
        return problem

    return (
        f"手元のLLMが使えません。\n"
        f"  1. Ollama を起動する\n"
        f"  2. モデルを取る:  ollama pull {_model()}\n"
        f"  接続先: {_url()}\n"
        f"  ENGIIRO_LOCAL_LLM_URL / ENGIIRO_LOCAL_LLM_MODEL で変更できます。"
    )


def _post_json(path: str, payload: dict) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(f"{_url()}{path}", data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def _ask(instruction: str, text: str) -> str:
    """1回だけ問い合わせる。JSONで返すよう指定する。"""
    problem = _destination_problem()
    if problem:
        raise RuntimeError(problem)

    result = _post_json("/api/chat", {
        "model": _model(),
        "messages": [
            {"role": "system", "content": instruction},
            {"role": "user", "content": text},
        ],
        "format": "json",
        "stream": False,
        # 判定は毎回同じ答えが返ってほしいので、ばらつきを抑える
        "options": {"temperature": 0.0},
        # qwen3 などは既定で思考を挟む。辞書探索では要らないので切る
        "think": False,
    })
    return (result.get("message") or {}).get("content", "")


EXAMPLES_INSTRUCTION = """あなたは日本語の語の使われ方を説明する係です。

与えられた語を使った短い例文を3つ挙げてください。
**罵倒や攻撃以外の、普通の意味で使う例**を優先してください。
普通の意味が思いつかない語なら、examples を空にしてください。

次のJSONだけを出力してください。説明は書かないでください。
{"examples": ["...", "...", "..."]}"""


def usage_examples(word: str) -> list[str]:
    """その語を使った例文を出してもらう。

    **返ってきた真偽値は当てにならない。** 「ポンコツ」「低能」に対しても
    「普通の意味でも使う」と答え、挙がる例文は罵倒のままだった（実測）。
    そのため真偽は聞かず、例文だけを受け取る。
    無害かどうかは、呼び出し側が judge() にかけて確かめること。
    """
    try:
        raw = _ask(EXAMPLES_INSTRUCTION, word)
        parsed = json.loads(raw)
    except Exception:
        return []
    return [
        e.strip() for e in (parsed.get("examples") or [])
        if isinstance(e, str) and e.strip()
    ]


def judge(text: str) -> dict | None:
    """1件の文章を見てもらう。使えなければ None。

    Returns:
        {"action", "reasonCodes", "words"}
        words は、原因になっていると言われた語の一覧。
        辞書へ入れる候補を探すためのもので、そのまま入れてはいけない。
        日常語と衝突しないかを別に確かめること。
    """
    if not text or not text.strip():
        raise ValueError("空文字列は判定できません。")

    # 送り先の設定ミスは、黙って None を返さずに止める。
    # 1件ずつ静かに失敗すると、候補が出ないだけに見えてしまう。
    problem = _destination_problem()
    if problem:
        raise RuntimeError(problem)

    try:
        raw = _ask(JUDGE_INSTRUCTION, text)
    except Exception as exc:
        print(f"[手元のLLM] 問い合わせできませんでした: {exc}", file=sys.stderr)
        return None

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[手元のLLM] JSONとして読めませんでした: {raw[:120]!r}", file=sys.stderr)
        return None

    codes = [c for c in (parsed.get("codes") or []) if c in REASON_CODES]

    # 長いものは文や句なので捨てる。辞書は語単位で照合するため使えない。
    # プロンプトで指示しても、文をそのまま返してくることがある（実測で確認）。
    words = [
        w.strip() for w in (parsed.get("words") or [])
        if isinstance(w, str) and w.strip() and len(w.strip()) <= MAX_WORD_CHARS
    ]

    # 3つのどれかが立っていれば問題ありとみなす。
    # モデルは「words に語を挙げながら problem を false にする」ことがある
    # （「あいつは本当に無能だ」で words=["無能"] / problem=false を実測）。
    # 辞書の候補を探すのが目的なので、語を挙げた時点で拾っておく。
    problem = bool(parsed.get("problem")) or bool(codes) or bool(words)
    return {
        "action": "block" if problem else "allow",
        "reasonCodes": sorted(set(codes)),
        "words": [w.strip() for w in words],
    }
