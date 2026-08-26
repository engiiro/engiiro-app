"""外部のモデレーションAPIを、判定の一層として足す。

**判定API（transform_api.moderate）では使わない。**
人間監督の決定により、判定は形態素解析と辞書だけで行う。

ここは**辞書へ入れる語を探すための道具**である。
規則で拾えない言い回しを専用のモデレーションサービスに見つけさせ、
辞書を育てるのに使う。呼び出し元は transform_api.moderate_by_llm。

設定していなければ何もしない。落ちていても他は動く。

新しい依存は増やしていない。標準ライブラリのHTTPだけを使う。

## 使えるサービス

環境変数を設定したものだけが有効になる。複数設定すればすべて使う。

料金と無料枠の条件は各社の都合で変わるので、ここには断定を書かない。
下の記述は「どの環境変数を読むか」だけを正とする。

OpenAI Moderation
    OPENAI_API_KEY=sk-...
    ※ モデレーションの呼び出し自体に課金は無いが、利用可否は
      アカウント側の設定に依存する。実測では、支払い情報を
      登録していないアカウントは 429 で呼べなかった

Azure AI Content Safety
    AZURE_CONTENT_SAFETY_ENDPOINT=https://<名前>.cognitiveservices.azure.com
    AZURE_CONTENT_SAFETY_KEY=...

Google Cloud Natural Language
    GOOGLE_CLOUD_NL_API_KEY=...
    ※ AI Studio のキーとは別。GCPプロジェクトで
      Cloud Natural Language API を有効にして発行する

chakoshi（NTT。日本語のニュアンスに強い）
    CHAKOSHI_API_KEY=...
    CHAKOSHI_GUARDRAIL_ID=...
    CHAKOSHI_API_URL=...  （任意。既定は下の DEFAULT_CHAKOSHI_URL）
    ※ キーだけでは呼べない。管理画面でポリシーを設定して
      ガードレールIDを発行する必要がある
    ※ ベータ版のため、NTTは本番環境での使用を推奨していない

## 検出できた個人情報は送らない

呼び出し元（transform_api.moderate_by_llm）は、規則で personal_data を
検出した時点で block を返し、外部へもLLMへも送らない。外部サービスが増えるほど、投稿を
渡す相手も増えるためである。

ただし保証できるのは「検出できたものは送らない」までである。
規則の側は正規表現とTLD一覧による当て推量なので、知らないTLD、
想定外の書式、文脈でしか個人情報にならないもの（勤務先と最寄り駅を
別々の文で書く、など）は素通りしうる。**取りこぼした個人情報が
外部へ渡る可能性は残る。** ここを許容するかは人間監督の判断事項。

## 性的な内容の扱い

人間監督の決定により、一律には禁止しない。文脈で判断する。
成人向け作品の制作・業務の話や、露骨でない子どもっぽい下ネタは通す。

そのため、各サービスが返す一律の sexual カテゴリは使わない。
これを block へ対応づけると「成人向けゲームのシナリオを書いている」まで
弾いてしまう。文脈を見ないと分けられない。

例外は未成年に関するもの。OpenAI の sexual/minors だけは、
文脈を問わず block なので対応づけている。
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

TIMEOUT_SECONDS = 5

# Azure の severity は 0 / 2 / 4 / 6。どこから弾くか。
# 実データで調整が要る。低くすると「つらい」のような弱音を巻き込む。
AZURE_SEVERITY_THRESHOLD = 4

# 対応づけていないカテゴリと、その理由。
# ここを機械的に足すと無害な投稿を弾くので、増やすときは実測してから。
UNMAPPED = {
    # 一律のsexualは使わない。成人向け作品の制作・業務の話を巻き込むため
    "openai": ["sexual", "illicit"],
    "azure": ["Sexual"],
    # Googleは「話題の分類」が多い。_GOOGLE_TO_REASON の注記を参照
    "google": [
        "Death, Harm & Tragedy", "Health", "Religion & Belief",
        "Politics", "Finance", "Legal", "War & Conflict",
        "Firearms & Weapons", "Public Safety", "Illicit Drugs", "Sexual",
    ],
    # chakoshi は管理画面で有効化したカテゴリだけが返る。
    # ここに挙げたものは「意図して対応づけない」もので、警告も出さない。
    # 理由は _CHAKOSHI_TO_REASON の注記を参照。
    "chakoshi": [
        "sexual",
        "illicit/drugs", "illicit/property", "illicit/financial",
        "illicit/cybercrime",
        "privacy/request",
    ],
}

# 各サービスのカテゴリを、えんじいろの理由コードへ対応づける。
# 理由コードは仕様書 v0.3 で「コード例（仮）」扱い。
_OPENAI_TO_REASON = {
    "self-harm": "self_harm",
    "self-harm/intent": "self_harm",
    "self-harm/instructions": "self_harm",
    "violence": "harm_others",
    "violence/graphic": "harm_others",
    "illicit/violent": "harm_others",
    "harassment/threatening": "harm_others",
    "hate/threatening": "harm_others",
    "hate": "ng_word",
    "harassment": "harsh_criticism",
    # 未成年に関するものだけは、文脈を問わず block
    "sexual/minors": "sexual_explicit",
}

_AZURE_TO_REASON = {
    "SelfHarm": "self_harm",
    "Violence": "harm_others",
    "Hate": "ng_word",
}

# Google Cloud Natural Language の confidence は 0.00〜1.00。どこから拾うか。
#
# 日本語で実測した値（2026-08）。下げてはいけない根拠になっている。
#   「あいつは本当に無能だ。役立たず。」   Toxic 0.837 / Insult 0.825 / Violent 0.774
#   「うんこもらしちゃったのー。」         Profanity 0.716 / Sexual 0.628
#   「つらい。しんどい。もう限界かも。」   Health 0.606（対応づけていない）
#   「サーバーが死んだ。」                 Death,Harm&Tragedy 0.825（対応づけていない）
#
# 0.7 まで下げると、ただの罵倒が Violent で block になり、
# 幼児的な下ネタが Profanity で rewrite_required になる。どちらも方針に反する。
GOOGLE_CONFIDENCE_THRESHOLD = 0.8

# カテゴリごとの上書き。block へ回すものは余裕を持たせる。
#
# Violent は日本語の罵倒に対して高く出る。上の実測で 0.774。
# 既定の0.8では余裕が0.03しかなく、言い回しが少し違えば block になる。
# 誤って block にするのは利用者から見て取り返しがつかないので、ここだけ上げる。
# 実際の脅迫は「殺してやる。」で 0.996 出ているため、0.95 でも拾える。
GOOGLE_CATEGORY_THRESHOLDS = {"Violent": 0.95}

# Google のカテゴリ16種には「話題の分類」が混ざっている。
# 有害性を示すものだけを対応づける。
#
# 対応づけないもの（無害な投稿を弾いてしまうため）:
#   Death, Harm & Tragedy … 話題の分類。「祖父が亡くなった」も高く出る。
#                            自傷の意図とは別物なので self_harm にはしない
#   Health / Religion & Belief / Politics / Finance / Legal
#   War & Conflict / Firearms & Weapons / Public Safety / Illicit Drugs
#                         … いずれも話題の分類であって有害性ではない
#   Sexual                … 一律には禁止しない方針なので使わない。
#                            成人向け作品の制作・業務の話を巻き込む。
#                            文脈を見ないと分けられない
#
# つまり Google は自傷の検出には向かない。日本語の自傷は chakoshi が拾える。
#
# なお、このモジュールは判定APIでは使わない。辞書へ入れる語を探す道具である。
_GOOGLE_TO_REASON = {
    "Derogatory": "ng_word",
    "Violent": "harm_others",
    "Toxic": "harsh_criticism",
    "Insult": "harsh_criticism",
    "Profanity": "harsh_criticism",
}

# chakoshi の既定エンドポイント。ベータのうちは変わりうるので環境変数で上書きできる。
DEFAULT_CHAKOSHI_URL = "https://api.beta.chakoshi.ntt.com/v1/guardrails/apply"

# chakoshi のカテゴリ名を、えんじいろの理由コードへ対応づける。
#
# 実APIで確認した16カテゴリ（2026-08）。有効にするものは
# 管理画面のポリシー設定で決まるので、ここに無い名前が来ることもある。
# その場合は警告を出して無視する。知らない名前を勝手に block へ回すと
# 意図しない拒否になるため。
#
# 対応づけないもの:
#   sexual              一律に禁止しない方針。文脈を見ないと分けられない
#   illicit/drugs       「薬を飲んで寝た」のような話題と区別できない恐れ
#   illicit/property
#   illicit/financial
#   illicit/cybercrime  エンジニアは脆弱性や攻撃手法を日常的に話す。
#                       「SQLインジェクションを直した」で立つ可能性がある
#   privacy/request     他人の情報を尋ねる行為。えんじいろの方針が未定
_CHAKOSHI_TO_REASON = {
    "violence": "harm_others",
    "violence/graphic": "harm_others",
    "illicit/weapons": "harm_others",
    "illicit/bio": "harm_others",
    "self-harm": "self_harm",
    "hate": "ng_word",
    "harassment": "harsh_criticism",
    "sexual/minors": "sexual_explicit",
    "privacy/doxxing": "personal_data",
    "privacy/self": "personal_data",
}

# どの理由コードなら block か。自傷・他害は人間監督の決定により必ず block。
_BLOCK_REASONS = {"self_harm", "harm_others", "ng_word", "sexual_explicit",
                  "personal_data"}

_warned: set[str] = set()


def _warn_once(key: str, message: str):
    """同じ警告を何度も出さない。1件ごとに出ると読めなくなる。"""
    if key in _warned:
        return
    _warned.add(key)
    print(f"[外部モデレーション] {message}", file=sys.stderr)


def _post_json(url: str, payload: dict, headers: dict) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST")
    request.add_header("Content-Type", "application/json")
    for name, value in headers.items():
        request.add_header(name, value)
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def _to_verdict(reasons: list[str]) -> dict:
    codes = sorted(set(reasons))
    if _BLOCK_REASONS & set(codes):
        action = "block"
    elif codes:
        action = "rewrite_required"
    else:
        action = "allow"
    return {"action": action, "reasonCodes": codes}


# ============================================================
# OpenAI Moderation
# ============================================================

def openai_available() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def check_openai(text: str) -> dict | None:
    """OpenAI Moderation に見てもらう。設定が無ければ None。"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        result = _post_json(
            "https://api.openai.com/v1/moderations",
            {"model": "omni-moderation-latest", "input": text},
            {"Authorization": f"Bearer {api_key}"},
        )
    except Exception as exc:
        _warn_once("openai", f"OpenAI に問い合わせできませんでした: {exc}")
        return None

    results = result.get("results") or []
    if not results:
        return None

    categories = results[0].get("categories") or {}
    reasons = [
        _OPENAI_TO_REASON[name]
        for name, flagged in categories.items()
        if flagged and name in _OPENAI_TO_REASON
    ]
    return _to_verdict(reasons)


