import { useState } from "react";

import {
  ACCOUNT_ID_RULE_TEXT,
  BIRTHDAY_MIN,
  NICKNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_RULE_TEXT,
  createAccount,
  isValidPassword,
  passwordProblem,
  todayIsoDate,
} from "../data/api";
import type { CreateAccountResult, Me } from "../data/types";
import { cx } from "../lib/cx";
import { useSingleFlight } from "../lib/floodGuard";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { NoteBox } from "../components/NoteBox";
import { PersonaAvatar } from "../components/PersonaAvatar";
import { TextField } from "../components/TextField";
import "./SignUpScreen.css";

/*
 * S1 アカウント登録。
 *
 * FR-ACCOUNT-001：1回の登録で赤ちゃんとお母さんの2ペルソナが同時にできる。
 * FR-ACCOUNT-002：ニックネームはそれぞれ設定する。
 * FR-ACCOUNT-003：認証情報は内部情報。画面に出したまま残さない。
 *
 * ★ 生年月日を受け取る（人間の指示、2026-08-27）。
 *   S8 本人専用プロフィールに出す項目なのに、入れる場所がどこにも無かった。
 *   これはアカウントの情報で、**ペルソナの情報ではない**。
 *   公開プロフィール（S6）の型にこの項目は無く、AI へも渡らない
 *   （FR-PRIV-003/004）。そのことを、入力欄のすぐ下に書いておく。
 *   ここで隠すと「なぜ要るのか」が分からないまま個人の情報を書かせることになる。
 *
 * ★ パスワードの規則は決まっている（人間の決定 2026-08-28）。
 *   8文字以上・半角の英数字と記号・全角とスペースは不可。判定は data/api.ts の
 *   passwordProblem 1本で、backend/src/routes/accounts.ts も同じ規則を持つ。
 *   ID の形（ACCOUNT_ID_RULE_TEXT）はまだ仮置き（Issue #7、status:needs-human）。
 *
 * ★ 2つのニックネームを並べて入力させる画面だが、これは登録の場面だけ。
 *   ここで決めた名前が同じ画面に並ぶのは、この先は S8 だけになる（DESIGN.md §0.1-1）。
 *   「似た名前にしないでほしい」ことを、ここで一度だけ伝えておく。
 *
 * エラーは、どの規則に当たったかの内部情報を出さずに、直せる形の文で返す。
 */

const ERROR_TEXT: Readonly<Record<Extract<CreateAccountResult, { ok: false }>["reason"], string>> =
  {
    account_id_invalid: "ID は " + ACCOUNT_ID_RULE_TEXT + " で つけてください。",
    account_id_taken: "その ID は すでに つかわれています。べつの ID に してください。",
    password_weak: "パスワードは " + PASSWORD_RULE_TEXT + "。",
    birthday_invalid: "生年月日を たしかめてください。きょうより あとの日は えらべません。",
    nickname_empty: "ふたつとも ニックネームを 入れてください。",
    nickname_too_long:
      "ニックネームは " + String(NICKNAME_MAX_LENGTH) + " 文字までに してください。",
    nickname_same:
      "ふたつの ニックネームを 同じに できません。同じだと、同じ人だと 分かってしまいます。",
    /* 匿名性の保護として説明する。当たった規則そのものは書かない（FR-MOD-033/034） */
    nickname_moderation:
      "えんじいろでは、あなたと 他の利用者の 匿名性を まもるため、個人が特定できる情報・外部連絡先・実際に会うための内容は ニックネームにも つかえません。",
  };

/*
 * パスワードが規則から外れている理由（人間の決定 2026-08-28）。
 *
 * ★ 押せないボタンの理由は、押す前に読める場所に出す（DESIGN.md §0.3）。
 *   規則そのものは補足文（PASSWORD_RULE_TEXT）に出しているので、ここでは
 *   「いま入っているものの、どこが規則から外れているか」だけを書く。
 * ★ 判定は data/api.ts の passwordProblem 1本。backend も同じ規則を持っている。
 */
const PASSWORD_PROBLEM_TEXT = {
  too_short: "パスワードは " + String(PASSWORD_MIN_LENGTH) + " 文字以上に してください。",
  charset:
    "パスワードに つかえるのは 半角の 英字・数字・記号だけです。全角の文字と スペースは つかえません。",
} as const;

type SignUpScreenProps = {
  /** 登録できたら、決まった両ペルソナの情報を渡して本編へ */
  readonly onDone: (me: Me) => void;
  readonly onBack: () => void;
  readonly onLogin: () => void;
  /** ログインせずに読むのに戻る（人間の指示、2026-08-26） */
  readonly onGuest: () => void;
};

