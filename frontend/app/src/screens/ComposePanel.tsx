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
import { stampGroups } from "../data/stampCatalog";
import type { Me, PersonaKind } from "../data/types";
import { cx } from "../lib/cx";
import { INPUT_HARD_MAX, capInput, useSingleFlight } from "../lib/floodGuard";
import { safeText } from "../lib/safeText";
import { MAX_MONTHS } from "../lib/mockAiEvaluate";
import { REPLY_WORDING, replyKindOfSoothe } from "../lib/replyWording";
import { soothePersonaRule } from "../lib/soothePersonaRule";
import type { SootheTarget } from "../lib/soothePersonaRule";
import { AiTransformPanel } from "../components/AiTransformPanel";
import type { AiPanelState } from "../components/AiTransformPanel";
import { Button } from "../components/Button";
import { CharCounter } from "../components/CharCounter";
import { Illustration } from "../components/Illustration";
import { PersonaAvatar } from "../components/PersonaAvatar";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { BubbleBody, StampGlyph } from "../components/BubbleBody";
import {
  IconClose,
  IconGauge,
  IconSoothe,
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

  /*
   * 連打・多重送信のガード（lib/floodGuard.ts）。往復中に届いた2回目は捨てる。
   * ボタンの disabled（submitting / evaluating）はこれの代わりにならない。
   * state の反映を待つあいだに、同じフレームの2回目が通ってしまうため。
   */
  const sendFlight = useSingleFlight();
  const transformFlight = useSingleFlight();
  const evaluateFlight = useSingleFlight();
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

  /*
   * 道具（はかる・変換）の誘い（人間の指摘 2026-09-05
   * 「変換ボタンなどを押しやすくなるよう誘導できているか」）。
   *
   * 送信ボタンにだけ入れていた案2（＝「もう出せる」の合図）を、本文が要る道具にも広げる。
   *
   * ★ 型は同じものを使い回す。誘い方を2つに増やさない
   *   （docs/color_and_ui_findings.md §5「採るなら1つに絞るのが安全」）。
   * ★ 誘うのは「本文が入って、その道具が意味を持つようになった瞬間」だけ。
   *   一度でも開いた道具は二度と誘わない。使い方を知っている人に動きを見せ続けない。
   * ★ 送信ボタンと同じ瞬間に立ち上がるので、CSS 側で1拍ずらしてある
   *   （ComposePanel.css の animation-delay）。同時に2か所が跳ねると、
   *   どちらを見ればいいのか分からない。
   *
   * 動きが無くても分かることは変えていない（本文を入れれば、押した先に中身が出る）。
   * reduced motion では --pop-scale が 1 に潰れるので、この誘いは自動的に無害になる。
   */
  const hasBody = body.trim().length > 0;
  const wasUsefulRef = useRef(false);
  const [usedDrawers, setUsedDrawers] = useState<readonly DrawerKind[]>([]);
  const [justUseful, setJustUseful] = useState(false);

  useEffect(() => {
    if (hasBody && !wasUsefulRef.current) {
      // oxlint-disable-next-line react/set-state-in-effect
      setJustUseful(true);
    }
    wasUsefulRef.current = hasBody;
  }, [hasBody]);

  /** その道具が、いま誘ってよい状態か。本文があって、まだ一度も開いていないもの */
  function inviting(kind: DrawerKind): boolean {
    return hasBody && !usedDrawers.includes(kind);
  }

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
    /*
     * 貼り付け事故への手当て。桁を落とす（lib/floodGuard.ts）のと、
     * 混ざった制御文字・双方向の上書き・幅ゼロを落とす（lib/safeText.ts）。
     * 150 文字の上限はここで止めず、カウンタで知らせる（DESIGN.md §4）。
     */
    setBody(capInput(safeText(next)));
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
    /* 一度開いた道具は、もう誘わない（上の ★） */
    setUsedDrawers((current) => (current.includes(next) ? current : [...current, next]));
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
      /*
       * 想定外の失敗（通信断・応答の形が違う 等）。引き出しを working のまま置くと
       * 「ことばを 変換しています…」が永久に残り、押し直す道も消える。
       * 戻れる形にしてから投げ直す（原因は console に残す。握りつぶさない）。
       */
      setAi({ kind: "unavailable" });
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
        // 想定外の失敗でも、引き出しは戻れる形にしてから投げ直す（runTransform と同じ）
        setEvaluateFailed(true);
        setEvaluation(null);
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
    /*
     * ★ finally で必ず submitting を下ろす（2026-09-05）。
     *   通信が落ちると createBubble / createSoothe は例外で抜ける。以前はそこで
     *   setSubmitting(false) に届かず、ボタンが「おくっています…」のまま
     *   永久に押せなくなっていた（書いた本文を道連れにする閉じ方しか残らない）。
     */
    try {
      const result = isBubble
        ? await createBubble({ body })
        : await createSoothe({
            bubbleId: mode.kind === "reply" ? mode.target.bubbleId : "",
            personaKind: persona,
            body,
            replyToSootheId:
              mode.kind === "reply" && mode.target.kind === "soothe" ? mode.target.sootheId : undefined,
          });
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
        void evaluateFlight(runEvaluate);
      }
      if (result.reason === "ai_unavailable") {
        setEvaluateFailed(true);
        setDrawer("evaluate");
      }
    } finally {
      setSubmitting(false);
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
          onClick={() => void sendFlight(submit)}
          onAnimationEnd={() => setJustSendable(false)}
        >
          {submitting ? "おくっています…" : wording.send}
        </Button>
      </header>

      {/*
        返信先（人間の指示、2026-09-05）。書いている場所の上部に、返しにきた相手の
        バブル／あやすをそのまま置く。ペルソナ変更より前に出しているのは、
        「誰の、どのことばに返すか」が先に決まっていて、
        「どの顔で返すか」がそのあとに来る順序だから。
      */}
      {mode.kind === "reply" ? <ReplyTarget target={mode.target} /> : null}

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
            maxLength={INPUT_HARD_MAX}
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
        {/*
          スタンプは本文が無くても使える（押せば必ず棚が出る）ので誘わない。
          はかる・変換は本文が要るので、本文が入った瞬間だけ誘う（上の ★）。
        */}
        <ToolButton
          active={drawer === "stamp"}
          onClick={() => toggleDrawer("stamp")}
          icon={<IconStamp />}
          label="スタンプ"
        />
        <ToolButton
          active={drawer === "evaluate"}
          inviting={inviting("evaluate")}
          justInviting={justUseful}
          onInviteEnd={() => setJustUseful(false)}
          onClick={() => {
            toggleDrawer("evaluate");
            if (drawer !== "evaluate" && hasBody) {
              void evaluateFlight(runEvaluate);
            }
          }}
          icon={<IconGauge />}
          label={persona === "baby" ? "赤ちゃん度" : "お母さん度"}
        />
        <ToolButton
          active={drawer === "transform"}
          /* 生成が落ちているときは誘わない。押しても「いま つかえません」しか出ない（NFR-001） */
          inviting={aiTransformAvailable && inviting("transform")}
          justInviting={justUseful}
          onInviteEnd={() => setJustUseful(false)}
          onClick={() => {
            toggleDrawer("transform");
            if (drawer !== "transform" && hasBody) {
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
                state={aiTransformAvailable ? ai : { kind: "unavailable" }}
                personaKind={persona}
                canRun={body.trim().length > 0}
                onRun={() => void transformFlight(runTransform)}
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

/*
 * スタンプ一覧（FR-STAMP-001）。棚に分けたのは人間の指示（2026-08-27）、
 * 絵を入れたのも人間の指示（2026-08-28）。
 *
 * ★ 棚の並びとラベルは data/stampCatalog.ts が持つ。ここで並べ直さない。
 * ★ タブは SegmentedTabs の横に流す変種。ここ用のタブを新しく作らない
 *   （DESIGN.md §4：画面ごとに似て非なるタブを作らない）。
 * ★ 押すと本文には目印の文字が入る。絵になるのは出したあとなので、
 *   入力欄の下に「こう 出ます」を出している（上の ★ 参照）。
 */
function StampPicker({
  emotion,
  onEmotionChange,
  full,
  onPick,
}: {
  readonly emotion: string;
  readonly onEmotionChange: (next: string) => void;
  readonly full: boolean;
  readonly onPick: (id: string) => void;
}) {
  const groups = stampGroups();
  if (groups.length === 0) {
    return <p className={cx("t-body", "eg-drawer__note")}>スタンプを 読み込めませんでした。</p>;
  }
  /* 読み込みより先に選ばれていることがある。無い棚なら先頭に落とす */
  const current = groups.find((group) => group.key === emotion) ?? groups[0];

  return (
    <div className="eg-stamps">
      <SegmentedTabs
        tabs={groups.map((group) => ({ value: group.key, label: group.label }))}
        current={current.key}
        onChange={onEmotionChange}
        panelId="eg-stamp-panel"
        label="スタンプの たな"
        variant="scroll"
      />

      <div
        id="eg-stamp-panel"
        role="tabpanel"
        aria-labelledby={"eg-stamp-panel-tab-" + current.key}
        className="eg-stamp-grid"
      >
        {current.stamps.map((stamp) => (
          <button
            key={stamp.id}
            type="button"
            disabled={full}
            /*
              図と名前は見るためのもの。読み上げには「入れる」という操作を渡す。
              aria-label を置くと中の文字は読み上げの名前に使われないので、
              「ねむいのスタンプ ねむい」と二重に読まれない。
            */
            aria-label={stamp.name + " を 本文に 入れる"}
            className={cx("eg-stamp-pick", "eg-touch")}
            onClick={() => onPick(stamp.id)}
          >
            <StampGlyph id={stamp.id} picker />
            <span className={cx("eg-stamp-pick__name", "t-caption")}>{stamp.name}</span>
          </button>
        ))}
      </div>

      <p className={cx("eg-stamps__hint", "t-caption")}>
        {full
          ? "150文字に なったので、これ以上 入れられません。"
          : "カーソルの ある ところに 入ります。絵1つで 1文字ぶん。"}
      </p>
    </div>
  );
}

/**
 * 引き出しを開く道具ボタン。
 *
 *   inviting     … いま押しどき（本文が入っていて、まだ一度も開いていない）。輪郭で示す
 *   justInviting … 押しどきに「なった」瞬間。一度だけ pop する
 *
 * 2つに分けてあるのは、前者が続く状態で、後者が一度きりの出来事だから。
 * 1つにまとめると、状態が続くあいだ動き続けることになる（§7.2 と衝突する）。
 */
function ToolButton({
  active,
  inviting = false,
  justInviting = false,
  onInviteEnd,
  onClick,
  icon,
  label,
}: {
  readonly active: boolean;
  readonly inviting?: boolean;
  readonly justInviting?: boolean;
  readonly onInviteEnd?: () => void;
  readonly onClick: () => void;
  readonly icon: React.ReactNode;
  readonly label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        "eg-tool",
        "eg-touch",
        active && "is-active",
        !active && inviting && "is-inviting",
        !active && inviting && justInviting && "is-just-inviting",
      )}
      onClick={onClick}
      onAnimationEnd={onInviteEnd}
    >
      {icon}
      <span className="t-label">{label}</span>
    </button>
  );
}

/*
 * 返信先（人間の指示、2026-09-05）。
 *
 * ── 直した症状 ────────────────────────────────────────────────────
 * 書いている画面に出ていたのは「○○ の バブルへ」の一行だけだった。
 * 何に返しているのかを確かめるには、書くのをやめて画面を戻るしかなく、
 * 戻れば書きかけは消えた。
 *
 * ── 置き方 ────────────────────────────────────────────────────────
 * ★ 相手のことばを、こちらの入力欄と見た目で分ける。入力欄は吹き出しの形
 *   （--radius-balloon）なので、こちらは沈めた面（--card）に左の縦線を1本にする。
 *   引用であることを、色ではなく形で示す（DESIGN.md §2.5）。
 * ★ 長いものは畳まずスクロールさせる。切ると、返す相手のことばを
 *   こちらの都合で削ったことになる。高さの上限は CSS 側が持つ。
 * ★ ここから相手のプロフィールへは飛ばさない。飛べば書きかけが消える。
 *   出すのは顔と名前と本文だけで、押せる場所を作らない。
 */
function ReplyTarget({ target }: { readonly target: SootheTarget }) {
  /* 返信先がバブルなら、発信者は必ず赤ちゃん（FR-POST-003） */
  const authorKind: PersonaKind = target.kind === "bubble" ? "baby" : target.authorKind;
  const label =
    target.kind === "bubble"
      ? target.authorNickname + " の バブルへ"
      : target.authorNickname + " の あやすへ";

  return (
    <section className="eg-compose__target" aria-label="返信先">
      <p className={cx("eg-compose__target-label", "t-label")}>
        <IconSoothe className="eg-compose__target-icon" />
        {label}
      </p>
      <div className="eg-compose__target-quote">
        <PersonaAvatar kind={authorKind} size="sm" />
        <BubbleBody body={target.body} className="eg-compose__target-body" />
      </div>
    </section>
  );
}

/**
 * 赤ちゃん度・お母さん度（FR-AI-EVAL-001〜004）。
 * バーだけで伝えず、数値を添える（DESIGN.md §4 Meter）。
 *
 * ここは「自分がいまどれくらいか」を見るための場所で、合否は出さない
 * （PO 説明 2026-08-25、Issue #19）。保存してよいかを決めるのは backend で、
 * その閾値は frontend に無い。
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
        いま はかれません。はかれないあいだは 投稿できません。
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
        書きかえたら、もう一度 はかってね。
      </p>
    </div>
  );
}

export type { ComposeMode };
