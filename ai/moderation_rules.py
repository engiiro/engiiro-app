"""規則ベースのモデレーション（NG辞書・伏字回避の正規化・個人情報検出）。

設計書の「NG辞書・正規化・判定は Python のみ」に対応する部分。
マサカリのような文脈依存の判定はここでは行わず、LLM側（transform_api.moderate）が担当する。

検査用文字列と表示用文字列を分けている。正規化した文字列は判定にだけ使い、
利用者へ返す本文には使わない（Issue #4 で合意した「検査用文字列の分離」）。
"""

from __future__ import annotations

import re
import sys
import unicodedata


# ============================================================
# 1. NG辞書
# ============================================================
# 人間が運用で育てる前提の初期値。ここに挙げたものが完全な一覧ではない。
# 追加・削除は人間監督の判断で行うこと。AIが勝手に増やさない。

# 値は「その語をどう照合するか」。
#   None    … 正規化した文字列への部分一致。形態素解析がなくても効く
#   ANY_POS … 形態素解析して、1語として完全一致したときだけ拾う
#   "名詞"  … 上に加えて、その品詞のときだけ拾う
#
# 部分一致だと日常語に当たってしまう語に、形態素解析を使う。
#   「しね」→「推しねこ」／「ころす」→「石ころすら」
#   「バカ」→「ばかり」（助詞）／「クズ」→「くずれる」（動詞）

ANY_POS = "*"

# やわらげても投稿させないもの
NG_WORDS_BLOCK = {
    "死ね": None,
    "殺す": None,
    "消えろ": None,
    "キチガイ": None,
    "ガイジ": None,
    # ひらがな・カタカナ表記は、他の語の一部になりやすいので1語として照合する
    "きえろ": None,
    "きちがい": None,
    # 他の語の一部になりやすいものだけ1語として照合する
    "しね": ANY_POS,     # 「推しねこ」と衝突する
    "ころす": ANY_POS,   # 「石ころすら」と衝突する
    "がいじ": ANY_POS,   # 「これが以上」と衝突する
}

# やわらげれば投稿できるもの（マサカリ寄りの語）
NG_WORDS_REWRITE = {
    "無能": None,
    "役立たず": None,
    "バカ": "名詞",
    "馬鹿": "名詞",
    "カス": "名詞",
    "クズ": "名詞",
    "ボケ": "名詞",
    "マヌケ": "名詞",
}

# 「ゴミ」と「アホ」はここに入れない。
#   ゴミ … 罵倒も「ごみを捨てる」も名詞。直後の語でも分けられない
#   アホ … 「アホらしい」が アホ[名詞]＋らしく[助動詞] に分かれ、
#          「あいつはバカだ」の バカ[名詞]＋だ[助動詞] と同じ形になる
# いずれも実測で確認済み。文脈を見ないと判定できないので、
# LLM側のマサカリ判定に任せる。

# 自傷・他害の疑い。TBD-9（専用応答の設計）が未確定のため、
# ここでは検出して理由コードを立てるだけにする。
# 実際にどう応答するかは人間監督の決定を待つ。
SELF_HARM_WORDS = {
    "死にたい": None,
    "しにたい": None,
    "消えたい": None,
    "きえたい": None,
    "自殺": None,
    "リストカット": None,
    "リスカ": None,
}

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

# 形態素解析へ渡す前の下ごしらえ用。句読点は残す。
# 「、」「。」まで消すと文が繋がって、解析器が語の切れ目を見誤るため。
_MASK_CHARS_LIGHT = "○●◯〇◎＊*✳✱×✕╳・･_＿^ 　\t"
_MASK_PATTERN_LIGHT = re.compile("[" + re.escape(_MASK_CHARS_LIGHT) + "]+")


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


def normalize_for_tokenize(text: str) -> str:
    """形態素解析へ渡す前の下ごしらえ。

    伏字記号は落とすが、句読点と文字種はそのまま残す。
    「バ○カ」を「バカ」に戻して解析器に渡すのが目的。
    aggressive な normalize_for_check を通すと句読点まで消えて、
    解析器が語の切れ目を見誤る。
    """
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKC", text)
    normalized = _INVISIBLE.sub("", normalized)
    normalized = _MASK_PATTERN_LIGHT.sub("", normalized)
    # 「しねええええ」を「しね」に戻す。ここでたたまないと
    # 解析器が し|ねえ|え|ええ に割ってしまい、1語として照合できない。
    # 日本語で同じ文字が3つ以上続くことは少ないので、1文字まで落とす。
    return re.sub(r"(.)\1{2,}", r"\1", normalized)


# ============================================================
# 3. 形態素解析（任意）
# ============================================================
# janome が入っていれば品詞を見た判定を行う。入っていなければ、
# 品詞指定のない語だけを部分一致で拾う。
#
#     python -m pip install janome
#
# 依存を必須にしないのは、Issue #15 が ai/requirements.txt の変更を
# 禁じているため。入れれば精度が上がる、という位置づけにしてある。

