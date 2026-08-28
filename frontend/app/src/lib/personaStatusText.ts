import type { PersonaKind, PersonaStatus } from "../data/types";

/*
 * 「推定 …」の一行を作る（FR-PROFILE-001/002）。
 *
 * ★ S8（本人）と S6（他人）で同じ計算をしていたので、ここへ寄せた
 *   （2026-08-28 のリファクタリング）。月齢から年を出す割り算が両方に書かれていて、
 *   片方だけ直すと2つの画面で違う推定が出る形だった。
 *
 * 軸のちがい：
 *   赤ちゃん … 「推定 1歳2か月」（FR-PROFILE-001。文章そのものの幼さ）
 *   お母さん … 「推定 1歳児を あやし中」（FR-PROFILE-002。向けている相手の年齢）
 *
 * 2つは別の軸で、同じ尺度の値ではない（FR-AI-EVAL-002）。ここで足したり比べたりしない。
 * 評価が使えないときは、その旨に置き換える（NFR-002）。プロフィールは読めるままにする。
 */

/**
 * @param emptyText まだ材料が無いときの一行。
 *   本人の画面（S8）は次の行動を促し、他人の画面（S6）は事実だけを書くので、
 *   ここだけ画面から渡す。
 */
export function personaStatusCaption(
  status: PersonaStatus | null,
  kind: PersonaKind,
  emptyText: string,
): string {
  if (status === null) {
    return "いま はかれません";
  }
  if (status.sampleCount === 0) {
    return emptyText;
  }
  if (kind === "baby") {
    return "推定 " + status.label;
  }
  return "推定 " + String(Math.floor(status.months / 12)) + "歳児を あやし中";
}
