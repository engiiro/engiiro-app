import { useCallback, useEffect, useRef, useState } from "react";

import { createBubble, createSoothe } from "../data/api";
import { isOverLimit } from "../data/constants";
import { BLOCK_DEMO_INPUT, REWRITE_DEMO_INPUT } from "../data/moderationSamples";
import { STAMP_CATALOG } from "../data/stamps";
import { TAG_CATALOG } from "../data/tags";
import type { Me, PersonaKind } from "../data/types";
import { cx } from "../lib/cx";
import { AiUnavailableError, mockAiTransform } from "../lib/mockAiTransform";
import { mockAiEvaluate, MAX_MONTHS } from "../lib/mockAiEvaluate";
import type { AiEvaluateResult } from "../lib/mockAiEvaluate";
import { soothePersonaRule } from "../lib/soothePersonaRule";
import type { SootheTarget } from "../lib/soothePersonaRule";
import { AiTransformPanel } from "../components/AiTransformPanel";
import type { AiPanelState } from "../components/AiTransformPanel";
import { Button } from "../components/Button";
import { CharCounter } from "../components/CharCounter";
import { StampGlyph } from "../components/BubbleBody";
import {
  IconClose,
  IconGauge,
  IconStamp,
  IconSwap,
  IconWand,
} from "../components/icons";
import { MODERATION_REJECT_TEXT, NoteBox } from "../components/NoteBox";
import "./ComposePanel.css";

/*
 * 投稿・返信の入れ物（人間の決定、2026-08-25）。
 *
 * 右から出てくるパネル。バブルを書くときも、あやすを書くときも同じものを使う。
 * 中央のタイムラインは左に詰められるだけで、スクロールは生きたまま
 * （＝画面を塞ぐモーダルではない）。
 *
 * 並び：
 *   左上   … いま書いているペルソナのアイコン
 *   右上   … 送信（バブる／あやす）
 *   その下 … ペルソナ変更
 *   本文欄
 *   下段   … スタンプ／チェック（赤ちゃん度・お母さん度）／変換 の3つ
 *   引き出し … 3つのどれかを押すと、パネルの下 2/5 に出る
 *
 * ペルソナ変更の出しわけ：
 *   バブル投稿           … 押せない。ラベルに理由を書く（FR-POST-003、DESIGN.md §0.3）
 *   ふつうの返信         … 押せる
 *   お母さんへの返信     … ボタンを出さない（FR-COMMENT-005、人間の決定 2026-08-25）
 *
 * 指定には無いが残しているもの：
 *   タグ（FR-POST-004）と投稿ガイドライン（FR-PRIV-001）。どちらも仕様の要求なので、
 *   外すと満たせなくなる。不要なら外す。
 */

type ComposeMode =
  | { readonly kind: "bubble" }
  | { readonly kind: "reply"; readonly target: SootheTarget };

type DrawerKind = "none" | "stamp" | "evaluate" | "transform";

type ComposePanelProps = {
  readonly mode: ComposeMode;
  readonly me: Me;
  readonly aiAvailable: boolean;
  readonly onClose: () => void;
  readonly onPosted: (message: string) => void;
};

