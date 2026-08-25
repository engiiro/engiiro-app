"""規則ベースのモデレーション（NG辞書・伏字回避の正規化・個人情報検出）。

設計書の「NG辞書・正規化・判定は Python のみ」に対応する部分。
マサカリのような文脈依存の判定はここでは行わず、LLM側（transform_api.moderate）が担当する。

検査用文字列と表示用文字列を分けている。正規化した文字列は判定にだけ使い、
利用者へ返す本文には使わない（Issue #4 で合意した「検査用文字列の分離」）。
"""

from __future__ import annotations

import re
import unicodedata


# ============================================================
# 1. NG辞書
# ============================================================
# 人間が運用で育てる前提の初期値。ここに挙げたものが完全な一覧ではない。
# 追加・削除は人間監督の判断で行うこと。AIが勝手に増やさない。

# やわらげても投稿させないもの
NG_WORDS_BLOCK = [
    "死ね", "しね", "殺す", "ころす", "消えろ", "きえろ",
    "キチガイ", "きちがい", "ガイジ", "がいじ",
]

# やわらげれば投稿できるもの（マサカリ寄りの語）
#
# ここには「部分一致させても誤検出しない語」だけを置く。
# 「バカ」「クズ」「カス」「ゴミ」は、ひらがなにそろえると
# 「ばかり」「くずれる」「貸す」「申し込み」に一致してしまうため入れない。
# この種の語は文脈を見ないと判定できないので、LLM側のマサカリ判定に任せる。
NG_WORDS_REWRITE = [
    "無能", "役立たず",
]

# 自傷・他害の疑い。TBD-9（専用応答の設計）が未確定のため、
# ここでは検出して理由コードを立てるだけにする。
# 実際にどう応答するかは人間監督の決定を待つ。
SELF_HARM_WORDS = [
    "死にたい", "しにたい", "消えたい", "きえたい",
    "自殺", "リストカット", "リスカ",
]

# TBD-9 が決まるまでの暫定。人間監督の決定で変更すること。
SELF_HARM_ACTION = "block"


# ============================================================
# 2. 伏字回避の正規化
# ============================================================

# 幅ゼロ文字・制御文字
_INVISIBLE = re.compile(r"[​-‏‪-‮⁠-⁤﻿­]")

# 伏字に使われやすい記号。文字と文字の間に挟んで検出を逃れる用途を想定する。
_MASK_CHARS = "○●◯〇◎＊*✳✱×✕╳・･.,、。_＿-－ー‐―~〜^ 　\t"
_MASK_PATTERN = re.compile("[" + re.escape(_MASK_CHARS) + "]+")


def normalize_for_check(text: str) -> str:
    """判定用の文字列を作る。表示には使わない。

    - 全角英数字・半角カナなどを NFKC でそろえる（ﾀﾞﾒ → ダメ）
    - 幅ゼロ文字を落とす
    - 伏字記号を落として「し ね」「し○ね」を「しね」にする
    - 3文字以上の繰り返しを2文字にたたむ
    - カタカナをひらがなにそろえる

    濁点そのものは落とさない。落とすと「ダメ」が「ため」になり、
    「バカ」が「はか」になって「はかる」に一致するなど、
    誤検出のほうが害が大きいため。
    「し゛ね」のような濁点を使った回避は、この関数では防げない。
    """
    if not text:
        return ""

    normalized = unicodedata.normalize("NFKC", text)
    normalized = _INVISIBLE.sub("", normalized)
    normalized = normalized.lower()
    normalized = _MASK_PATTERN.sub("", normalized)

    # 「あああああ」→「filtered」のような引き延ばしをたたむ
    normalized = re.sub(r"(.)\1{2,}", r"\1\1", normalized)

    # カタカナ → ひらがな
    normalized = "".join(
        chr(ord(ch) - 0x60) if "ァ" <= ch <= "ヶ" else ch
        for ch in normalized
    )
    return normalized


# ============================================================
# 3. 個人情報の検出
# ============================================================
# Issue #11 の「URL原則禁止と技術用語の衝突」への対応。
# ドットが入っていても、技術用語やファイル名はURLとして扱わない。

# ソースコードやツールでよく使う拡張子・ファイル名
TECH_SUFFIXES = {
    "js", "mjs", "cjs", "ts", "tsx", "jsx", "vue", "svelte",
    "py", "rb", "go", "rs", "java", "kt", "php", "cs", "swift",
    "json", "yaml", "yml", "toml", "ini", "cfg", "conf", "lock", "env",
    "md", "txt", "csv", "tsv", "sql", "sh", "bat", "ps1",
    "html", "css", "scss", "sass", "less",
    "png", "jpg", "jpeg", "webp", "svg", "gif", "ico",
    "log", "tmp", "bak", "map", "min",
}

