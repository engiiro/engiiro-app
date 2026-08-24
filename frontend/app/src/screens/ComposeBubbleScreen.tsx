import { useCallback, useState } from "react";

import { createBubble } from "../data/api";
import { BLOCK_DEMO_INPUT, REWRITE_DEMO_INPUT } from "../data/moderationSamples";
import { isOverLimit } from "../data/constants";
import { TAG_CATALOG } from "../data/tags";
import type { Me } from "../data/types";
import { AiUnavailableError, mockAiTransform } from "../lib/mockAiTransform";
import { cx } from "../lib/cx";
import { AiTransformPanel } from "../components/AiTransformPanel";
import type { AiPanelState } from "../components/AiTransformPanel";
import { Button } from "../components/Button";
import { CharCounter } from "../components/CharCounter";
import { IconWand } from "../components/icons";
import { MODERATION_REJECT_TEXT, NoteBox } from "../components/NoteBox";
import { ScreenHeader } from "../components/ScreenHeader";
import "./ComposeBubbleScreen.css";

/*
 * S3 バブル作成。
 *
 * 主役は本文入力欄（16px。iOS の自動拡大を避ける）。
 *
 * ペルソナ選択（DESIGN.md §0.3）：
 *   赤ちゃん = 選択済、お母さん = disabled でラベルに理由を書く。隠さない。
 *   バブルはお母さんでは投稿できない（FR-POST-003）という仕様を、
 *   選択肢を消して誤解させないため。S5 とは扱いが逆。
 *
 * 8つの状態：通常／130超／150超過／AI変換中／allow／rewrite_required／block／AI停止中。
 *   文字数の3つは本文の長さで、AI の4つは変換の結果で、AI 停止中はモック操作帯で切り替わる。
 *
 * 150 を超えても入力は止めず、投稿ボタンだけを無効化する（FR-POST-002 / NFR-005）。
 * AI がどの状態でも、本文欄と投稿ボタンは生かしたまま（NFR-001 / NFR-003）。
 */

type ComposeBubbleScreenProps = {
  readonly me: Me;
  readonly aiAvailable: boolean;
  readonly onBack: () => void;
  readonly onPosted: () => void;
};

