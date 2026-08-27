/*
 * 時刻は相対表示だけ（DESIGN.md §0.1-5）。
 *
 * 秒精度の絶対時刻は、2つのペルソナの投稿時刻を突き合わせて同一人物を割り出す材料になる。
 * title 属性やツールチップにも絶対時刻を入れない。この関数以外に時刻の整形を置かない。
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

export function relativeTimeText(iso: string, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - new Date(iso).getTime());

  if (elapsed < MINUTE) {
    return "いま";
  }
  if (elapsed < HOUR) {
    return String(Math.floor(elapsed / MINUTE)) + "分前";
  }
  if (elapsed < DAY) {
    return String(Math.floor(elapsed / HOUR)) + "時間前";
  }
  if (elapsed < MONTH) {
    return String(Math.floor(elapsed / DAY)) + "日前";
  }
  return String(Math.floor(elapsed / MONTH)) + "か月前";
}