# ============================================================
# Azure AI Content Safety
# ============================================================

def azure_available() -> bool:
    return bool(os.getenv("AZURE_CONTENT_SAFETY_ENDPOINT")
                and os.getenv("AZURE_CONTENT_SAFETY_KEY"))


def check_azure(text: str) -> dict | None:
    """Azure AI Content Safety に見てもらう。設定が無ければ None。"""
    endpoint = os.getenv("AZURE_CONTENT_SAFETY_ENDPOINT")
    api_key = os.getenv("AZURE_CONTENT_SAFETY_KEY")
    if not endpoint or not api_key:
        return None

    url = endpoint.rstrip("/") + "/contentsafety/text:analyze?api-version=2024-09-01"
    try:
        result = _post_json(url, {"text": text}, {"Ocp-Apim-Subscription-Key": api_key})
    except Exception as exc:
        _warn_once("azure", f"Azure に問い合わせできませんでした: {exc}")
        return None

    reasons = []
    for entry in result.get("categoriesAnalysis") or []:
        category = entry.get("category")
        severity = entry.get("severity", 0)
        if category in _AZURE_TO_REASON and severity >= AZURE_SEVERITY_THRESHOLD:
            reasons.append(_AZURE_TO_REASON[category])
    return _to_verdict(reasons)


