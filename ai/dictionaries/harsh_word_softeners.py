"""NGワードの端処理：マサカリ寄りの語を、投稿を止めずに穏当な表現へ置き換える辞書。

docs/ai_transform_design.md 5章の実装。

投稿可否のモデレーション（ai/moderation_rules.py の check_rules）とは別レイヤー。
そちらの NG_WORDS_BLOCK・SELF_HARM_WORDS は「問答無用で block」のままで、
ここでは一切変更しない。

ここに置くのは、check_rules が「rewrite」寄りとして扱っている
（block ほど重篤ではない）マサカリ語だけ。変換処理に入る前に、この辞書で
機械的に置き換えてから、通常の赤ちゃん語・お母さん語変換にかける。

新しい語を追加する場合の判断基準：
- 個人を傷つける可能性はあるが、文脈次第では技術的な指摘（コードレビュー等）
  としても使われる語 → ここに追加してよい
- 自傷・他害・差別・個人情報のように、文脈によらず投稿させるべきでない語 →
  ここには追加せず、ai/moderation_rules.py の NG_WORDS_BLOCK / SELF_HARM_WORDS へ
"""

from __future__ import annotations

HARSH_WORD_SOFTENERS: dict[str, str] = {
    "無能": "まだ慣れていない",
    "役立たず": "これからのびしろがある",
    "使えない": "工夫の余地がある",
    "ありえない": "びっくりした",
}
