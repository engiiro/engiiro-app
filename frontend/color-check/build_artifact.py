#!/usr/bin/env python3
"""このディレクトリの静的サイトを、共有用の1ファイルHTMLにまとめる。

CSS / JS をインライン化し、ロゴPNGを data URI で埋め込む。
生成物は dist/engiiro-color-lab.html（gitignore 済み）。

    python build_artifact.py

出力したHTMLをそのままホスティング先に置けば動く。
Claude Artifact として公開する場合は、外部ホストへのリクエストが
CSPで止められるため、この1ファイル化が必須。
"""

import base64
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "dist" / "engiiro-color-lab.html"
TITLE = "えんじいろ仮配色ラボ"

html = (HERE / "index.html").read_text(encoding="utf-8")
css = (HERE / "style.css").read_text(encoding="utf-8")
js = (HERE / "script.js").read_text(encoding="utf-8")
png = base64.b64encode((HERE / "assets" / "engiiro-crayon-logo.png").read_bytes()).decode("ascii")

if "</style>" in css or "</script>" in js:
    sys.exit("CSS/JS に閉じタグ文字列が含まれているため、インライン化できません")

# Artifact 側が doctype / html / head / body を生成するので、body の中身だけを取り出す。
# body に付いていた data-* 属性は JS で復元する。
body_open = re.search(r"<body([^>]*)>", html).group(1)
init = "".join(
    f'document.body.dataset.{name.replace("-", "")}="{value}";'
    for name, value in re.findall(r'data-([a-z-]+)="([^"]*)"', body_open)
)

inner = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
inner = inner.replace('<script src="./script.js"></script>', "")
inner = inner.replace("./assets/engiiro-crayon-logo.png", f"data:image/png;base64,{png}")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    "\n".join(
        [
            f"<title>{TITLE}</title>",
            "<style>\n" + css + "\n</style>",
            inner.rstrip(),
            "<script>\n" + init + "\n" + js + "\n</script>",
        ]
    )
    + "\n",
    encoding="utf-8",
)
print(f"{OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB)")