# ============================================================
# Google Cloud Natural Language（Text Moderation）
# ============================================================

def google_available() -> bool:
    return bool(os.getenv("GOOGLE_CLOUD_NL_API_KEY"))


def check_google(text: str) -> dict | None:
    """Google Cloud Natural Language に見てもらう。設定が無ければ None。"""
    api_key = os.getenv("GOOGLE_CLOUD_NL_API_KEY")
    if not api_key:
        return None

    # キーはURLクエリではなくヘッダーへ入れる。URLはアクセスログや
    # プロキシの記録へそのまま残るので、クエリに載せると漏れる経路が増える。
    # ヘッダー方式で同じ結果が返ることは実APIで確認済み。
    url = "https://language.googleapis.com/v2/documents:moderateText"
    payload = {
        "document": {"type": "PLAIN_TEXT", "content": text, "languageCode": "ja"}
    }
    try:
        result = _post_json(url, payload, {"X-Goog-Api-Key": api_key})
    except Exception as exc:
        _warn_once("google", f"Google Cloud NL に問い合わせできませんでした: {exc}")
        return None

    reasons = []
    for category in result.get("moderationCategories") or []:
        name = category.get("name")
        if name not in _GOOGLE_TO_REASON:
            continue
        threshold = GOOGLE_CATEGORY_THRESHOLDS.get(name, GOOGLE_CONFIDENCE_THRESHOLD)
        if category.get("confidence", 0.0) >= threshold:
            reasons.append(_GOOGLE_TO_REASON[name])
    return _to_verdict(reasons)


