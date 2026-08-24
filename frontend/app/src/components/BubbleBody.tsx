import type { ReactElement } from "react";

import { STAMP_MARKER } from "../data/constants";
import { STAMP_CATALOG } from "../data/stamps";
import { cx } from "../lib/cx";
import "./BubbleBody.css";

/*
 * バブル・あやすの本文（FR-POST-005：挿入したスタンプが本文の該当位置に表示される）。
 *
 * 本文には `:nemui:` のような目印でスタンプが埋め込まれている。ここで図に置き換える。
 * 知らない目印はそのままの文字として出す（勝手に消さない）。
 *
 * URL の自動リンク化はしない（FR-MOD-021 / OUT-008）。
 * そもそも URL は保存されないので、リンク化の処理そのものを置かない。
 */

const STAMP_IDS = new Set(STAMP_CATALOG.map((stamp) => stamp.id));

export function BubbleBody({
  body,
  className,
}: {
  readonly body: string;
  readonly className?: string;
}) {
  return (
    <p className={cx("t-bubble-body", "eg-prose", className)}>{renderWithStamps(body)}</p>
  );
}

function renderWithStamps(body: string): (string | ReactElement)[] {
  const out: (string | ReactElement)[] = [];
  let lastIndex = 0;
  let key = 0;

  // 正規表現は毎回作り直す（グローバルフラグの lastIndex を持ち越さないため）
  const pattern = new RegExp(STAMP_MARKER.source, "g");
  let match = pattern.exec(body);
  while (match !== null) {
    if (!STAMP_IDS.has(match[1])) {
      match = pattern.exec(body);
      continue;
    }
    if (match.index > lastIndex) {
      out.push(body.slice(lastIndex, match.index));
    }
    out.push(<StampGlyph key={key} id={match[1]} />);
    key += 1;
    lastIndex = match.index + match[0].length;
    match = pattern.exec(body);
  }
  if (lastIndex < body.length) {
    out.push(body.slice(lastIndex));
  }
  return out;
}

/**
 * スタンプの絵柄。
 * 見た目は未定（DESIGN.md §11）なので、ここにあるのは仮の図形。差し替え前提。
 */
export function StampGlyph({ id, picker = false }: { readonly id: string; readonly picker?: boolean }) {
  const stamp = STAMP_CATALOG.find((item) => item.id === id);
  return (
    <span
      className={cx("eg-stamp", picker && "eg-stamp--picker")}
      role="img"
      aria-label={stamp ? stamp.name + "のスタンプ" : "スタンプ"}
    >
      <StampShape id={id} />
    </span>
  );
}

const SHAPE_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function StampShape({ id }: { readonly id: string }) {
  switch (id) {
    case "nemui":
      return (
        <svg {...SHAPE_PROPS}>
          <path d="M3.4 5.6h3.4L3.4 9.4h3.4" />
          <path d="M9.6 3.2h3.4L9.6 7h3.4" />
          <path d="M4.6 12.4h5" />
        </svg>
      );
    case "ogya":
      return (
        <svg {...SHAPE_PROPS}>
          <circle cx="8" cy="8" r="5.4" />
          <path d="M5.6 6.4h1.2M9.2 6.4h1.2" />
          <path d="M5.8 10.4c1.4-1.4 3-1.4 4.4 0" />
        </svg>
      );
    case "bottle":
      return (
        <svg {...SHAPE_PROPS}>
          <path d="M6.4 2h3.2v2H6.4z" />
          <path d="M5.4 6c0-1 .8-1.8 1.8-1.8h1.6c1 0 1.8.8 1.8 1.8v6.4c0 1-.8 1.8-1.8 1.8H7.2c-1 0-1.8-.8-1.8-1.8z" />
        </svg>
      );
    case "pacifier":
      return (
        <svg {...SHAPE_PROPS}>
          <circle cx="8" cy="3.6" r="2" />
          <ellipse cx="8" cy="8.4" rx="4.4" ry="2.5" />
          <path d="M6.6 10.6c.2 1.8.7 3 1.4 3.8.7-.8 1.2-2 1.4-3.8" />
        </svg>
      );
    case "heart":
      return (
        <svg {...SHAPE_PROPS}>
          <path d="M8 13.4S2.4 10 2.4 6.2a2.9 2.9 0 0 1 5.6-1 2.9 2.9 0 0 1 5.6 1c0 3.8-5.6 7.2-5.6 7.2Z" />
        </svg>
      );
    case "star":
      return (
        <svg {...SHAPE_PROPS}>
          <path d="m8 2.2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z" />
        </svg>
      );
    case "cloud":
      return (
        <svg {...SHAPE_PROPS}>
          <path d="M4.6 11.6a2.8 2.8 0 0 1 .3-5.6 3.6 3.6 0 0 1 6.9 1 2.4 2.4 0 0 1-.5 4.6z" />
        </svg>
      );
    case "drop":
      return (
        <svg {...SHAPE_PROPS}>
          <path d="M8 2.2s4 4.8 4 7.6a4 4 0 0 1-8 0c0-2.8 4-7.6 4-7.6Z" />
        </svg>
      );
    default:
      return (
        <svg {...SHAPE_PROPS}>
          <circle cx="8" cy="8" r="5" />
        </svg>
      );
  }
}
