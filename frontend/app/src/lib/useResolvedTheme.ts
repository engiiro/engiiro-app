import { useEffect, useState } from "react";

/*
 * いま実際に効いているテーマ（ノーマル／ダーク／園児UI）を返す。
 *
 * useTheme が持っているのは「利用者の選択」で、"system" のときは
 * どちらの色が出ているかまでは分からない。
 * イラストのように **CSS 変数が届かない外部ファイル**（<img src> の SVG）を
 * 差し替えるには、選択ではなく結果のほうが要る。
 *
 * ★ SVG を <img> で読み込むと、アプリ側の CSS 変数は SVG の中へ継承されない。
 *   frontend/images/*.svg は role="img" のまま3テーマぶんのファイルに分かれていて、
 *   それぞれ自前のフォールバック色を持っている。だから「変数を渡す」のではなく
 *   「ファイルを選ぶ」のが正しい解き方になる。
 *
 * 判定材料は2つだけ：
 *   1. <html data-theme>（useTheme が書き込む。明示指定は常に勝つ）
 *   2. prefers-color-scheme（属性が無い＝"system" のときだけ効く）
 * これは tokens/theme.css の実装契約（DESIGN.md §8.3）と同じ順序。
 */

export type ResolvedTheme = "normal" | "dark" | "kid";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function readResolved(): ResolvedTheme {
  const attribute = document.documentElement.getAttribute("data-theme");
  if (attribute === "normal" || attribute === "dark" || attribute === "kid") {
    return attribute;
  }
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "normal";
}

export function useResolvedTheme(): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(readResolved);

  useEffect(() => {
    function update() {
      setResolved(readResolved());
    }

    /*
     * テーマの選択は App の state だが、この hook は画面のどこからでも使える。
     * 属性そのものを見張っておけば、選択を props で配らずに済む。
     */
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const media = window.matchMedia(DARK_QUERY);
    media.addEventListener("change", update);

    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);

  return resolved;
}