export function ComposePanel({ mode, me, aiAvailable, onClose, onPosted }: ComposePanelProps) {
  const rule = mode.kind === "reply" ? soothePersonaRule(mode.target) : { allowed: ["baby"] as const };
  const canSwapPersona = mode.kind === "reply" && rule.allowed.length > 1;

  const [persona, setPersona] = useState<PersonaKind>("baby");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<readonly string[]>([]);
  const [drawer, setDrawer] = useState<DrawerKind>("none");
  const [ai, setAi] = useState<AiPanelState>({ kind: "idle" });
  const [evaluation, setEvaluation] = useState<AiEvaluateResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluateFailed, setEvaluateFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  const isBubble = mode.kind === "bubble";
  const over = isBubble && isOverLimit(body);
  const canSend = body.trim().length > 0 && !over && !submitting;

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

  function toggleDrawer(next: DrawerKind) {
    setDrawer((current) => (current === next ? "none" : next));
  }

  async function runTransform() {
    setRejected(false);
    setAi({ kind: "working" });
    try {
      const result = await mockAiTransform(body, persona, { available: aiAvailable });
      setAi(result.action === "allow" ? { kind: "allow", transformedText: result.transformedText } : { kind: result.action });
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        setAi({ kind: "unavailable" });
        return;
      }
      throw error;
    }
  }

  async function runEvaluate() {
    setEvaluating(true);
    setEvaluateFailed(false);
    try {
      setEvaluation(await mockAiEvaluate(body, persona, { available: aiAvailable }));
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        // 評価が使えなくても投稿は止めない（NFR-003 / FR-AI-EVAL-006）
        setEvaluateFailed(true);
        setEvaluation(null);
      } else {
        throw error;
      }
    } finally {
      setEvaluating(false);
    }
  }

  const submit = useCallback(async () => {
    setSubmitting(true);
    setRejected(false);
    const result = isBubble
      ? await createBubble({ body, tags })
      : await createSoothe({
          bubbleId: mode.kind === "reply" ? mode.target.bubbleId : "",
          personaKind: persona,
          body,
          replyToSootheId:
            mode.kind === "reply" && mode.target.kind === "soothe" ? mode.target.sootheId : undefined,
        });
    setSubmitting(false);
    if (result.ok) {
      close(() => onPosted(isBubble ? "ぽいっと できました" : "あやしました"));
      return;
    }
    if (result.reason === "moderation") {
      // 入力内容は消さない。書き直せる状態で残す（DESIGN.md §4 拒否バナー）
      setRejected(true);
    }
  }, [body, close, isBubble, mode, onPosted, persona, tags]);

  const activePersona = persona === "mother" ? me.mother : me.baby;

  return (
    <div
      className={cx("eg-compose", leaving && "is-leaving")}
      role="dialog"
      aria-labelledby="eg-compose-title"
      onAnimationEnd={(event) => {
        if (leaving && event.target === event.currentTarget) {
          pendingRef.current?.();
        }
      }}
    >
      <header className="eg-compose__head">
        {/* 左上：いま書いているペルソナ。もう一方のニックネームは出さない（DESIGN.md §0.1-1） */}
        <span
          className={cx("eg-compose__avatar", "eg-compose__avatar--" + activePersona.kind)}
          aria-hidden="true"
        >
          {activePersona.kind === "baby" ? "赤" : "母"}
        </span>
        <span className="eg-compose__who">
          <span id="eg-compose-title" className={cx("eg-compose__title", "t-card-title")}>
            {isBubble ? "バブルを かく" : "あやす"}
          </span>
          <span className={cx("eg-compose__nickname", "t-caption")}>
            {activePersona.nickname}
          </span>
        </span>

        <button
          type="button"
          className={cx("eg-compose__close", "eg-touch")}
          onClick={() => close(onClose)}
          aria-label="とじる"
        >
          <IconClose />
        </button>

        {/* 右上：送信 */}
        <Button className="eg-compose__send" disabled={!canSend} onClick={() => void submit()}>
          {submitting ? "おくっています…" : isBubble ? "バブる" : "あやす"}
        </Button>
      </header>

      {/* そのすぐ下：ペルソナ変更 */}
      <div className="eg-compose__persona">
        {isBubble ? (
          // 非表示にせず disabled。ラベルに理由を書く（DESIGN.md §0.3・§4 Disabled）
          <button type="button" disabled className={cx("eg-compose__swap", "t-label")}>
            <IconSwap />
            お母さんに変更（バブルは赤ちゃんだけ）
          </button>
        ) : canSwapPersona ? (
          <button
            type="button"
            className={cx("eg-compose__swap", "is-enabled", "t-label")}
            onClick={() => setPersona((current) => (current === "baby" ? "mother" : "baby"))}
          >
            <IconSwap />
            {persona === "baby" ? "お母さんに変更" : "赤ちゃんに変更"}
          </button>
        ) : (
          // お母さんへの返信ではボタンそのものを出さない（FR-COMMENT-005）
          <p className={cx("eg-compose__reason", "t-caption")}>
            {mode.kind === "reply" ? soothePersonaRule(mode.target).reason : null}
          </p>
        )}
      </div>

      {mode.kind === "reply" ? (
        <p className={cx("eg-compose__target", "t-caption")}>
          {mode.target.kind === "bubble"
            ? mode.target.authorNickname + " の バブルへ"
            : mode.target.authorNickname + " の あやすへ 返信"}
        </p>
      ) : null}

      <div className="eg-compose__body">
        <textarea
          ref={textareaRef}
          className={cx("eg-textarea", "t-input", over && "is-over")}
          value={body}
          placeholder="なにがあった？ ぜんぶ そのままで いいよ。"
          onChange={(event) => setBody(event.target.value)}
        />
        {/* あやすの文字数上限は仕様に無いので、カウンタもバブルのときだけ出す */}
        {isBubble ? <CharCounter text={body} /> : null}

        <div className="eg-compose__tags">
          {TAG_CATALOG.map((tag) => {
            const selected = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                className={cx("eg-tag-choice__item", "t-label", selected && "is-selected")}
                onClick={() =>
                  setTags((current) =>
                    current.includes(tag)
                      ? current.filter((item) => item !== tag)
                      : [...current, tag],
                  )
                }
              >
                {tag}
              </button>
            );
          })}
        </div>

        {rejected ? (
          <NoteBox variant="reject" title="匿名性を守るため、投稿できません" role="alert">
            {MODERATION_REJECT_TEXT}
          </NoteBox>
        ) : null}

        <NoteBox title="書くときの おやくそく">
          本名・会社や学校の名前・住所・電話番号・メール・外部サービスのID・URL・
          待ち合わせの約束は 書けません。
        </NoteBox>

        <div className="eg-compose__mock">
          <p className={cx("t-caption")}>モック操作：拒否の見え方を試すサンプル入力</p>
          <div className="eg-compose__mock-buttons">
            <Button variant="quiet" onClick={() => setBody(BLOCK_DEMO_INPUT)}>
              block になる例
            </Button>
            <Button variant="quiet" onClick={() => setBody(REWRITE_DEMO_INPUT)}>
              rewrite_required になる例
            </Button>
          </div>
        </div>
      </div>

      {/* 入力欄の下：3つ横並び */}
      <div className="eg-compose__tools">
        <ToolButton
          active={drawer === "stamp"}
          onClick={() => toggleDrawer("stamp")}
          icon={<IconStamp />}
          label="スタンプ"
        />
        <ToolButton
          active={drawer === "evaluate"}
          onClick={() => {
            toggleDrawer("evaluate");
            if (drawer !== "evaluate" && body.trim().length > 0) {
              void runEvaluate();
            }
          }}
          icon={<IconGauge />}
          label={persona === "baby" ? "赤ちゃん度" : "お母さん度"}
        />
        <ToolButton
          active={drawer === "transform"}
          onClick={() => {
            toggleDrawer("transform");
            if (drawer !== "transform" && body.trim().length > 0) {
              void runTransform();
            }
          }}
          icon={<IconWand />}
          label="変換"
        />
      </div>

      {/* 引き出し：パネルの下 2/5 */}
      {drawer !== "none" ? (
        <div className="eg-drawer">
          <div className="eg-drawer__head">
            <span className={cx("eg-drawer__title", "t-label")}>
              {drawer === "stamp" ? "スタンプ" : drawer === "evaluate" ? "ことばを はかる" : "ことばの お手伝い"}
            </span>
            <button
              type="button"
              className={cx("eg-drawer__close", "t-label")}
              onClick={() => setDrawer("none")}
            >
              とじる
            </button>
          </div>

          <div className="eg-drawer__body">
            {drawer === "stamp" ? (
              <div className="eg-stamp-grid">
                {STAMP_CATALOG.map((stamp) => (
                  <button
                    key={stamp.id}
                    type="button"
                    className={cx("eg-stamp-pick", "eg-touch")}
                    onClick={() => setBody((current) => current + ":" + stamp.id + ":")}
                  >
                    <StampGlyph id={stamp.id} picker />
                    <span className={cx("t-caption")}>{stamp.name}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {drawer === "evaluate" ? (
              <EvaluateView
                busy={evaluating}
                failed={evaluateFailed}
                result={evaluation}
                personaKind={persona}
                hasBody={body.trim().length > 0}
              />
            ) : null}

            {drawer === "transform" ? (
              <AiTransformPanel
                state={aiAvailable ? ai : { kind: "unavailable" }}
                onUseTransformed={(text) => {
                  // 本文欄に入るだけ。保存はしない（FR-AI-TRANS-006/007）
                  setBody(text);
                  setAi({ kind: "idle" });
                }}
                onDismiss={() => setAi({ kind: "idle" })}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly icon: React.ReactNode;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx("eg-tool", "eg-touch", active && "is-active")}
      onClick={onClick}
    >
      {icon}
      <span className="t-label">{label}</span>
    </button>
  );
}

/**
 * 赤ちゃん度・お母さん度（FR-AI-EVAL-001〜004）。
 * バーだけで伝えず、数値を添える（DESIGN.md §4 Meter）。
 * この結果で投稿の可否は決めない（FR-AI-EVAL-006）。
 */
function EvaluateView({
  busy,
  failed,
  result,
  personaKind,
  hasBody,
}: {
  readonly busy: boolean;
  readonly failed: boolean;
  readonly result: AiEvaluateResult | null;
  readonly personaKind: PersonaKind;
  readonly hasBody: boolean;
}) {
  if (!hasBody) {
    return <p className={cx("t-body", "eg-drawer__note")}>なにか 書いてから ためしてね。</p>;
  }
  if (busy) {
    return <p className={cx("t-body", "eg-drawer__note")} role="status">はかっています…</p>;
  }
  if (failed) {
    return (
      <NoteBox title="ことばのお手伝い" icon={<IconGauge />}>
        いま はかれません。判定できなくても、そのまま 投稿できます。
      </NoteBox>
    );
  }
  if (!result) {
    return null;
  }
  return (
    <div className="eg-evaluate">
      <p className={cx("eg-evaluate__axis", "t-label")}>{result.axis}</p>
      <p className={cx("eg-evaluate__value", "t-metric")}>{result.label}</p>
      <div
        className="eg-meter"
        role="img"
        aria-label={result.axis + " " + result.label}
      >
        <span
          className={cx("eg-meter__fill", "is-" + personaKind)}
          style={{ width: String(Math.round((result.months / MAX_MONTHS) * 100)) + "%" }}
        />
      </div>
      <p className={cx("eg-evaluate__note", "t-caption")}>
        目安です。この結果で 投稿できなくなることは ありません。
      </p>
    </div>
  );
}

export type { ComposeMode };
