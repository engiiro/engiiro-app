import type { ReactElement } from "react";

import { STAMP_MARKER } from "../data/constants";
import { STAMP_CATALOG } from "../data/stampCatalog";
import { cx } from "../lib/cx";
import "./BubbleBody.css";

/*
 * バブル・あやすの本文（FR-POST-005：挿入したスタンプが本文の該当位置に表示される）。
 *
 * 本文には `:naku:` のような目印でスタンプが埋め込まれている。ここで絵に置き換える。
 * 知らない目印はそのままの文字として出す（勝手に消さない）。
 *
 * URL の自動リンク化はしない（FR-MOD-021 / OUT-008）。
 * そもそも URL は保存されないので、リンク化の処理そのものを置かない。
 */

/* カタログは読み込み後に入るので、毎回引く。モジュール読み込み時にはまだ空 */
function isKnownStamp(id: string): boolean {
  return STAMP_CATALOG.some((stamp) => stamp.id === id);
}

export function BubbleBody({
  body,
  className,
  as: Tag = "p",
}: {
  readonly body: string;
  readonly className?: string;
  /**
   * 置き場所に合わせて要素を変える。
   * button の中に入れるときは "span" にする。button が中に置けるのは
   * phrasing content だけで、p を入れるとブラウザが要素を組み替えてしまう。
   */
  readonly as?: "p" | "span";
}) {
  return (
    <Tag className={cx("t-bubble-body", "eg-prose", className)}>{renderWithStamps(body)}</Tag>
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
    if (!isKnownStamp(match[1])) {
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
 * スタンプの絵柄（人間の指示、2026-08-28「しっかり画像が挿入されるように」）。
 *
 * ★ 絵は public/images/stamps/<id>.png（透過 PNG、128px の正方）。
 *   素材は frontend/images/stamps/ の候補のうち「ベタ塗りシンプル」だけを採っている。
 *   同じキャラ・同じ線幅で揃えないと、本文の中で絵柄が喧嘩する。
 *   どの絵をどの id にしたかは frontend/app/README.md の表。
 *
 * ★ 下地を敷かない。透過のまま重ねる。
 *   絵の側が濃い輪郭と明るい塗りを持っているので、ノーマル・ダーク・園児UI の
 *   どの地の上でも形が残る。下地を敷くと、絵の中の白と二重の面に見える。
 *
 * ★ 読み上げ：本文の中では「〇〇のスタンプ」と読ませる。
 *   一覧（picker）では押すボタン側が名前を持っているので、絵は装飾として黙らせる。
 */
export function StampGlyph({ id, picker = false }: { readonly id: string; readonly picker?: boolean }) {
  const stamp = STAMP_CATALOG.find((item) => item.id === id);
  if (!stamp) {
    /* カタログに無い id は絵に置き換えない（本文では isKnownStamp が先に弾いている） */
    return null;
  }
  return (
    <img
      className={cx("eg-stamp", picker && "eg-stamp--picker")}
      src={stamp.imageUrl}
      alt={picker ? "" : stamp.name + "のスタンプ"}
      aria-hidden={picker ? true : undefined}
      /* 素材の実寸。読み込み前から場所を取り、文字が跳ねないようにする */
      width={STAMP_ART_SIZE}
      height={STAMP_ART_SIZE}
      draggable={false}
    />
  );
}

/** 素材の実寸（正方）。表示の大きさは CSS のトークンが決める */
const STAMP_ART_SIZE = 128;
