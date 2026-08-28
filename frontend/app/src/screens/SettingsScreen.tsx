import { useId, useRef, useState } from "react";

import {
  NICKNAME_RULE_TEXT,
  nicknameProblem,
  updateNicknames,
} from "../data/api";
import type { Me, PersonaKind, UpdateNicknamesResult } from "../data/types";
import { cx } from "../lib/cx";
import { THEME_CHOICES, THEME_LABEL } from "../lib/useTheme";
import type { ThemeChoice } from "../lib/useTheme";
import { useResolvedTheme } from "../lib/useResolvedTheme";
import { Button } from "../components/Button";
import { IconCheck, IconChevronRight } from "../components/icons";
import { NoteBox } from "../components/NoteBox";
import { PersonaAvatar } from "../components/PersonaAvatar";
import { ScreenHeader } from "../components/ScreenHeader";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { TextField } from "../components/TextField";
import "./SettingsScreen.css";

/*
 * せってい（人間の指示、2026-08-27）。
 *
 * ★ この画面は docs/design_doc.md §4.1 の画面一覧（S1〜S8）に無い。
 *   中身を勝手に増やさず、**すでに決まっていること**だけを置く。
 *   置いたのはテーマの切り替え。DESIGN.md §8.3 が実装契約まで決めている、
 *   この画面で唯一「利用者が選ぶ」と決まっている設定だから。
 *
 * ★ なまえの変更を置いた（人間の指示、2026-08-28）。
 *   FR-PERSONA-002 の受入条件「一方のニックネーム変更が他方に反映されない」が、
 *   変更できることを前提にしている。サーバの口は PATCH /api/profile/me。
 *
 * ★ それ以外で仕様が決まっていないもの（おしらせの置き場所）は、
 *   押せる行にしない。押せる形にすると「あるのに動かない」に見える。
 *
 * ★ 通報・DM・フォロワー数の項目は作らない。0 を返すのではなく存在させない（16章 非スコープ）。
 *
 * テーマの見本は、その色そのもので見せる。
 * 見本の枠に data-theme を置くと、tokens/theme.css の入れ子側のブロックが効いて、
 * 選んでいないテーマの色でも描ける（theme.css の ★ 参照）。
 */

/** テーマごとの一行説明。ラベル（THEME_LABEL）だけでは何が変わるか分からない */
const THEME_NOTE: Readonly<Record<ThemeChoice, string>> = {
  system: "おつかいの 端末に あわせます",
  normal: "あかるい 地に 臙脂",
  dark: "よぞらの 色。暗くても まぶしくない",
  kid: "こうさく用紙みたいに あざやか",
};

/*
 * 仕様の説明。ここに書いてよいのは、すでに決まっていることの言いかえだけ。
 * 新しい約束をこの画面で作らない。
 */
const ABOUT: readonly { readonly title: string; readonly lines: readonly string[] }[] = [
  {
    title: "なまえと ひみつのこと",
    lines: [
      "あなたの 赤ちゃんと お母さんが 同じ人だとは、ほかの人には 分かりません。",
      "本名・会社や学校の名前・れんらく先・URL・待ち合わせの約束は、本文に 書けません。",
      "ことばの お手伝いには、だれが書いたのかを わたしていません。",
    ],
  },
  {
    title: "作っていない ものの こと",
    lines: [
      "だれが あなたを 大好きに したかは、あなたにも 見せません。",
      "1対1で やりとりする メッセージは ありません。",
      "お母さんからは バブルを 出せません。あやすだけ できます。",
    ],
  },
];

/** まだ決まっていないもの。押せる行にしない */
const SOON: readonly { readonly title: string; readonly note: string }[] = [
  { title: "おしらせ", note: "どこに 出すか まだ 決めていません" },
];

