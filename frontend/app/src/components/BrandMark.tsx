import { cx } from "../lib/cx";
import "./BrandMark.css";

/*
 * ブランドの印。しっぽの付いた吹き出しの中に「…」。
 *
 * ★ これは利用者の絵柄ではない。アバターを自動生成しない規則（DESIGN.md §0.1-3）は
 *   人の識別に使う絵柄の話で、サービス自身の印はその対象ではない。
 *   どの利用者にも同じものしか出ないので、識別の手がかりにはならない。
 *
 * 「…」にしているのは、このサービスが**言いよどんでいる状態**の受け皿だから。
 * 顔や表情を入れるとキャラクターの印象が先に立ってしまう。
 *
 * 色は currentColor と --accent-soft。テーマの切替にそのまま追随する。
 */

export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <svg
      className={cx("eg-brandmark", className)}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 4.4c6.5 0 11.8 4 11.8 9.4 0 5.3-5.3 9.4-11.8 9.4-1.2 0-2.3-.1-3.4-.4-1.9 2.2-4.6 3.6-7.6 4.2.9-1.7 1.4-3.3 1.4-4.9-1.4-1.6-2.2-3.6-2.2-5.7 0-5.4 5.3-9.4 11.8-9.4Z"
        fill="var(--accent-soft)"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle className="eg-brandmark__dot" cx="10.6" cy="13.6" r="1.5" fill="currentColor" />
      <circle className="eg-brandmark__dot" cx="16" cy="13.6" r="1.5" fill="currentColor" />
      <circle className="eg-brandmark__dot" cx="21.4" cy="13.6" r="1.5" fill="currentColor" />
    </svg>
  );
}
