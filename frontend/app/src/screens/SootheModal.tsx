import { useCallback, useEffect, useRef, useState } from "react";

import { createSoothe } from "../data/api";
import type { Me, PersonaKind } from "../data/types";
import { AiUnavailableError, mockAiTransform } from "../lib/mockAiTransform";
import { cx } from "../lib/cx";
import { soothePersonaRule } from "../lib/soothePersonaRule";
import type { SootheTarget } from "../lib/soothePersonaRule";
import { AiTransformPanel } from "../components/AiTransformPanel";
import type { AiPanelState } from "../components/AiTransformPanel";
import { Button } from "../components/Button";
import { IconWand } from "../components/icons";
import { MODERATION_REJECT_TEXT, NoteBox } from "../components/NoteBox";
import "./SootheModal.css";

/*
 * S5 あやすモーダル。
 *
 * 入退場は下から出て下へ帰る。scale(0.96) → 1、開 250ms / 閉 150ms。
 * transform-origin は起点側（あやすボタンは画面下にあるので bottom）。
 *
 * ★ ペルソナ選択は返信先で変わる（lib/soothePersonaRule.ts）：
 *     バブルへのあやす                → 赤ちゃん / お母さん の両方
 *     お母さんとしてのあやすへの返信  → 赤ちゃんのみ。お母さんは選択肢に出さない
 *   S3 では逆にお母さんを disabled で残す。混同しない（DESIGN.md §0.3）。
 *
 * 選択中のペルソナのニックネームだけを出す。両方を並べない（DESIGN.md §0.1-1）。
 */

const ROLE_BUTTON_LABEL: Readonly<Record<PersonaKind, string>> = {
  baby: "赤ちゃんとして",
  mother: "お母さんとして",
};

type SootheModalProps = {
  readonly target: SootheTarget;
  readonly me: Me;
  readonly aiAvailable: boolean;
  readonly onClose: () => void;
  readonly onSoothed: () => void;
};

export function SootheModal({ target, me, aiAvailable, onClose, onSoothed }: SootheModalProps) {
  const rule = soothePersonaRule(target);
  const [persona, setPersona] = useState<PersonaKind>(rule.allowed[0]);
  const [body, setBody] = useState("");
  const [ai, setAi] = useState<AiPanelState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /* 閉じ終わってから親へ知らせる。とじるでも送信でも同じ経路で帰す（DESIGN.md §7.4） */
  const pendingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const close = useCallback((after: () => void) => {
    pendingRef.current = after;
    setLeaving(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close(onClose);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, onClose]);

  async function runTransform() {
    setRejected(false);
    setAi({ kind: "working" });
    try {
      const result = await mockAiTransform(body, persona, { available: aiAvailable });
      if (result.action === "allow") {
        setAi({ kind: "allow", transformedText: result.transformedText });
      } else {
        setAi({ kind: result.action });
      }
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        setAi({ kind: "unavailable" });
        return;
      }
      throw error;
    }
  }

  const submit = useCallback(async () => {
    setSubmitting(true);
    setRejected(false);
    const result = await createSoothe({
      bubbleId: target.bubbleId,
      personaKind: persona,
      body,
      replyToSootheId: target.kind === "soothe" ? target.sootheId : undefined,
    });
    setSubmitting(false);
    if (result.ok) {
      close(onSoothed);
      return;
    }
    if (result.reason === "moderation") {
      setRejected(true);
    }
  }, [body, close, onSoothed, persona, target]);

  const selectedNickname = persona === "mother" ? me.mother.nickname : me.baby.nickname;

  return (
    <div
      className={cx("eg-scrim", "eg-soothe-scrim", leaving && "is-leaving")}
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) {
          pendingRef.current?.();
        }
      }}
    >
      <div
        className="eg-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eg-soothe-modal-title"
      >
        <div className="eg-modal__head">
          <h2 id="eg-soothe-modal-title" className={cx("eg-modal__title", "t-heading")}>
            あやす
          </h2>
          <button
            type="button"
            className={cx("eg-modal__close", "t-label", "eg-touch")}
            onClick={() => close(onClose)}
          >
            とじる
          </button>
        </div>

        <p className={cx("eg-modal__target", "t-caption")}>
          {target.kind === "bubble"
            ? target.authorNickname + " の バブルへ"
            : target.authorNickname + " の あやすへ 返信"}
        </p>

        <div className="eg-modal__body">
          <section className="eg-modal__block" aria-labelledby="eg-soothe-persona-title">
            <h3 id="eg-soothe-persona-title" className={cx("eg-modal__label", "t-label")}>
              だれとして あやす？
            </h3>
            <div className="eg-persona-choice">
              {/*
                rule.allowed に無いペルソナは描画しない。
                disabled で見せるのではなく、選択肢そのものを出さない（FR-COMMENT-005）
              */}
              {rule.allowed.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={persona === kind}
                  className={cx(
                    "eg-persona-choice__item",
                    "eg-touch",
                    persona === kind && (kind === "mother" ? "is-selected-mother" : "is-selected"),
                  )}
                  onClick={() => setPersona(kind)}
                >
                  <span className={cx("eg-persona-choice__role", "t-button")}>
                    {ROLE_BUTTON_LABEL[kind]}
                  </span>
                </button>
              ))}
            </div>
            {rule.reason ? (
              <p className={cx("eg-modal__reason", "t-caption")}>{rule.reason}</p>
            ) : null}
            <p className={cx("eg-modal__nickname", "t-caption")}>
              この名前で 出ます：{selectedNickname}
            </p>
          </section>

          <section className="eg-modal__block" aria-labelledby="eg-soothe-body-title">
            <h3 id="eg-soothe-body-title" className={cx("eg-modal__label", "t-label")}>
              かける ことば
            </h3>
            <textarea
              ref={textareaRef}
              className={cx("eg-textarea", "t-input")}
              value={body}
              rows={4}
              placeholder="そのままの ことばで いいよ。"
              onChange={(event) => setBody(event.target.value)}
            />
          </section>

          <section className="eg-modal__block">
            <Button
              variant="ghost"
              disabled={!aiAvailable || body.trim().length === 0 || ai.kind === "working"}
              onClick={() => {
                void runTransform();
              }}
            >
              <IconWand />
              ことばを やわらかく してもらう
            </Button>
            <AiTransformPanel
              state={aiAvailable ? ai : { kind: "unavailable" }}
              onUseTransformed={(text) => {
                setBody(text);
                setAi({ kind: "idle" });
              }}
              onDismiss={() => setAi({ kind: "idle" })}
            />
          </section>

          {rejected ? (
            <NoteBox variant="reject" title="このままでは あやせません" role="alert">
              {MODERATION_REJECT_TEXT}
            </NoteBox>
          ) : null}
        </div>

        <div className="eg-modal__foot">
          <Button
            fullWidth
            disabled={body.trim().length === 0 || submitting}
            onClick={() => void submit()}
          >
            {submitting ? "とどけています…" : "あやす"}
          </Button>
        </div>
      </div>
    </div>
  );
}