# よく話題に出る製品名。拡張子だけでは拾えないもの。
TECH_NAMES = {
    "react.js", "next.js", "node.js", "vue.js", "nuxt.js", "three.js",
    "express.js", "d3.js", "chart.js", "socket.io", "vite.js",
}

_URL_SCHEME = re.compile(r"https?://\S+", re.IGNORECASE)
_DOT_TOKEN = re.compile(r"[0-9a-z_-]+(?:\.[0-9a-z_-]+)+", re.IGNORECASE)
_EMAIL = re.compile(r"[0-9a-z._%+-]+@[0-9a-z.-]+\.[a-z]{2,}", re.IGNORECASE)
_PHONE = re.compile(r"0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}")
_POSTAL = re.compile(r"\d{3}-\d{4}")
_ACCOUNT_ID = re.compile(r"(?<![0-9a-z])@[0-9a-z_]{3,}", re.IGNORECASE)


def _looks_like_tech_term(token: str) -> bool:
    """ドットを含む語が、URLではなく技術用語かを判定する。"""
    lowered = token.lower()
    if lowered in TECH_NAMES:
        return True
    suffix = lowered.rsplit(".", 1)[-1]
    return suffix in TECH_SUFFIXES


def find_personal_data(text: str) -> list[str]:
    """個人が特定できる情報を探す。見つかった種類を返す。

    正規化前の原文に対して行う。正規化すると電話番号のハイフンや
    メールのドットが消えてしまい、かえって検出できなくなるため。
    """
    found = []

    if _EMAIL.search(text):
        found.append("email")
    if _URL_SCHEME.search(text):
        found.append("url")
    else:
        # スキームなしのドメインらしき語。技術用語は除外する。
        for token in _DOT_TOKEN.findall(text):
            if _EMAIL.fullmatch(token):
                continue
            if not _looks_like_tech_term(token):
                found.append("url")
                break
    # 電話番号を先に見る。郵便番号の形（3桁-4桁）は
    # 「090-1234-5678」の後半にも一致してしまうため。
    if _PHONE.search(text):
        found.append("phone")
    elif _POSTAL.search(text):
        found.append("postal_code")
    if _ACCOUNT_ID.search(text):
        found.append("account_id")

    return sorted(set(found))


# ============================================================
# 4. まとめ
# ============================================================

def check_rules(text: str) -> dict:
    """規則ベースの判定をまとめて行う。

    Returns:
        {
          "action": "allow" | "rewrite_required" | "block",
          "reasonCodes": [...],
          "details": {...},   # どの語・種類で引っかかったか。ログには残さないこと
        }
    """
    checked = normalize_for_check(text)

    hit_block = [w for w in NG_WORDS_BLOCK if normalize_for_check(w) in checked]
    hit_rewrite = [w for w in NG_WORDS_REWRITE if normalize_for_check(w) in checked]
    hit_self_harm = [w for w in SELF_HARM_WORDS if normalize_for_check(w) in checked]
    hit_personal = find_personal_data(text)

    reason_codes = []
    if hit_block:
        reason_codes.append("ng_word")
    if hit_self_harm:
        reason_codes.append("self_harm")
    if hit_personal:
        reason_codes.append("personal_data")
    if hit_rewrite:
        reason_codes.append("harsh_criticism")

    if hit_block or hit_personal:
        action = "block"
    elif hit_self_harm:
        action = SELF_HARM_ACTION
    elif hit_rewrite:
        action = "rewrite_required"
    else:
        action = "allow"

    return {
        "action": action,
        "reasonCodes": sorted(set(reason_codes)),
        "details": {
            "ng_word": hit_block,
            "harsh_criticism": hit_rewrite,
            "self_harm": hit_self_harm,
            "personal_data": hit_personal,
        },
    }


def merge_verdicts(*verdicts: dict) -> dict:
    """複数の判定結果を、厳しいほうへ寄せて1つにまとめる。"""
    order = {"allow": 0, "rewrite_required": 1, "block": 2}
    action = "allow"
    codes: list[str] = []
    for verdict in verdicts:
        if order[verdict["action"]] > order[action]:
            action = verdict["action"]
        codes.extend(verdict.get("reasonCodes") or [])
    return {"action": action, "reasonCodes": sorted(set(codes))}
