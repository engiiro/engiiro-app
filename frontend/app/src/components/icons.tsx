
/*
 * アイコン。
 *
 * DESIGN.md §11 の通り、アイコンセットは未定。ここにあるのは仮のもので、
 * 差し替え前提。currentColor で描くので、色はトークン側で決まる。
 *
 * 「わかるわぁ」の哺乳瓶は、DESIGN.md §4 が指定している唯一のアイコン。
 * これは「わかるわぁ」というリアクションの絵柄であって、別のリアクションではない（FR-REACT-009）。
 */

type IconProps = {
  readonly className?: string;
};

const BASE_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** おぎゃー：ないてる しずく */
export function IconOgya({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M8 1.8c0 0 4.2 5 4.2 8a4.2 4.2 0 0 1-8.4 0c0-3 4.2-8 4.2-8Z" />
      <path d="M6.4 9.6c.5.8 2.7.8 3.2 0" />
    </svg>
  );
}

/** よしよし：あたまを なでる手 */
export function IconYoshiyoshi({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <circle cx="8" cy="11" r="3.4" />
      <path d="M2.9 6.3c1.7-2.8 8.5-2.8 10.2 0" />
      <path d="M8 2.2v1.4" />
    </svg>
  );
}

/** わかるわぁ：哺乳瓶（このリアクションのアイコン） */
export function IconWakaruwa({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M6.6 1.6h2.8c.2.7.3 1.2.3 1.7H6.3c0-.5.1-1 .3-1.7Z" />
      <path d="M6.2 3.3h3.6v1.3H6.2z" />
      <path d="M5.2 6.2c0-.9.7-1.6 1.6-1.6h2.4c.9 0 1.6.7 1.6 1.6v6.6c0 .9-.7 1.6-1.6 1.6H6.8c-.9 0-1.6-.7-1.6-1.6z" />
      <path d="M6.6 8.2h1.2M6.6 10.4h1.2" />
    </svg>
  );
}

/** ばぶー：ちいさな ふきだし */
export function IconBabu({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M3 4.4c0-.9.7-1.6 1.6-1.6h6.8c.9 0 1.6.7 1.6 1.6v4.4c0 .9-.7 1.6-1.6 1.6H7.4L4.4 13v-2.6h-.2A1.2 1.2 0 0 1 3 9.2z" />
      <path d="M6.2 6.6h.01M8 6.6h.01M9.8 6.6h.01" />
    </svg>
  );
}

/** もどる */
export function IconBack({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M9.6 3.2 4.8 8l4.8 4.8" />
    </svg>
  );
}

/** かく（バブル作成へ） */
export function IconPen({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M10.6 2.6 13.4 5.4 5.8 13H3v-2.8z" />
      <path d="M9.2 4 12 6.8" />
    </svg>
  );
}

/** ホーム */
export function IconHome({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M2.6 7.2 8 2.6l5.4 4.6" />
      <path d="M4 8.4V13h8V8.4" />
    </svg>
  );
}

/** あやす */
export function IconSoothe({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M2.6 4.6c0-1 .8-1.8 1.8-1.8h7.2c1 0 1.8.8 1.8 1.8v4.8c0 1-.8 1.8-1.8 1.8H6.6L3.4 13.4v-2.4h-.8z" />
    </svg>
  );
}

/** けす（不可逆な操作） */
export function IconTrash({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M2.8 4.4h10.4" />
      <path d="M6.2 4.4V2.8h3.6v1.6" />
      <path d="M4.2 4.4l.7 8.2c0 .5.4.8.9.8h4.4c.5 0 .9-.3.9-.8l.7-8.2" />
    </svg>
  );
}

/** AI 変換（ことばのお手伝い） */
export function IconWand({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M3 13 11 5" />
      <path d="M9.6 3.4l1 1M12.2 2l.4 1.4L14 3.8l-1.4.4L12.2 6l-.4-1.8-1.4-.4 1.4-.4z" />
    </svg>
  );
}

/** つたえる（注記・拒否の見出しに添える） */
export function IconShield({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M8 1.8 3.2 3.6v4.2c0 3 2 5.2 4.8 6.4 2.8-1.2 4.8-3.4 4.8-6.4V3.6z" />
      <path d="M6.2 7.8 7.6 9.2l2.4-2.6" />
    </svg>
  );
}

/** 待っている（処理中） */
export function IconHourglass({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M4.6 2.4h6.8M4.6 13.6h6.8" />
      <path d="M5.4 2.4c0 2.6 2.6 3.6 2.6 5.6 0 2-2.6 3-2.6 5.6" />
      <path d="M10.6 2.4c0 2.6-2.6 3.6-2.6 5.6 0 2 2.6 3 2.6 5.6" />
    </svg>
  );
}
