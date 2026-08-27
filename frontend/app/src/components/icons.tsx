
/*
 * アイコン。
 *
 * DESIGN.md §11 の通り、アイコンセットは未定。ここにあるのは仮のもので、
 * 差し替え前提。currentColor で描くので、色はトークン側で決まる。
 *
 * 「まんま」の哺乳瓶は、DESIGN.md §4 が指定している唯一のアイコン。
 * これは「まんま」というリアクション1つの絵柄であって、別のリアクションではない（FR-REACT-009）。
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

/** まんま：哺乳瓶（絵柄は仮。DESIGN.md §11 でアイコンセットは未定） */
export function IconManma({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M6.6 1.6h2.8c.2.7.3 1.2.3 1.7H6.3c0-.5.1-1 .3-1.7Z" />
      <path d="M6.2 3.3h3.6v1.3H6.2z" />
      <path d="M5.2 6.2c0-.9.7-1.6 1.6-1.6h2.4c.9 0 1.6.7 1.6 1.6v6.6c0 .9-.7 1.6-1.6 1.6H6.8c-.9 0-1.6-.7-1.6-1.6z" />
      <path d="M6.6 8.2h1.2M6.6 10.4h1.2" />
    </svg>
  );
}

/**
 * ばぶー：おしゃぶり。
 *
 * 以前は吹き出しを当てていたが、吹き出しは一般に「返信」を意味するので
 * 返信ボタンに見えてしまっていた。ばぶー はリアクションであって返信ではない。
 */
export function IconBabu({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <circle cx="8" cy="3.4" r="2" />
      <ellipse cx="8" cy="8.2" rx="4.4" ry="2.5" />
      <path d="M6.6 10.4c.2 1.9.7 3.2 1.4 4 .7-.8 1.2-2.1 1.4-4" />
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

/** さがす */
export function IconSearch({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <circle cx="7" cy="7" r="4.4" />
      <path d="M10.2 10.2 13.6 13.6" />
    </svg>
  );
}

/** おしらせ */
export function IconBell({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M8 2.2a3.8 3.8 0 0 0-3.8 3.8c0 3-1.2 4-1.2 4h10s-1.2-1-1.2-4A3.8 3.8 0 0 0 8 2.2Z" />
      <path d="M6.6 12.4a1.6 1.6 0 0 0 2.8 0" />
    </svg>
  );
}

/** じぶん */
export function IconPerson({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <circle cx="8" cy="5.4" r="2.8" />
      <path d="M2.9 13.6a5.1 5.1 0 0 1 10.2 0" />
    </svg>
  );
}

/** せってい */
export function IconGear({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1.8v1.8M8 12.4v1.8M2.6 8h1.8M11.6 8h1.8M4.2 4.2l1.3 1.3M10.5 10.5l1.3 1.3M11.8 4.2l-1.3 1.3M5.5 10.5l-1.3 1.3" />
    </svg>
  );
}

/** スタンプ */
export function IconStamp({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M4.6 13.4h6.8v-1.2H4.6z" />
      <path d="M5.6 12.2v-1.6h4.8v1.6" />
      <path d="M8 10.6V8.4m0 0a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z" />
    </svg>
  );
}

/** じぶんの ことばを はかる */
export function IconGauge({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M2.4 11.4a5.6 5.6 0 1 1 11.2 0" />
      <path d="M8 11.4 10.8 7" />
      <path d="M2.4 11.4h1.6M12 11.4h1.6" />
    </svg>
  );
}

/** とじる */
export function IconClose({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** ペルソナを いれかえる */
export function IconSwap({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M3 6h8.4L9.2 3.8" />
      <path d="M13 10H4.6l2.2 2.2" />
    </svg>
  );
}

/** つぎへ：行の右端に置く矢印 */
export function IconChevronRight({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M6 3.2 10.8 8 6 12.8" />
    </svg>
  );
}

/** すきな相手：フォロー中の行に置く。フォロワー側には使わない（OUT-004） */
export function IconHeart({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M8 13.4 2.9 8.5a3 3 0 1 1 5.1-3.2 3 3 0 1 1 5.1 3.2Z" />
    </svg>
  );
}

/** 生年月日：S8 でしか使わない（DESIGN.md §0.1-5・FR-PRIV-004） */
export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <rect x="2.2" y="3.4" width="11.6" height="10.4" rx="1.6" />
      <path d="M2.2 6.6h11.6M5.4 1.9v2.4M10.6 1.9v2.4" />
    </svg>
  );
}

/** あたらしくする：タイムラインの読み込み直し */
export function IconRefresh({ className }: IconProps) {
  return (
    <svg {...BASE_PROPS} className={className}>
      <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7" />
      <path d="M13.4 2.4v2.9h-2.9" />
    </svg>
  );
}
