import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { cx } from "../lib/cx";
import "./ErrorBoundary.css";

/*
 * 描画が落ちたときの受け皿（2026-09-05）。
 *
 * これが無いと、描画中に例外が1つ出ただけで React が木ごと外し、
 * 真っ白な画面だけが残る。何が起きたのかも、どう戻ればいいのかも出ない。
 * 落ちること自体はここでは直せないので、**戻る道を出すこと**だけを受け持つ。
 *
 * ★ 見た目はここだけで完結させる。Button や NoteBox を使わない。
 *   落ちた原因がその部品側にあると、受け皿ごと落ちて元の木阿弥になる。
 *   色と間隔は tokens/*.css から引く（CSS なので落ちない）。
 * ★ 「けして ひらく」を用意しているのは、壊れた保存値（テーマやトークン）が
 *   原因のときに、開くたびに落ちる状態から自力で出られるようにするため。
 *   消すのは engiiro. で始まる自分の鍵だけ。他のサイトの分は触らない。
 * ★ 非同期の失敗（fetch や await のあと）はここに来ない。React の境界は
 *   描画中の例外だけを捕まえる。そちらは画面ごとに状態で扱う
 *   （App.tsx の bootError / feedError、ComposePanel の evaluateFailed）。
 */

type ErrorBoundaryProps = {
  readonly children: ReactNode;
};

type ErrorBoundaryState = {
  readonly error: Error | null;
};

/** engiiro. で始まる保存値だけを消して開き直す */
function clearStoredAndReload(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("engiiro.")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // 読めない環境（プライベートウィンドウ等）では消すものが無い。そのまま開き直す
  }
  window.location.reload();
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    /* 握りつぶさない。開発中は原因が要る（本番でも console には残す） */
    console.error("画面の描画に失敗しました", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="eg-crash" role="alert">
        <div className="eg-crash__sheet">
          <p className={cx("eg-crash__title", "t-card-title")}>うまく ひらけませんでした</p>
          <p className={cx("eg-crash__text", "t-body")}>
            いま 画面を つくれませんでした。もう一度 ひらくと なおることが おおいです。
          </p>
          <p className={cx("eg-crash__note", "t-caption")}>
            書いていた ことばは のこっていません。ごめんね。
          </p>
          <div className="eg-crash__actions">
            <button
              type="button"
              className={cx("eg-crash__button", "eg-crash__button--primary", "eg-touch")}
              onClick={() => window.location.reload()}
            >
              もう一度 ひらく
            </button>
            <button
              type="button"
              className={cx("eg-crash__button", "eg-touch")}
              onClick={clearStoredAndReload}
            >
              ほぞんした せっていを けして ひらく
            </button>
          </div>
          {/* 原因は開発中だけ画面に出す。利用者に読ませるものではない */}
          {import.meta.env.DEV ? (
            <pre className="eg-crash__detail">{error.message}</pre>
          ) : null}
        </div>
      </div>
    );
  }
}