# ============================================================
# chakoshi（NTT）
# ============================================================

def chakoshi_available() -> bool:
    return bool(os.getenv("CHAKOSHI_API_KEY") and os.getenv("CHAKOSHI_GUARDRAIL_ID"))


def _normalize_category(name: str) -> str:
    """カテゴリ名の書き方の違いを吸収する。

    実APIは「self-harm」「violence/graphic」のように
    ハイフンとスラッシュを使う。前後の空白と大文字小文字だけそろえる。
    """
    return (name or "").strip().lower()


def check_chakoshi(text: str) -> dict | None:
    """chakoshi に見てもらう。設定が無ければ None。

    有効なカテゴリは管理画面のポリシー設定で決まるため、
    こちらで一覧を先に決めきれない。知らない名前が来たら警告して無視する。
    """
    api_key = os.getenv("CHAKOSHI_API_KEY")
    guardrail_id = os.getenv("CHAKOSHI_GUARDRAIL_ID")
    if not api_key or not guardrail_id:
        return None

    url = os.getenv("CHAKOSHI_API_URL") or DEFAULT_CHAKOSHI_URL
    try:
        result = _post_json(
            url,
            {"input": text, "guardrail_id": guardrail_id},
            {"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
        )
    except Exception as exc:
        _warn_once("chakoshi", f"chakoshi に問い合わせできませんでした: {exc}")
        return None

    # 実APIは assessments の下に入れ子で返す。
    # MCPサーバーのREADMEにある例は、そこを抽出した後の形だった。
    # 将来どちらに変わっても読めるよう、両方見る。
    body = result.get("assessments") or result
    outcome = body.get("guardrails_result") or {}

    reasons = []
    unknown = []

    moderation = outcome.get("moderation") or {}
    for name, detail in (moderation.get("categories") or {}).items():
        if not (detail or {}).get("detected"):
            continue
        key = _normalize_category(name)
        if key in _CHAKOSHI_TO_REASON:
            reasons.append(_CHAKOSHI_TO_REASON[key])
        elif key not in UNMAPPED["chakoshi"]:
            unknown.append(name)

    if unknown:
        _warn_once(
            "chakoshi-unknown",
            "対応づけていないカテゴリが検出されました: "
            f"{sorted(set(unknown))}。"
            "external_moderation.py の _CHAKOSHI_TO_REASON へ追加してください。"
            "いまは無視しています。",
        )

    # 個人情報フィルタ。何か見つかれば個人情報として扱う
    if (outcome.get("pii_filter") or {}).get("detect_pii_result"):
        reasons.append("personal_data")

    # キーワードフィルタは運用側が明示的に登録した語なので、当たれば弾く
    if (outcome.get("keyword_filter") or {}).get("matched"):
        reasons.append("ng_word")

    return _to_verdict(reasons)


# ============================================================
# まとめ
# ============================================================

PROVIDERS = {
    "openai": (openai_available, check_openai),
    "azure": (azure_available, check_azure),
    "google": (google_available, check_google),
    "chakoshi": (chakoshi_available, check_chakoshi),
}


def enabled_providers() -> list[str]:
    """設定されているサービスの名前を返す。"""
    return [name for name, (is_available, _) in PROVIDERS.items() if is_available()]


def check(text: str) -> list[dict]:
    """設定されているサービス全部に見てもらい、判定を集めて返す。

    設定が無ければ空。落ちていたら、そのサービスの分だけ抜ける。
    ここで例外は投げない。外部サービスの都合で投稿処理を止めないため。
    """
    verdicts = []
    for name, (is_available, checker) in PROVIDERS.items():
        if not is_available():
            continue
        verdict = checker(text)
        if verdict:
            verdicts.append(dict(verdict, provider=name))
    return verdicts
