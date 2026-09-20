import { useCallback, useEffect, useRef, useState } from "react";

import {
  AiUnavailableError,
  createBubble,
  createSoothe,
  evaluateText,
  transformText,
} from "../data/api";
import type { AiEvaluateResult } from "../data/api";
import { BUBBLE_MAX_LENGTH, containsStamp, countChars, isOverLimit } from "../data/constants";
import type { Me, PersonaKind } from "../data/types";
import { cx } from "../lib/cx";
import { REPLY_WORDING, replyKindOfSoothe } from "../lib/replyWording";
import { soothePersonaRule } from "../lib/soothePersonaRule";
import type { SootheTarget } from "../lib/soothePersonaRule";
import { AiTransformPanel } from "../components/AiTransformPanel";
import type { AiPanelState } from "../components/AiTransformPanel";
import { Button } from "../components/Button";
import { CharCounter } from "../components/CharCounter";
import { Illustration } from "../components/Illustration";
import { StampPicker } from "../components/compose/StampPicker";
import { BubbleBody } from "../components/BubbleBody";
import {
  IconClose,
  IconGauge,
  IconStamp,
  IconSwap,
  IconWand,
} from "../components/icons";
import { MODERATION_REJECT_TEXT, NoteBox } from "../components/NoteBox";
import { ComposeToolButton } from "../components/compose/ComposeToolButton";
import { EvaluationResult } from "../components/compose/EvaluationResult";
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
 * 見出し・送信ボタン・トーストのことば（人間の決定 2026-08-28）：
 *   バブル投稿                     … 「バブルを かく」／「バブる」
 *   バブル・赤ちゃんのあやすへ返す … 「あやす」／「あやす」
 *   お母さんのあやすへ返す         … 「バブルを かく」／「バブる」
 *   最後のものは赤ちゃんしか返せない場面なので、「あやす」では操作の主体と合わない。
 *   表は lib/replyWording.ts。ここに文を書かない。
 *
 * タグは外した。FR-POST-004 が 2026-08-25 の PO レビューでコメントアウトされたため。
 * 投稿ガイドライン（FR-PRIV-001）は仕様に残っているので置いている。
 */

type ComposeMode =
  | { readonly kind: "bubble" }
  | { readonly kind: "reply"; readonly target: SootheTarget };

type DrawerKind = "none" | "stamp" | "evaluate" | "transform";

type ComposePanelProps = {
  readonly mode: ComposeMode;
  readonly me: Me;
  /** AI 文章評価が使えるか。投稿の関門なので、落ちていると送れない（NFR-003） */
  readonly aiEvaluateAvailable: boolean;
  /** AI 文章生成が使えるか。落ちていても投稿とあやすは続けられる（NFR-001） */
  readonly aiTransformAvailable: boolean;
  readonly onClose: () => void;
  readonly onPosted: (message: string) => void;
};