export function ComposeBubbleScreen({
  me,
  aiAvailable,
  onBack,
  onPosted,
}: ComposeBubbleScreenProps) {
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<readonly string[]>([]);
  const [ai, setAi] = useState<AiPanelState>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [rejected, setRejected] = useState(false);

  const over = isOverLimit(body);
  const canPost = body.trim().length > 0 && !over && !submitting;

  const runTransform = useCallback(async () => {
    setRejected(false);
    setAi({ kind: "working" });
    try {
      // バブルは常に赤ちゃんペルソナなので、変換の style も baby 固定
      const result = await mockAiTransform(body, "baby", { available: aiAvailable });
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
  }, [aiAvailable, body]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setRejected(false);
    // 保存時にもう一度検査される。クライアントの判定は渡さない（FR-MOD-003/004）
    const result = await createBubble({ body, tags });
    setSubmitting(false);
    if (result.ok) {
      onPosted();
      return;
    }
    if (result.reason === "moderation") {
      // 入力内容は消さない。書き直せる状態で残す（DESIGN.md §4 拒否バナー）
      setRejected(true);
    }
  }, [body, onPosted, tags]);

  return (
    <>
      <ScreenHeader title="バブルを かく" onBack={onBack} />

      <div className={cx("eg-column", "eg-compose")}>
        <NoteBox title="バブルはいつでも赤ちゃん">
          バブルは 赤ちゃんペルソナとして 投稿します。お母さんでは 投稿できません。
        </NoteBox>

        <section className="eg-compose__block" aria-labelledby="eg-persona-title">
          <h2 id="eg-persona-title" className={cx("eg-compose__title", "t-label")}>
            だれとして 書く？
          </h2>
          <div className="eg-persona-choice">
            <button
              type="button"
              aria-pressed="true"
              className={cx("eg-persona-choice__item", "is-selected", "eg-touch")}
            >
              <span className={cx("eg-persona-choice__role", "t-button")}>赤ちゃんとして</span>
              <span className={cx("eg-persona-choice__name", "t-caption")}>
                {me.baby.nickname}
              </span>
            </button>
            {/*
              非表示にせず disabled。ラベルに理由を書く（DESIGN.md §0.3・§4 Disabled）。
              ニックネームは出さない（同じ画面に自分の両ペルソナを並べない。§0.1-1）
            */}
            <button
              type="button"
              disabled
              className={cx("eg-persona-choice__item", "is-disabled", "eg-touch")}
            >
              <span className={cx("eg-persona-choice__role", "t-button")}>
                お母さん（投稿不可）
              </span>
              <span className={cx("eg-persona-choice__name", "t-caption")}>
                あやすときだけ 使えます
              </span>
            </button>
          </div>
        </section>

        <section className="eg-compose__block" aria-labelledby="eg-body-title">
          <h2 id="eg-body-title" className={cx("eg-compose__title", "t-label")}>
            なにが あった？
          </h2>
          <textarea
            className={cx("eg-textarea", "t-input", over && "is-over")}
            value={body}
            rows={6}
            placeholder="なにがあった？ ぜんぶ そのままで いいよ。"
            onChange={(event) => setBody(event.target.value)}
          />
          <CharCounter text={body} />
        </section>

        <section className="eg-compose__block" aria-labelledby="eg-tags-title">
          <h2 id="eg-tags-title" className={cx("eg-compose__title", "t-label")}>
            タグ（なくても いいよ）
          </h2>
          <div className="eg-tag-choice">
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
        </section>

        <section className="eg-compose__block" aria-labelledby="eg-ai-title">
          <h2 id="eg-ai-title" className={cx("eg-compose__title", "t-label")}>
            ことばの お手伝い
          </h2>
          <Button
            variant="ghost"
            disabled={!aiAvailable || body.trim().length === 0 || ai.kind === "working"}
            onClick={() => {
              void runTransform();
            }}
          >
            <IconWand />
            あかちゃんの ことばに してもらう
          </Button>
          {/* AI が止まっていることは、押す前に分かるようにする（NFR-002） */}
          {!aiAvailable ? (
            <div className="eg-compose__ai-note">
              <AiTransformPanel
                state={{ kind: "unavailable" }}
                onUseTransformed={() => undefined}
                onDismiss={() => undefined}
              />
            </div>
          ) : (
            <div className="eg-compose__ai-note">
              <AiTransformPanel
                state={ai}
                onUseTransformed={(text) => {
                  // 本文欄に入るだけ。保存はしない（FR-AI-TRANS-006/007）
                  setBody(text);
                  setAi({ kind: "idle" });
                }}
                onDismiss={() => setAi({ kind: "idle" })}
              />
            </div>
          )}
        </section>

        {/* 保存時の拒否。理由は匿名性の保護として説明する（FR-MOD-033） */}
        {rejected ? (
          <NoteBox variant="reject" title="このままでは投稿できません" role="alert">
            {MODERATION_REJECT_TEXT}
          </NoteBox>
        ) : null}

        {/* 投稿ガイドライン（FR-PRIV-001） */}
        <NoteBox title="書くときの おやくそく">
          本名・会社や学校の名前・住所・電話番号・メール・外部サービスのID・URL・
          待ち合わせの約束は 書けません。「会社で つかれた」くらいの ぼんやりした 書き方で
          だいじょうぶ。
        </NoteBox>

        <section className="eg-compose__mock" aria-label="モック操作">
          <p className={cx("eg-compose__mock-caption", "t-caption")}>
            モック操作：AI と保存の拒否を見るためのサンプル入力
          </p>
          <div className="eg-compose__mock-buttons">
            <Button variant="quiet" onClick={() => setBody(BLOCK_DEMO_INPUT)}>
              block になる例
            </Button>
            <Button variant="quiet" onClick={() => setBody(REWRITE_DEMO_INPUT)}>
              rewrite_required になる例
            </Button>
          </div>
        </section>
      </div>

      <div className="eg-actionbar">
        <div className="eg-column">
          <Button fullWidth disabled={!canPost} onClick={() => void submit()}>
            {submitting ? "ぽいっと しています…" : "バブルを ぽいっとする"}
          </Button>
        </div>
      </div>
    </>
  );
}
