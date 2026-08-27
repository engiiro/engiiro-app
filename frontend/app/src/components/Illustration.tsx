import { cx } from "../lib/cx";
import { useResolvedTheme } from "../lib/useResolvedTheme";
import "./Illustration.css";

/*
 * イラスト（frontend/images/soft-bubble-*.svg）。
 *
 * ★ <img> で読み込んだ SVG に、アプリ側の CSS 変数は継承されない。
 *   だから色をこちらから渡すのではなく、テーマごとに用意された
 *   3ファイルのうち1つを選ぶ（useResolvedTheme）。
 *   ファイル側は var(--illustration-*) にフォールバック色を持っていて、
 *   外部読み込みではそのフォールバックが効く。
 *
 * 3つの絵柄は、画面ごとに役割を分ける。同じ絵を全画面に繰り返さない：
 *   orbit … めぐるバブル。Intro の主役（＝「受け止められて、めぐる」）
 *   haven … ひとやすみのバブル。空状態の主役（＝「まだ何もない、休んでいい」）
 *   drops … しずくのバブル。投稿パネルの書き出し前だけ（＝「吐き出す」）
 *
 * 既定は装飾（alt="" ＋ aria-hidden）。意味を持たせたいときだけ alt を渡す。
 */

export type IllustrationName = "orbit" | "haven" | "drops";

/** SVG の viewBox。縦横比を先に確保して、読み込み時のガタつきを出さない */
const ART_WIDTH = 320;
const ART_HEIGHT = 220;

type IllustrationProps = {
  readonly name: IllustrationName;
  /** 省略すると装飾扱い。読み上げに渡したい絵にだけ文字を付ける */
  readonly alt?: string;
  readonly className?: string;
};

export function Illustration({ name, alt, className }: IllustrationProps) {
  const theme = useResolvedTheme();
  const decorative = alt === undefined;

  return (
    <img
      className={cx("eg-illust", "eg-illust--" + name, className)}
      src={"/images/soft-bubble-" + name + "-" + theme + ".svg"}
      alt={decorative ? "" : alt}
      aria-hidden={decorative ? true : undefined}
      width={ART_WIDTH}
      height={ART_HEIGHT}
      draggable={false}
    />
  );
}