export function ComposePanel({
  mode,
  me,
  aiEvaluateAvailable,
  aiTransformAvailable,
  onClose,
  onPosted,
}: ComposePanelProps) {
  const rule = mode.kind === "reply" ? soothePersonaRule(mode.target) : { allowed: ["baby"] as const };
  const canSwapPersona = mode.kind === "reply" && rule.allowed.length > 1;

  /*
   * いま書いているものの呼び名。
   * バブル投稿はそのまま「バブる」。返信のときは返信先で決まる
   * （お母さんのあやすへ返すのは赤ちゃんのバブルなので「バブる」）。
   */
  const wording = REPLY_WORDING[
    mode.kind === "reply" && mode.target.kind === "soothe"
      ? replyKindOfSoothe(mode.target.authorKind)
      : mode.kind === "reply"
        ? "soothe"
        : "bubble"
  ];

  const [persona, setPersona] = useState<PersonaKind>("baby");
  const [body, setBody] = useState("");
  const [drawer, setDrawer] = useState<DrawerKind>("none");
  /* いま開いているスタンプの棚（気持ち）。空なら先頭の棚に落ちる */
  const [stampEmotion, setStampEmotion] = useState("");
  const [ai, setAi] = useState<AiPanelState>({ kind: "idle" });
  const [evaluation, setEvaluation] = useState<AiEvaluateResult | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluateFailed, setEvaluateFailed] = useState(false);
  /*
   * 保存が閾値に届かず弾かれたか。
   * 「はかる」で見る指標とは別で、これは backend が返した結果（PO 説明 2026-08-25）。
   * 閾値を frontend が持たないので、押してみるまで分からない。
   */
  const [gateRejected, setGateRejected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  const isBubble = mode.kind === "bubble";
  const over = isBubble && isOverLimit(body);
  /*
   * 投稿には AI 評価の合格が要る（FR-AI-EVAL-007。2026-08-25 の PO 改訂）。
   * 合否は保存時に data/api.ts が判定するので、ここで先に「はかる」ことは求めない。
   * 押してから理由が分かる形にして、書くたびに1手増えるのを避けている。
   *
   * 評価そのものが使えないときだけ、押す前に止める（NFR-003。以前とは逆の規定）。
   * 文章生成が落ちているかどうかはここに関係しない（NFR-001）。
   */
  const canSend = body.trim().length > 0 && !over && !submitting && aiEvaluateAvailable;

  /*
   * 「もう出せる」の合図（人間の決定 2026-08-26 §0-3、
   * docs/color_and_ui_findings.md §5「押す前の誘い」の案2）。
   *
   * ★ 常時は動かさない。送れる状態に変わった瞬間だけ、送信ボタンが一度 pop する。
   *   案1（弱い呼吸）と案3（ホバーでしっぽが伸びる）は採らない。
   *   誘いは1つに絞らないと、DESIGN.md §7.2「常時動く背景は目を疲れさせる」と衝突する。
   *
   * ★ イージングは --ease-smooth-out。§7.2 が --ease-bounce を
   *   「リアクションを押した瞬間だけ」に限定しているので、そこは踏まない。
   *
   * 動きが無くても分かることは変えていない（ボタンの disabled が外れる）。
   * reduced motion では --pop-scale が 1 に潰れるので、この演出は自動的に無害になる。
   */
  const wasSendableRef = useRef(false);
  const [justSendable, setJustSendable] = useState(false);

  useEffect(() => {
    if (canSend && !wasSendableRef.current) {
      // oxlint-disable-next-line react/set-state-in-effect
      setJustSendable(true);
    }
    wasSendableRef.current = canSend;
  }, [canSend]);

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

  /**
   * 本文を変えたら、前の評価も前の変換も当てにならないので捨てる。
   *
   * ★ 変換の結果を消すのは 2026-08-28 に足した（人間の指摘「変換が分かりにくい」）。
   *   直したあとの本文に対して、直す前の変換文が「こんな かんじ？」として
   *   残り続けていた。捨てると引き出しは idle に戻り、「変換する」がまた出るので、
   *   直した本文で押し直せる。
   */
  function changeBody(next: string) {
    setBody(next);
    setEvaluation(null);
    setEvaluateFailed(false);
    setGateRejected(false);
    setAi({ kind: "idle" });
  }

  /*
   * スタンプを本文に挟む。
   *
   * ★ 末尾ではなく、いまカーソルがある位置に入れる。選択している範囲があれば
   *   置きかえる（textarea のふつうの作法に合わせる）。書いている途中で挟めないと、
   *   一度書いた文を消して並べ直すことになる。
   * ★ 入れたあとのカーソルはスタンプの直後。そのまま書き続けられる。
   *   本文欄は制御された入力なので、DOM に値が入るのを1フレーム待ってから戻す。
   */
  function insertStamp(id: string) {
    const marker = ":" + id + ":";
    const field = textareaRef.current;
    if (!field) {
      changeBody(body + marker);
      return;
    }
    const start = field.selectionStart;
    const end = field.selectionEnd;
    changeBody(body.slice(0, start) + marker + body.slice(end));
    const caret = start + marker.length;
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  }

  function toggleDrawer(next: DrawerKind) {
    setDrawer((current) => (current === next ? "none" : next));
  }

  async function runTransform() {
    setRejected(false);
    setAi({ kind: "working" });
    try {
      // ?ai-transform=off はデバッグ用の強制オフ（URL退避したモック操作の名残）。
      // 実際の生死はbackend/aiサービスの応答（503→AiUnavailableError）で決まる。
      if (!aiTransformAvailable) {
        throw new AiUnavailableError();
      }
      const result = await transformText(body, persona);
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
      if (!aiEvaluateAvailable) {
        throw new AiUnavailableError();
      }
      setEvaluation(await evaluateText(body, persona));
    } catch (error) {
      if (error instanceof AiUnavailableError) {
        // 評価が使えないときは投稿もできない（NFR-003、2026-08-25 の PO 改訂）
        setEvaluateFailed(true);
        setEvaluation(null);
      } else {
        throw error;
      }
    } finally {
      setEvaluating(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setRejected(false);
    setGateRejected(false);
    const result = isBubble
      ? await createBubble({ body })
      : await createSoothe({
          bubbleId: mode.kind === "reply" ? mode.target.bubbleId : "",
          personaKind: persona,
          body,
          replyToSootheId:
            mode.kind === "reply" && mode.target.kind === "soothe" ? mode.target.sootheId : undefined,
        });
    setSubmitting(false);
    if (result.ok) {
      close(() => onPosted(wording.done));
      return;
    }
    if (result.reason === "moderation") {
      // 入力内容は消さない。書き直せる状態で残す（DESIGN.md §4 拒否バナー）
      setRejected(true);
    }
    if (result.reason === "evaluation") {
      // 閾値に届かなかった。いまの指標を引き出しで見せる（閾値そのものは見せない）
      setGateRejected(true);
      setDrawer("evaluate");
      void runEvaluate();
    }
    if (result.reason === "ai_unavailable") {
      setEvaluateFailed(true);
      setDrawer("evaluate");
    }
  }

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
            {wording.title}
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
        <Button
          className={cx("eg-compose__send", justSendable && "is-just-sendable")}
          disabled={!canSend}
          onClick={() => void submit()}
          onAnimationEnd={() => setJustSendable(false)}
        >
          {submitting ? "おくっています…" : wording.send}
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
            : mode.target.authorNickname + " の あやすへ"}
        </p>
      ) : null}

      <div className="eg-compose__body">
        {/*
          入力欄は、この画面でいちばん大きい面にする（UI刷新 2026-08-26）。
          ここは弱音を書く場所なので、道具や注記より先に目に入るのは入力欄であるべき。

          ★ 空のときだけ「しずくのバブル」を中に置く。
            書き始めると opacity だけで静かに消える（要素は残るので高さが跳ねない）。
            装飾なので aria-hidden。読み上げは placeholder が担う。
        */}
        <div className={cx("eg-compose__field", body.length > 0 && "is-filled")}>
          <textarea
            ref={textareaRef}
            className={cx("eg-textarea", "t-input", over && "is-over")}
            value={body}
            placeholder="なにがあった？ ぜんぶ そのままで いいよ。"
            onChange={(event) => changeBody(event.target.value)}
          />
          <Illustration name="drops" className="eg-compose__field-art" />
        </div>
        {/* あやすの文字数上限は仕様に無いので、カウンタもバブルのときだけ出す */}
        {isBubble ? <CharCounter text={body} /> : null}

        {/*
          スタンプの見え方（人間の指示、2026-08-28）。

          ★ 入力欄は textarea なので、中に絵を出せない。押して入るのは `:naku:` という
            目印の文字で、絵になるのは出したあと。そこが分かるように、
            **スタンプが入っているときだけ** 出たあとの姿をその場に出す。
          ★ 常時は出さない。文字だけ書いているときに同じ本文を2回見せる意味が無い。
        */}
        {containsStamp(body) ? (
          <div className="eg-compose__preview">
            <p className={cx("eg-compose__preview-label", "t-label")}>こう 出ます</p>
            <BubbleBody body={body} className="eg-compose__preview-body" />
          </div>
        ) : null}


        {rejected ? (
          <NoteBox variant="reject" title="匿名性を守るため、投稿できません" role="alert">
            {MODERATION_REJECT_TEXT}
          </NoteBox>
        ) : null}

        <NoteBox title="書くときの おやくそく">
          本名・会社や学校の名前・住所・電話番号・メール・外部サービスのID・URL・
          待ち合わせの約束は 書けません。
        </NoteBox>
      </div>

      {/* 押す前に止めるのは AI 評価が落ちているときだけ（NFR-003） */}
      {!aiEvaluateAvailable ? (
        <p className={cx("eg-compose__gate", "t-caption")} role="status">
          いま ことばを はかれないので、投稿できません。
        </p>
      ) : null}
      {/* 閾値に届かず弾かれたとき（FR-AI-EVAL-007）。判定したのは backend */}
      {gateRejected ? (
        <p className={cx("eg-compose__gate", "t-caption")} role="status">
          {persona === "baby"
            ? "もう少し 赤ちゃんっぽく 書けたら 投稿できます。"
            : "もう少し お母さんっぽく 書けたら 投稿できます。"}
        </p>
      ) : null}

      {/* 入力欄の下：3つ横並び */}
      <div className="eg-compose__tools">
        <ComposeToolButton
          active={drawer === "stamp"}
          onClick={() => toggleDrawer("stamp")}
          icon={<IconStamp />}
          label="スタンプ"
        />
        <ComposeToolButton
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
        <ComposeToolButton
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
              {/* 見出しは下の道具ボタンと同じことばにする（「変換」を押して「お手伝い」が開かない） */}
              {drawer === "stamp" ? "スタンプ" : drawer === "evaluate" ? "ことばを はかる" : "ことばの 変換"}
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
              <StampPicker
                emotion={stampEmotion}
                onEmotionChange={setStampEmotion}
                /*
                 * 上限に届いていたら押せない。スタンプ1つで1文字ぶん使うので、
                 * 入れた瞬間に保存できない本文になる（FR-POST-002 / NFR-005）。
                 * あやすには上限が無いので、ここも見ない。
                 */
                full={isBubble && countChars(body) >= BUBBLE_MAX_LENGTH}
                onPick={insertStamp}
              />
            ) : null}

            {drawer === "evaluate" ? (
              <EvaluationResult
                busy={evaluating}
                failed={evaluateFailed}
                result={evaluation}
                personaKind={persona}
                hasBody={body.trim().length > 0}
              />
            ) : null}

            {drawer === "transform" ? (
              <AiTransformPanel
                state={aiTransformAvailable ? ai : { kind: "unavailable" }}
                personaKind={persona}
                canRun={body.trim().length > 0}
                onRun={() => void runTransform()}
                onUseTransformed={(text) => {
                  // 本文欄に入るだけ。保存はしない（FR-AI-TRANS-006/007）
                  changeBody(text);
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

export type { ComposeMode };