export function SettingsScreen({
  theme,
  onThemeChange,
  me,
  isGuest,
  onRenamed,
}: {
  readonly theme: ThemeChoice;
  readonly onThemeChange: (next: ThemeChoice) => void;
  /** 起動時の読み込みが終わるまで null */
  readonly me: Me | null;
  readonly isGuest: boolean;
  /** 保存できたとき。App が自分の情報と、いま開いている画面を引き直す */
  readonly onRenamed: (next: Me) => void;
}) {
  /*
   * 「OSに従う」の見本だけは、選択そのものでは色が決まらない。
   * いま実際に出ている側（ノーマル／ダーク）を見せる。
   */
  const resolved = useResolvedTheme();

  return (
    <>
      <ScreenHeader title="せってい" />

      <div className={cx("eg-column", "eg-settings")}>
        <NoteBox title="ここで えらぶ こと">
          えらんだ みための せっていは、この端末にだけ のこります。ほかの人には 見えません。
        </NoteBox>

        <section className="eg-settings__section">
          <h2 className={cx("eg-settings__title", "t-heading")}>みため</h2>
          <p className={cx("eg-settings__lead", "t-caption")}>
            えらぶと すぐ 切りかわります。見本は そのテーマの 色で 出しています。
          </p>

          <ul className="eg-theme-list">
            {THEME_CHOICES.map((choice) => {
              const current = theme === choice;
              return (
                <li key={choice}>
                  <button
                    type="button"
                    aria-pressed={current}
                    className={cx("eg-theme-card", "eg-touch", current && "is-current")}
                    onClick={() => onThemeChange(choice)}
                  >
                    {/*
                      見本。この中だけ別のテーマの色になる。
                      形（枠の太さ・角）もテーマで変わるので、色見本ではなく小さな画面にしている。
                    */}
                    <span
                      className="eg-theme-card__preview"
                      data-theme={choice === "system" ? resolved : choice}
                      aria-hidden="true"
                    >
                      <span className="eg-theme-card__bubble" />
                      <span className="eg-theme-card__row">
                        <span className="eg-theme-card__pill" />
                        <span className="eg-theme-card__dot" />
                      </span>
                    </span>

                    <span className="eg-theme-card__head">
                      <span className={cx("eg-theme-card__label", "t-label")}>
                        {THEME_LABEL[choice]}
                      </span>
                      {/* いま これ、を色だけで示さない（DESIGN.md §2.5） */}
                      {current ? (
                        <span className={cx("eg-theme-card__mark", "t-caption")}>
                          <IconCheck />
                          いま これ
                        </span>
                      ) : null}
                    </span>

                    <span className={cx("eg-theme-card__note", "t-caption")}>
                      {THEME_NOTE[choice]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/*
            動きの量は端末側の設定に従う（DESIGN.md §7.5）。
            アプリ側に同じスイッチを作ると、どちらが勝つのか分からなくなる。
          */}
          <p className={cx("eg-settings__lead", "t-caption")}>
            動きの量は、端末の「動きを へらす」設定に あわせます。
          </p>
        </section>

        <NicknameSection me={me} isGuest={isGuest} onRenamed={onRenamed} />

        <section className="eg-settings__section">
          <h2 className={cx("eg-settings__title", "t-heading")}>このアプリの こと</h2>
          {ABOUT.map((item) => (
            <Disclosure key={item.title} title={item.title} lines={item.lines} />
          ))}
        </section>

        <section className="eg-settings__section">
          <h2 className={cx("eg-settings__title", "t-heading")}>これから つくります</h2>
          <ul className="eg-settings__soon">
            {SOON.map((item) => (
              <li key={item.title} className="eg-settings__soon-row">
                <span className={cx("eg-settings__soon-title", "t-body")}>{item.title}</span>
                <span className={cx("eg-settings__soon-note", "t-caption")}>{item.note}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/**
 * ひらいて読む1項目。
 * 押せる行に見せるのは、実際に開く行だけ。行き先の無い `>` を並べない。
 */
function Disclosure({
  title,
  lines,
}: {
  readonly title: string;
  readonly lines: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <div className={cx("eg-disclose", open && "is-open")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        className={cx("eg-disclose__head", "eg-touch")}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={cx("eg-disclose__title", "t-body")}>{title}</span>
        <IconChevronRight className="eg-disclose__chevron" />
      </button>

      {/*
        閉じているときも DOM に置いたまま hidden で隠す。
        消してしまうと aria-controls の指す先が無くなる。
      */}
      <ul id={bodyId} className="eg-disclose__body" hidden={!open}>
        {lines.map((line) => (
          <li key={line} className={cx("eg-disclose__line", "t-body")}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

/*
 * なまえの変更（人間の指示、2026-08-28）。
 *
 * ★ 赤ちゃんとお母さんを同時に出さない（DESIGN.md §0.1-1
 *   「同じ画面に自分の両ペルソナを並べない。S8 だけが例外」）。
 *   切り替えて、選んだほう1つだけを出す。両方を並べた入力欄にすると、
 *   S1（登録）と S8 に続く3つめの例外を作ることになる。
 *   切り替えの部品は SegmentedTabs を使う（画面ごとに似て非なるタブを作らない）。
 *
 * ★ 保存中は二重に送らない。後から届いたほうが勝つ形になり、画面とサーバがずれる。
 *
 *   ★★ 止め方が2段ある。ボタンの disabled **だけでは足りない**。
 *      disabled が付くのは React が描き直したあと。同じフレームのうちに
 *      2回・3回と押されると（連打、Enter と クリックの重なり）、
 *      描き直しより先に onClick が全部走る。
 *      実際、ブラウザで3回連打したら 3回とも PATCH がサーバに届いた（2026-08-28 の確認）。
 *      そこで savingRef（描き直しを待たずにその場で立つ印）で入口を閉じ、
 *      disabled は「押せないことを目で見せる」ほうの役目に置いている。
 *
 * ★ 成功しても、送った文字列で画面を書き換えない。
 *   サーバが返した保存後の値（updateNicknames の me）を App に渡し、
 *   App がそれで自分の情報と いま開いている画面を引き直す。
 *   画面だけ変わったように見える状態を作らないため。
 *
 * ★ 同じ名前にできないことは、押す前から補足文に書いてある（NICKNAME_RULE_TEXT）。
 *   判定そのものはサーバが持つ。もう一方のニックネームをこの画面に出さずに
 *   突き合わせるには、サーバに聞くしかない。
 */

const PERSONA_TABS: readonly { readonly value: PersonaKind; readonly label: string }[] = [
  { value: "baby", label: "赤ちゃんの なまえ" },
  { value: "mother", label: "お母さんの なまえ" },
];

/** 失敗の理由を、直せる形の文にする */
const RENAME_ERROR_TEXT: Readonly<
  Record<Extract<UpdateNicknamesResult, { ok: false }>["reason"], string>
> = {
  empty: "なまえを 入れてください。",
  too_long: NICKNAME_RULE_TEXT + "。",
  charset: "改行や とくしゅな文字は つかえません。",
  same: "もう ひとつの なまえと 同じには できません。同じだと、同じ人だと 分かってしまいます。",
  unauthorized: "ログインしなおしてから、もう一度 ためしてください。",
  failed: "保存できませんでした。もう一度 ためしてください。",
};

/** 入力中に出す一行。空欄のあいだは出さない（まだ入れていないだけなので） */
const NICKNAME_PROBLEM_TEXT = {
  empty: "",
  too_long: NICKNAME_RULE_TEXT + "。",
  charset: "改行や とくしゅな文字は つかえません。",
} as const;

function NicknameSection({
  me,
  isGuest,
  onRenamed,
}: {
  readonly me: Me | null;
  readonly isGuest: boolean;
  readonly onRenamed: (next: Me) => void;
}) {
  const [kind, setKind] = useState<PersonaKind>("baby");
  /** 編集中の文字列。null なら「いまは読むだけ」 */
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /*
   * 送信中かどうかを、描き直しを待たずに持つ印（上の ★★）。
   * state は次の描画までしか効かないので、連打の入口はこちらで閉じる。
   */
  const savingRef = useRef(false);

  const persona = me === null ? null : kind === "baby" ? me.baby : me.mother;

  function switchKind(next: PersonaKind) {
    /* 切り替えたら書きかけを持ち越さない。別のペルソナの名前になってしまう */
    setKind(next);
    setDraft(null);
    setError(null);
    setSaved(false);
  }

  async function save() {
    /* 送信中の2回目以降は、ここで捨てる。ボタンの見た目より先に効く */
    if (draft === null || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setSaved(false);
    const result = await updateNicknames(
      kind === "baby" ? { baby: draft } : { mother: draft },
    );
    savingRef.current = false;
    setSaving(false);
    if (!result.ok) {
      setError(RENAME_ERROR_TEXT[result.reason]);
      return;
    }
    /* 読むだけの状態に戻す。出す名前はサーバが返したほう */
    setDraft(null);
    setSaved(true);
    onRenamed(result.me);
  }

  return (
    <section className="eg-settings__section">
      <h2 className={cx("eg-settings__title", "t-heading")}>なまえ</h2>

      {isGuest || me === null ? (
        <NoteBox title="なまえを かえるには">
          アカウントが いります。いまは よむだけの じょうたいです。
        </NoteBox>
      ) : (
        <>
          <p className={cx("eg-settings__lead", "t-caption")}>
            かえられるのは あなたの なまえだけです。ふたつの なまえは
            いちどに ひとつずつ かえます。
          </p>

          <SegmentedTabs
            tabs={PERSONA_TABS}
            current={kind}
            onChange={switchKind}
            panelId="eg-nickname-panel"
            label="どちらの なまえを かえるか"
          />

          <div
            id="eg-nickname-panel"
            role="tabpanel"
            aria-labelledby={"eg-nickname-panel-tab-" + kind}
            className="eg-nickname"
          >
            {draft === null ? (
              <>
                <div className="eg-nickname__current">
                  <PersonaAvatar kind={kind} size="md" />
                  <span className={cx("eg-nickname__name", "t-card-title")}>
                    {persona?.nickname}
                  </span>
                </div>

                {/* 成功したことを、消えるトーストだけに頼らない。この場にも残す */}
                {saved ? (
                  <p className={cx("eg-nickname__saved", "t-caption")} role="status">
                    <IconCheck />
                    なまえを かえました
                  </p>
                ) : null}

                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraft(persona?.nickname ?? "");
                    setSaved(false);
                    setError(null);
                  }}
                >
                  なまえを かえる
                </Button>
              </>
            ) : (
              <RenameForm
                kind={kind}
                draft={draft}
                saving={saving}
                error={error}
                onChange={(next) => {
                  setDraft(next);
                  setError(null);
                }}
                onSave={() => void save()}
                onCancel={() => {
                  /* 送信中に割り込ませない（ボタンの disabled と同じ理由。上の ★★） */
                  if (savingRef.current) return;
                  setDraft(null);
                  setError(null);
                }}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}

function RenameForm({
  kind,
  draft,
  saving,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  readonly kind: PersonaKind;
  readonly draft: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onChange: (next: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  const issue = nicknameProblem(draft);
  /* 空欄は「まだ入れていない」。ここで理由を出さず、保存だけ止める */
  const inlineError =
    issue === null || issue === "empty" ? undefined : NICKNAME_PROBLEM_TEXT[issue];
  const canSave = !saving && issue === null;

  return (
    <form
      className="eg-nickname__form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave();
      }}
    >
      <TextField
        label={kind === "baby" ? "赤ちゃんの ニックネーム" : "お母さんの ニックネーム"}
        hint={NICKNAME_RULE_TEXT}
        error={inlineError}
        value={draft}
        /* 上限そのものは nicknameProblem が見る。ここは入れすぎを軽く止めるだけ */
        maxLength={40}
        disabled={saving}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />

      {error ? (
        <NoteBox variant="reject" role="alert">
          {error}
        </NoteBox>
      ) : null}

      <div className="eg-nickname__actions">
        {/* 保存中はどちらも押せない。二重に送らせない */}
        <Button type="submit" disabled={!canSave}>
          {saving ? "ほぞんしています…" : "ほぞん"}
        </Button>
        <Button type="button" variant="quiet" disabled={saving} onClick={onCancel}>
          やめる
        </Button>
      </div>

      <p className={cx("eg-nickname__note", "t-caption")}>
        かえた なまえは、あなたの バブル・あやす・プロフィールの ぜんぶに 出ます。
      </p>
    </form>
  );
}