export function SignUpScreen({ onDone, onBack, onLogin, onGuest }: SignUpScreenProps) {
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [birthday, setBirthday] = useState("");
  const [babyNickname, setBabyNickname] = useState("");
  const [motherNickname, setMotherNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  /*
   * 送信の二重発火を止める（lib/floodGuard.ts）。sending の disabled だけでは、
   * Enter を押しっぱなしにされたときの2回目が state の反映前に通ってしまう。
   */
  const sendFlight = useSingleFlight();

  /* 規則から外れているところ。空欄のあいだは出さない（まだ入れていないだけなので） */
  const passwordIssue = passwordProblem(password);

  const filled =
    accountId.trim() !== "" &&
    isValidPassword(password) &&
    birthday !== "" &&
    babyNickname.trim() !== "" &&
    motherNickname.trim() !== "";

  async function submit() {
    setSending(true);
    setError(null);
    const result = await createAccount({
      accountId,
      password,
      birthday,
      babyNickname,
      motherNickname,
    });
    setSending(false);
    if (!result.ok) {
      setError(ERROR_TEXT[result.reason]);
      return;
    }
    /* 認証情報を画面に残さない（FR-ACCOUNT-003） */
    setPassword("");
    onDone(result.me);
  }

  return (
    <div className="eg-signup">
      <form
        className="eg-signup__sheet"
        onSubmit={(event) => {
          event.preventDefault();
          void sendFlight(submit);
        }}
      >
        <header className="eg-signup__head">
          <BrandMark className="eg-signup__mark" />
          <p className={cx("eg-signup__brand", "t-display")}>はじめまして</p>
          <button type="button" className={cx("eg-signup__back", "t-label")} onClick={onBack}>
            説明に もどる
          </button>
        </header>

        <NoteBox>
          ひとつの 登録で、赤ちゃんの顔と お母さんの顔が いっしょに できます。
        </NoteBox>

        <TextField
          label="ID"
          hint={ACCOUNT_ID_RULE_TEXT + "。ほかの人と 同じ ID は つかえません"}
          value={accountId}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          onChange={(event) => setAccountId(event.target.value)}
        />

        <TextField
          label="パスワード"
          hint={PASSWORD_RULE_TEXT}
          error={passwordIssue ? PASSWORD_PROBLEM_TEXT[passwordIssue] : undefined}
          type={showPassword ? "text" : "password"}
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
          /* 入力欄と同じ行に置く。下にエラーが出てもボタンの位置が動かない */
          action={
            <button
              type="button"
              className={cx("eg-signup__peek", "t-label")}
              aria-pressed={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? "かくす" : "みる"}
            </button>
          }
        />

        <TextField
          label="生年月日"
          hint="自分のプロフィールにだけ 出ます。ほかの人からは 見えません"
          type="date"
          value={birthday}
          autoComplete="bday"
          min={BIRTHDAY_MIN}
          max={todayIsoDate()}
          onChange={(event) => setBirthday(event.target.value)}
        />

        <fieldset className="eg-signup__names">
          <legend className={cx("eg-signup__legend", "t-heading")}>ふたつの ニックネーム</legend>
          <p className={cx("eg-signup__legend-note", "t-caption")}>
            似た名前や 続きの名前に しないでください。ふたつが 同じ人のものだと
            気づかれない ほうが、安心して 弱音を はけます。
          </p>

          <div className="eg-signup__name">
            <PersonaAvatar kind="baby" size="md" />
            <TextField
              label="赤ちゃんの ニックネーム"
              hint={"よわねを 吐き出すときの 名前。" + String(NICKNAME_MAX_LENGTH) + " 文字まで"}
              value={babyNickname}
              maxLength={NICKNAME_MAX_LENGTH}
              onChange={(event) => setBabyNickname(event.target.value)}
            />
          </div>

          <div className="eg-signup__name">
            <PersonaAvatar kind="mother" size="md" />
            <TextField
              label="お母さんの ニックネーム"
              hint={"だれかを あやすときの 名前。" + String(NICKNAME_MAX_LENGTH) + " 文字まで"}
              value={motherNickname}
              maxLength={NICKNAME_MAX_LENGTH}
              onChange={(event) => setMotherNickname(event.target.value)}
            />
          </div>
        </fieldset>

        {error ? (
          <NoteBox variant="reject" role="alert">
            {error}
          </NoteBox>
        ) : null}

        <Button type="submit" fullWidth disabled={!filled || sending}>
          {sending ? "つくっています…" : "はじめる"}
        </Button>

        <button type="button" className={cx("eg-signup__switch", "t-label")} onClick={onLogin}>
          もう アカウントが ある？ ログインする
        </button>

        <button type="button" className={cx("eg-signup__stay", "t-label")} onClick={onGuest}>
          いまは つくらずに よむ
        </button>
      </form>
    </div>
  );
}
