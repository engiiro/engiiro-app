import { cx } from "../lib/cx";
import "./RightRail.css";

/*
 * 右サイド（人間の決定、2026-08-25）。
 *
 * 後々ここにエンジニア関連の記事が流れてくる。今は場所を取っておくだけ。
 *
 * 記事には外部へのリンクが付くことになるが、これは「バブル本文に URL を
 * 含められない」（FR-MOD-021 / OUT-008）とは別の話。禁止されているのは
 * 利用者が書く本文であって、サービスが出す読み物ではない。
 * バブるボタンを押すと、この列が投稿用のポップアップに入れ替わる。
 */

export function RightRail() {
  return (
    <aside className="eg-right-rail" aria-label="よみもの">
      <div className="eg-right-rail__card">
        <h2 className={cx("eg-right-rail__title", "t-heading")}>よみもの</h2>
        <p className={cx("eg-right-rail__note", "t-caption")}>
          エンジニア向けの記事が ここに 流れてくる予定です。
        </p>
        <div className="eg-right-rail__list" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index}>
              <div className="eg-right-rail__skeleton" />
              <div
                className={cx("eg-right-rail__skeleton", "eg-right-rail__skeleton--short")}
              />
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
