"""AI_TASK.md から、他の形式の依頼文を生成する。

Markdown を読めない相手（GitHub Copilot など）向けに、
同じ内容をプレーンテキストと Python ファイルで出す。

手で3つ書き分けると必ずずれるので、AI_TASK.md を唯一の出典にしている。
AI_TASK.md を直したら、これを実行してください。

    python ai/dictionaries/build_formats.py
"""

from __future__ import annotations

import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "AI_TASK.md"
TEXT_OUT = HERE / "AI_TASK.txt"
PYTHON_OUT = HERE / "ai_task.py"

GENERATED_NOTE = (
    "このファイルは ai/dictionaries/AI_TASK.md から生成しています。\n"
    "直すときは AI_TASK.md を直して、\n"
    "python ai/dictionaries/build_formats.py を実行してください。"
)


def strip_marks(text: str) -> str:
    """強調とコード記法の記号を落とす。"""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    return text.replace("`", "")


def convert_table(lines: list[str]) -> list[str]:
    """Markdown の表を、そのまま読める形へ直す。"""
    rows = []
    for line in lines:
        cells = [strip_marks(c.strip()) for c in line.strip().strip("|").split("|")]
        if all(set(c) <= set("-: ") for c in cells):
            continue  # 区切り行
        rows.append(cells)
    if not rows:
        return []

    header, *body = rows
    width = max((len(r[0]) for r in body), default=0)
    out = ["  " + " / ".join(header)]
    out.append("  " + "-" * 50)
    for cells in body:
        first = cells[0].ljust(width)
        rest = " … ".join(cells[1:])
        out.append(f"  {first}  {rest}" if rest else f"  {first}")
    return out


def to_plain_text(markdown: str) -> str:
    """Markdown の記号を落として、そのまま読める文章にする。"""
    out = []
    table_buffer: list[str] = []
    in_code = False

    for line in markdown.splitlines():
        if line.strip().startswith("|"):
            table_buffer.append(line)
            continue
        if table_buffer:
            out.extend(convert_table(table_buffer))
            table_buffer = []

        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            out.append("    " + line)
            continue

        if line.startswith("# "):
            title = line[2:].strip()
            out.extend(["=" * 60, title, "=" * 60])
        elif line.startswith("## "):
            out.extend(["", "── " + line[3:].strip() + " " + "─" * 20])
        elif line.startswith("### "):
            out.extend(["", "[ " + line[4:].strip() + " ]"])
        elif line.strip() == "---":
            out.append("-" * 60)
        else:
            out.append(strip_marks(line))

    if table_buffer:
        out.extend(convert_table(table_buffer))

    # 行をまたぐ強調（**〜\n〜**）は1行ずつでは落とせないので、最後にまとめて外す
    joined = "\n".join(out)
    return re.sub(r"\*\*(.+?)\*\*", r"\1", joined, flags=re.DOTALL)


TEMPLATE = '''
# ============================================================
# ここへ候補を書いてください
# ============================================================
# 1行1語。タブ区切りで「語 / 照合方法 / 理由」。
# 照合方法は substring / token / 名詞 のどれか。
#
# 書けたら、この文字列を人間へ渡してください。
# 人間が ai/dictionary_workshop.ipynb で検証します。

候補 = """
# 例（消して構いません）
死ね\tsubstring\t漢字表記。他の語に埋もれない
しね\ttoken\tひらがな。「推しねこ」に部分一致するため1語照合

"""
'''


def to_python(plain: str) -> str:
    """Python ファイル版。docstring に依頼文、下に書き込み欄を置く。

    Copilot のようなコード補完を使う相手は、
    Markdown より .py のほうが文脈として扱いやすい。
    """
    body = plain.replace('"""', "'''")
    return f'"""{body}\n"""\n{TEMPLATE}'


def main() -> int:
    markdown = SOURCE.read_text(encoding="utf-8")
    plain = to_plain_text(markdown)

    header = "\n".join("# " + line for line in GENERATED_NOTE.splitlines())
    TEXT_OUT.write_text(GENERATED_NOTE + "\n\n" + plain + "\n", encoding="utf-8")
    PYTHON_OUT.write_text(header + "\n\n" + to_python(plain), encoding="utf-8")

    print(f"{TEXT_OUT.name}: {len(TEXT_OUT.read_text(encoding='utf-8').splitlines())}行")
    print(f"{PYTHON_OUT.name}: {len(PYTHON_OUT.read_text(encoding='utf-8').splitlines())}行")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
