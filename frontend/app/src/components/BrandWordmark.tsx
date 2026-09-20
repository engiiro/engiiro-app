import { cx } from "../lib/cx";
import { useResolvedTheme } from "../lib/useResolvedTheme";
import "./BrandWordmark.css";

/*
 * 名乗りの文字「えんじいろ」（人間の指示、2026-09-05）。
 *
 * ★ 園児UI のときだけ、実際に子どもが書いたものの画像に差し替える。
 *   園児UI は「こうさく用紙みたいに あざやか」なテーマ（SettingsScreen の THEME_NOTE）で、
 *   欧文書体で組んだ名乗りより、手で書かれた線のほうがテーマの由来そのものになる。
 *   ノーマル・ダークは文字のまま。あちらは落ち着いた面なので、
 *   クレヨンの線が1つだけ乗ると、そこだけ別のサービスに見える。
 *
 * ★ 差し替えの判定は「選択」ではなく「いま出ている結果」（useResolvedTheme）。
 *   "system" のときに選択だけ見ても、園児UI かどうかは決まらない。
 *   Illustration.tsx と同じ理由・同じ hook を使う（画面ごとに別の判定を作らない）。
 *
 * ★ 画像でも読み上げには「えんじいろ」を渡す（alt）。飾りではなくサービスの名前なので、
 *   テーマを変えただけで名乗りが読み上げから消えてはいけない。
 *
 * ★ 大きさは呼び出し側が --wordmark-height で決める（BrandWordmark.css）。
 *   文字のときは呼び出し側の font-size、画像のときは高さ。どちらも
 *   「置きたい大きさ」を1か所で書けるようにしてある。
 */

/*
 * 表示している画像の実寸（frontend/app/public/images/engiiro.png）。
 * 先に比率を確保して、読み込み時に周りがガタつかないようにする。
 */
const KID_WIDTH = 720;
const KID_HEIGHT = 408;

export function BrandWordmark({ className }: { readonly className?: string }) {
  const theme = useResolvedTheme();

  if (theme === "kid") {
    return (
      <img
        className={cx("eg-wordmark", "eg-wordmark--kid", className)}
        src="/images/engiiro.png"
        alt="えんじいろ"
        width={KID_WIDTH}
        height={KID_HEIGHT}
        draggable={false}
      />
    );
  }

  return <span className={cx("eg-wordmark", "t-display", className)}>えんじいろ</span>;
}
