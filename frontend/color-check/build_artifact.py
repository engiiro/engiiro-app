#!/usr/bin/env python3
"""このディレクトリの静的サイトを、共有用の1ファイルHTMLにまとめる。

    python build_artifact.py

生成物は dist/engiiro-color-lab.html（gitignore 済み）。そのままホスティング先に置けば動く。

Claude Artifact として公開する場合、外部ホストへのリクエストは CSP で止められるため、
この1ファイル化が必須になる（唯一の例外が Google Fonts）。まとめているもの：

  * style.css / script.js  … インライン化
  * assets/illust/*.svg    … data URI。3テーマぶんを CC_ILLUST に入れて JS へ渡す
  * assets/*.png           … data URI
  * <html> の data-* 属性  … Artifact 側が html / body タグを生成するので JS で復元する
  * Google Fonts の <link> … head が使えないので本文の先頭へ移す（body 内でも効く）
"""

import base64
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "dist" / "engiiro-color-lab.html"
TITLE = "えんじいろ仮配色ラボ"
THEMES = ("normal", "dark", "kid")

html = (HERE / "index.html").read_text(encoding="utf-8")
css = (HERE / "style.css").read_text(encoding="utf-8")
js = (HERE / "script.js").read_text(encoding="utf-8")

if "</style>" in css or "</script>" in js:
    sys.exit("CSS/JS に閉じタグ文字列が含まれているため、インライン化できません")


def data_uri(path: pathlib.Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


# ── <html> の data-* 属性。Artifact 側が html タグを作るので JS で書き戻す ──
html_open = re.search(r"<html([^>]*)>", html).group(1)
init_lines = [
    f'document.documentElement.setAttribute("{name}", "{value}");'
    for name, value in re.findall(r'(data-[a-z-]+)="([^"]*)"', html_open)
]

# ── イラストは3テーマぶんを埋め込み、JS の illustSrc() に拾わせる ──
illust = {
    theme: data_uri(HERE / "assets" / "illust" / f"soft-bubble-haven-{theme}.svg", "image/svg+xml")
    for theme in THEMES
}
init_lines.append("window.CC_ILLUST = " + json.dumps(illust) + ";")

# ── 本文。head は捨てて、必要なものだけ拾い直す ──
font_links = re.findall(r'<link[^>]*href="https://fonts\.googleapis\.com[^"]*"[^>]*>', html)

inner = re.search(r"<body[^>]*>(.*)</body>", html, re.S).group(1)
inner = inner.replace('<script src="./script.js"></script>', "")
inner = inner.replace(
    "./assets/engiiro-crayon-logo.png",
    data_uri(HERE / "assets" / "engiiro-crayon-logo.png", "image/png"),
)
# 初期表示のイラスト。切り替えたあとは CC_ILLUST 側が使われる
inner = inner.replace("./assets/illust/soft-bubble-haven-dark.svg", illust["dark"])

if "./assets/" in inner:
    sys.exit("埋め込みきれていない ./assets/ への参照が残っています")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(
    "\n".join(
        [
            f"<title>{TITLE}</title>",
            *font_links,
            "<style>\n" + css + "\n</style>",
            inner.rstrip(),
            "<script>\n" + "\n".join(init_lines) + "\n" + js + "\n</script>",
        ]
    )
    + "\n",
    encoding="utf-8",
)
print(f"{OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB)")
