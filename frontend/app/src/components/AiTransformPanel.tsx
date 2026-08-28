import type { PersonaKind } from "../data/types";
import { cx } from "../lib/cx";
import { Button } from "./Button";
import { IconHourglass, IconPen, IconShield, IconWand } from "./icons";
import { MODERATION_REJECT_TEXT, NoteBox } from "./NoteBox";
import "./AiTransformPanel.css";

/*
 * AI 文章変換の状態表示（DESIGN.md §4、FR-AI-TRANS-002〜005、NFR-002/006）。
 *
 * 同じ場所（入力欄の下）に、状態ごとに違うものを出す：
 *   idle             … 何をする道具なのかと「変換する」ボタン
 *   working          … インジケータと「変換しています」（NFR-006）
 *   allow            … 変換文のプレビューと「これで書く」。押しても保存はしない
 *   rewrite_required … 書き換えの促し。変換文を使える形で出さない
 *   block            … 匿名性の保護としての説明。変換文も内部情報も出さない
 *   unavailable      … 「いま、ことばのお手伝いは使えません」（NFR-002）
 *
 * どの状態でも、本文の入力欄と投稿ボタンは生かしたまま（NFR-001 / NFR-003）。
 * それはこのコンポーネントの外側（画面）の責務なので、ここから無効化しない。
 *
 * ── idle を出すようにした理由（人間の指摘 2026-08-28「変換が分かりにくい」）──
 *
 * ★ 以前は idle で null を返していた。本文が空のまま「変換」を押すと
 *   **空の引き出しが開くだけ** で、何も起きず、何をすればいいかも書いていなかった。
 *   いまは「なにか 書いてから」と出し、ボタンも押せない形で見せる（DESIGN.md §0.3）。
 * ★ 一度変換したあとに本文を直すと、画面側が idle に戻す。前の変換文は
 *   直したあとの本文の変換ではないので、残しておくと嘘になる。
 *   そのかわり「変換する」がまたここに出るので、押し直せる。
 *   以前は引き出しを閉じて開き直すしか、もう一度変換する方法が無かった。
 * ★ 変換しても保存はされないこと（FR-AI-TRANS-006/007）は、押す前にも書く。
 *   結果が出たあとにだけ書いてあると、押すのをためらう理由がひとつ残る。
 */

export type AiPanelState =
  | { readonly kind: "idle" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "working" }
  | { readonly kind: "allow"; readonly transformedText: string }
  | { readonly kind: "rewrite_required" }
  | { readonly kind: "block" };

type AiTransformPanelProps = {
  readonly state: AiPanelState;
  /** いまどちらの顔で書いているか。変換の行き先が変わるので、案内文に出す */
  readonly personaKind: PersonaKind;
  /** 変換にかけられる本文があるか。無いときはボタンを押せない形で見せる */
  readonly canRun: boolean;
  /** 「変換する」を押したとき */
  readonly onRun: () => void;
  /** 本文欄に差し込むだけ。保存はしない（FR-AI-TRANS-006/007） */
  readonly onUseTransformed: (text: string) => void;
  readonly onDismiss: () => void;
};

export function AiTransformPanel({
  state,
  personaKind,
  canRun,
  onRun,
  onUseTransformed,
  onDismiss,
}: AiTransformPanelProps) {
  const destination = personaKind === "baby" ? "赤ちゃん" : "お母さん";

  return (
    <div className="eg-ai">
      {state.kind === "idle" ? (
        <div className="eg-ai__intro">
          <p className={cx("eg-ai__intro-text", "t-body")}>
            {canRun
              ? "いま 書いた ことばを、" + destination + "っぽい 言い方に かえてみます。"
              : "なにか 書いてから 押してね。書いた ことばを " + destination +
                "っぽい 言い方に かえてみます。"}
          </p>
          <p className={cx("eg-ai__caveat", "t-caption")}>
            かえた文は 本文に 入るだけ。えらばなければ、いまの ことばの ままです。
          </p>
          <div className="eg-ai__actions">
            <Button onClick={onRun} disabled={!canRun}>
              <IconWand />
              変換する
            </Button>
          </div>
        </div>
      ) : null}

      {state.kind === "working" ? (
        <p className={cx("eg-ai__working", "t-body")} role="status">
          <IconHourglass />
          ことばを 変換しています…
        </p>
      ) : null}

      {state.kind === "unavailable" ? (
        <NoteBox title="ことばのお手伝い" icon={<IconWand />}>
          いま、ことばのお手伝いは使えません。そのままの ことばで 書いて だいじょうぶ。
        </NoteBox>
      ) : null}

      {state.kind === "allow" ? (
        <div className="eg-ai__preview">
          <span className={cx("eg-ai__preview-label", "t-label")}>こんな かんじ？</span>
          <p className={cx("eg-ai__preview-text", "t-bubble-body", "eg-prose")}>
            {state.transformedText}
          </p>
          <p className={cx("eg-ai__caveat", "t-caption")}>
            「これで書く」を押すと本文に入るだけで、まだ投稿はされません。
          </p>
          <div className="eg-ai__actions">
            <Button variant="ghost" onClick={() => onUseTransformed(state.transformedText)}>
              これで書く
            </Button>
            {/* 本文を直さずに、もう一度かけたいとき。以前は開き直すしか手が無かった */}
            <Button variant="quiet" onClick={onRun}>
              もう一度
            </Button>
            <Button variant="quiet" onClick={onDismiss}>
              やめる
            </Button>
          </div>
        </div>
      ) : null}

      {/*
        block と見出しで区別できるようにする。疲れているときに本文の一行だけで
        読み分けさせない。「このままでは投稿できません」は DESIGN.md §4 の文言
      */}
      {state.kind === "rewrite_required" ? (
        <NoteBox
          variant="reject"
          title="このままでは投稿できません"
          icon={<IconPen />}
          role="alert"
        >
          つらさは そのままで だいじょうぶ。だれかを 責めることばだけ、書きかえてみて。
        </NoteBox>
      ) : null}

      {/*
        拒否の理由は匿名性の保護として説明する。判定の内部情報は出さない（FR-MOD-033/034）。
        見出しにも理由を入れて、rewrite_required と読み分けられるようにする
      */}
      {state.kind === "block" ? (
        <NoteBox
          variant="reject"
          title="匿名性を守るため、投稿できません"
          icon={<IconShield />}
          role="alert"
        >
          {MODERATION_REJECT_TEXT}
        </NoteBox>
      ) : null}
    </div>
  );
}
