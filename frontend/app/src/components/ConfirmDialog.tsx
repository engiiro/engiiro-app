import { useCallback, useEffect, useRef, useState } from "react";

import { cx } from "../lib/cx";
import { Button } from "./Button";
import "./ConfirmDialog.css";

/*
 * 確認ダイアログ（DESIGN.md §4 バブルの削除）。
 *
 * 使うのはバブルの削除だけ。不可逆な操作にだけ出す。
 * 取り消せる操作に confirm を出すと、押し流す癖がついて、肝心なときに読まれなくなる。
 */

type ConfirmDialogProps = {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

/**
 * バブルを消すときの確認（DESIGN.md §4 バブルの削除）。
 *
 * ★ 文言を画面ごとに書かない。バブル詳細（S4）と マイプロフィール（S8）の2か所から
 *   同じ確認を出すので、別々に書くと片方だけ言い回しが変わる。
 *   確認を出してよい唯一の操作なので、その事実もこの部品が持つ。
 */
export function BubbleDeleteConfirm({
  onCancel,
  onConfirm,
}: {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      title="このバブる、消しちゃう？"
      body="元には戻せないよ。あやしてくれた ことばも いっしょに 消えます。"
      confirmLabel="けす"
      cancelLabel="やめる"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [leaving, setLeaving] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelButtonRef.current?.focus();
  }, []);

  const close = useCallback((after: () => void) => {
    pendingRef.current = after;
    setLeaving(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close(onCancel);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, onCancel]);

  return (
    <div
      className={cx("eg-scrim", leaving && "is-leaving")}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) {
          pendingRef.current?.();
        }
      }}
    >
      <div
        className="eg-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="eg-confirm-title"
      >
        <h2 id="eg-confirm-title" className={cx("eg-confirm__title", "t-heading")}>
          {title}
        </h2>
        <p className={cx("eg-confirm__body", "t-body")}>{body}</p>
        <div className="eg-confirm__actions">
          <Button ref={cancelButtonRef} variant="quiet" onClick={() => close(onCancel)}>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={() => close(onConfirm)}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