_tokenizer = None
_tokenizer_tried = False


def tokenizer_available() -> bool:
    """形態素解析器が使えるか。初回だけ読み込みを試す。

    使えない場合は一度だけ警告を出す。黙って精度が落ちると、
    見逃しているのに動いているように見えてしまうため。
    """
    global _tokenizer, _tokenizer_tried
    if not _tokenizer_tried:
        _tokenizer_tried = True
        try:
            from janome.tokenizer import Tokenizer
            _tokenizer = Tokenizer()
        except ImportError:
            _tokenizer = None
            print(
                "[警告] janome が入っていないため、品詞を見た判定を行いません。\n"
                "        ひらがな表記のNG語（しね など）を見逃します。\n"
                "        python -m pip install janome",
                file=sys.stderr,
            )
    return _tokenizer is not None


def iter_tokens(text: str) -> list[tuple[str, str]]:
    """(表層形, 品詞) の一覧を返す。解析器がなければ空。"""
    if not tokenizer_available():
        return []
    return [
        (token.surface, token.part_of_speech.split(",")[0])
        for token in _tokenizer.tokenize(normalize_for_tokenize(text))
    ]


# 一致した語を打ち消す条件。いずれも直後のトークンを見る。
#
# 罵倒として使うとき、その語のうしろには助詞や助動詞が来る。
#   あいつはバカだ ／ このボケが ／ あんなのクズだ
# 一方、名詞や形容詞が続くときは複合語の一部である。
#   バカでかい ／ ボケ防止 ／ クズ野菜 ／ 馬鹿丁寧
_COMPOUND_POS = ("名詞", "形容詞")

# 「て」「で」「ば」が続くときは、名詞ではなく動詞の活用形。
#   写真がボケていた ／ しねばよかった
_VERB_ENDINGS = ("て", "で", "ば")


def _is_compound_or_conjugation(tokens: list, index: int) -> bool:
    """直後のトークンを見て、罵倒ではないと分かるかを判定する。"""
    if index + 1 >= len(tokens):
        return False
    next_surface, next_pos = tokens[index + 1]
    if next_pos.startswith(_COMPOUND_POS):
        return True
    return next_surface in _VERB_ENDINGS


def match_ng_words(text: str, table: dict) -> list[str]:
    """辞書に載っている語が使われているかを調べる。

    None の語は、正規化した文字列への部分一致で拾う。
    それ以外は、形態素解析して1語として一致したときだけ拾う。
    解析器がなければ後者は調べない。誤検出を出すよりは見逃すほうがましなため。
    """
    hits = []

    checked = normalize_for_check(text)
    for word, rule in table.items():
        if rule is None and normalize_for_check(word) in checked:
            hits.append(word)

    tokenized = {w: r for w, r in table.items() if r is not None}
    if tokenized and tokenizer_available():
        wanted = {normalize_for_check(w): (w, r) for w, r in tokenized.items()}
        tokens = iter_tokens(text)
        for index, (surface, pos) in enumerate(tokens):
            found = wanted.get(normalize_for_check(surface))
            if not found:
                continue
            word, rule = found
            if rule != ANY_POS and not pos.startswith(rule):
                continue
            if _is_compound_or_conjugation(tokens, index):
                continue
            hits.append(word)

    return sorted(set(hits))


# ============================================================
# 4. 個人情報の検出
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

# よく使われるトップレベルドメイン。
# ドットを含む語をURLとみなすのは、ここで終わるときだけにする。
# 「1.5rem」「3.11」のようなバージョンや単位を弾かないため、
# 「技術用語でなければURL」ではなく「TLDで終わるならURL」と判定する。
# 未知のTLDのドメインは通ってしまうが、Issue #11 のとおり
# 誤検出のほうが害が大きいので、通すほうに倒している。
TLDS = {
    "com", "net", "org", "jp", "co", "io", "dev", "app", "ai", "me",
    "info", "biz", "tv", "xyz", "site", "online", "shop", "work",
    "link", "click", "live", "blog", "cloud", "page", "store",
    "life", "world", "today", "news", "email", "tech", "gg", "to",
}


def _looks_like_url(token: str) -> bool:
    """ドットを含む語が、技術用語ではなくURLらしいかを判定する。"""
    lowered = token.lower()
    if lowered in TECH_NAMES:
        return False
    suffix = lowered.rsplit(".", 1)[-1]
    if suffix in TECH_SUFFIXES:   # build.sh のように拡張子と重なるものは技術用語とみなす
        return False
    return suffix in TLDS


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
            if _looks_like_url(token):
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
# 5. まとめ
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
    hit_block = match_ng_words(text, NG_WORDS_BLOCK)
    hit_rewrite = match_ng_words(text, NG_WORDS_REWRITE)
    hit_self_harm = match_ng_words(text, SELF_HARM_WORDS)
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
