import type { ReactNode } from "react";

import { cx } from "../lib/cx";
import "./BottomAction.css";

/*
 * 画面の下端に貼りつく主操作（S4 の「あやす」など）。
 *
 * 画面全体に fixed しない。中央の列の中に置いて、その列の下端に貼りつける
 * （BubbleDetailScreen の元の作りを、あやす詳細と共有できる形に出しただけ）。
 *
 * ★ この要素は「中央の列（.eg-center）のいちばん最後の子」であること。
 *   親に padding-bottom があったり、あとに別の要素が続いたりすると、
 *   いちばん下まで送りきった瞬間に sticky が親の content box に阻まれて跳ねる。
 *   下の余白は親ではなく、この要素自身の padding / margin で持つ。
 *
 * ★ 面は列いっぱいに、中のボタンは本文と同じ幅に揃える。
 *   本文より広いボタンが下に居ると、押す場所の縦のラインが本文とずれる。
 */
export function BottomAction({ children }: { readonly children: ReactNode }) {
  return (
    <div className="eg-bottom-action">
      <div className="eg-column">{children}</div>
    </div>
  );
}

/** 下端の帯に添える1行（「○○ へ 返信します」など）。ボタンの上に置く */
export function BottomActionNote({ children }: { readonly children: ReactNode }) {
  return <p className={cx("eg-bottom-action__note", "t-caption")}>{children}</p>;
}
