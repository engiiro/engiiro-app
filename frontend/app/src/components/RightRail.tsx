import { cx } from "../lib/cx";
import { Button } from "./Button";
import { PersonaAvatar } from "./PersonaAvatar";
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
 *
 * よみものの上に、ログインの出入り口を置く（人間の指示、2026-08-26）。
 * えんじいろは アカウントが無くても読めるので、ゲストのときは「ログイン」、
 * ログイン中は「ログアウト」を出す。
 *
 * ★ ログイン中でも、ここに両方のニックネームを並べない（DESIGN.md §0.1-1）。
 *   出すのは赤ちゃんの顔だけ。両方まとめて見られるのは S8 だけ（FR-PERSONA-005）。
 */

export function RightRail({
  isGuest,
  babyNickname,
  onLogin,
  onLogout,
}: {
  readonly isGuest: boolean;
  /** ログイン中に出す名前。赤ちゃんの顔のほうだけ */
  readonly babyNickname: string;
  readonly onLogin: () => void;
  readonly onLogout: () => void;
}) {
  return (
    <aside className="eg-right-rail" aria-label="よみもの">
      <div className={cx("eg-right-rail__card", "eg-right-rail__session")}>
        {isGuest ? (
          <>
            <p className={cx("eg-right-rail__session-title", "t-card-title")}>
              いまは よむ だけの じょうたい
            </p>
            <p className={cx("eg-right-rail__note", "t-caption")}>
              ログインすると、バブルを かいたり、あやしたり できます。
            </p>
            <Button fullWidth onClick={onLogin}>
              ログイン
            </Button>
          </>
        ) : (
          <>
            <div className="eg-right-rail__who">
              <PersonaAvatar kind="baby" size="md" />
              <span className={cx("eg-right-rail__nickname", "t-card-title")}>
                {babyNickname}
              </span>
            </div>
            <Button variant="ghost" fullWidth onClick={onLogout}>
              ログアウト
            </Button>
          </>
        )}
      </div>

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
