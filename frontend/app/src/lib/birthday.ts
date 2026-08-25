/*
 * 生年月日の整形。
 *
 * relativeTime.ts は「出来事の時刻を相対でしか出さない」ための決まりで、
 * こちらはそれとは別のもの。生年月日は出来事の時刻ではなく、利用者が持っている日付で、
 * 相対表示にすると意味が失われる（「3年前」では生年月日にならない）。
 *
 * ★ ただし、出してよいのは S8（本人専用プロフィール）だけ。
 *   公開プロフィールに出すと、両ペルソナを突き合わせる材料になる（FR-PRIV-004）。
 *   この関数を公開系の画面から呼ばない。
 *
 * 時分秒は扱わない。日付だけを受け取る。
 */

export function birthdayText(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }
  return (
    String(Number(year)) + "年" + String(Number(month)) + "月" + String(Number(day)) + "日"
  );
}
