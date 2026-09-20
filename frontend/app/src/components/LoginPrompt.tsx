import { useCallback, useEffect, useRef, useState } from "react";

import { cx } from "../lib/cx";
import { Button } from "./Button";
import { PersonaAvatar } from "./PersonaAvatar";
import { IconClose } from "./icons";
import "./LoginPrompt.css";

/*
 * ゲストが「読む」以外をしようとしたときに出る画面（人間の指示、2026-08-26）。
 *
 * えんじいろは、アカウントが無くても読める。書く・反応する・大好きにする、
 * および本人専用の画面だけがアカウントを要る（FR-AUTH-001/002 の線引き）。
 *
 * ★ 責めない。「ログインが必要です」で終わらせない。
 *   何をしようとして、それに何が要って、いま何ができるのかを1画面で出す。
 *   閉じれば読むのは続けられる。読む邪魔をしないのがこの画面の役目。
 *
 * ★ ここで押した操作を覚えて、ログイン後に代わりに実行することはしない。
 *   本人が押していない操作が、あとから勝手に起きるのを避ける
 *   （リアクションは取り消せない。DESIGN.md §4）。
 */

/** 何をしようとして止まったか。文言の出し分けにだけ使う */
export type GuestAction = "react" | "bubble" | "soothe" | "like" | "profile" | "favorites";

const ACTION_TITLE: Readonly<Record<GuestAction, string>> = {
  react: "リアクションは、アカウントが いります",
  bubble: "バブるを かくには、アカウントが いります",
  soothe: "あやすには、アカウントが いります",
  like: "大好きに するには、アカウントが いります",
  profile: "マイプロフィールは、あなただけの 画面です",
  favorites: "おきにいりは、あなただけの 画面です",
};

const ACTION_BODY: Readonly<Record<GuestAction, string>> = {
  react: "だれが押したかは 出ませんが、押した数は みんなに 見えます。",
  bubble: "バブルは 赤ちゃんの顔で かきます。その名前を さきに 決めます。",
  soothe: "あやすときは、赤ちゃんと お母さん、どちらの顔で 返すかを 選びます。",
  like: "大好きは 一方通行です。相手には 通知されません。",
  profile: "ふたつの顔の ようすを まとめて 見られる、ただ ひとつの画面です。",
  favorites: "あなたが 大好きにした人だけが 並びます。だれにも 見せません。",
};

type LoginPromptProps = {
  readonly action: GuestAction;
  readonly onLogin: () => void;
  readonly onSignUp: () => void;
  readonly onClose: () => void;
};

export function LoginPrompt({ action, onLogin, onSignUp, onClose }: LoginPromptProps) {
  const [leaving, setLeaving] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const close = useCallback(() => {
    setLeaving(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close]);

  return (
    <div
      className={cx("eg-gate", leaving && "is-leaving")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="eg-gate-title"
      onAnimationEnd={() => {
        if (leaving) {
          onClose();
        }
      }}
    >
      {/* 地の部分を押しても閉じる。読むのに戻るのを一番かんたんにする */}
      <button
        type="button"
        className="eg-gate__scrim"
        aria-label="とじて 読むのに もどる"
        onClick={close}
      />

      <div className="eg-gate__sheet">
        <button
          type="button"
          ref={closeButtonRef}
          className={cx("eg-gate__close", "eg-touch")}
          aria-label="とじる"
          onClick={close}
        >
          <IconClose />
        </button>

        <div className="eg-gate__faces" aria-hidden="true">
          <PersonaAvatar kind="baby" size="lg" />
          <PersonaAvatar kind="mother" size="lg" />
        </div>

        <h2 id="eg-gate-title" className={cx("eg-gate__title", "t-heading")}>
          {ACTION_TITLE[action]}
        </h2>
        <p className={cx("eg-gate__body", "t-body")}>{ACTION_BODY[action]}</p>

        <p className={cx("eg-gate__note", "t-caption")}>
          アカウントを つくると、赤ちゃんの顔と お母さんの顔が いっしょに できます。
          ふたつが 同じ人のものだとは、だれにも わかりません。
        </p>

        <div className="eg-gate__actions">
          <Button fullWidth onClick={onSignUp}>
            アカウントを つくる
          </Button>
          <Button variant="ghost" fullWidth onClick={onLogin}>
            ログインする
          </Button>
        </div>

        <button type="button" className={cx("eg-gate__stay", "t-label")} onClick={close}>
          このまま よむ
        </button>
      </div>
    </div>
  );
}
