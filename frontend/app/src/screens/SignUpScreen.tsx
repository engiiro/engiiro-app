import { useState } from "react";

import {
  ACCOUNT_ID_RULE_TEXT,
  NICKNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  createAccount,
} from "../data/api";
import type { CreateAccountResult } from "../data/types";
import { cx } from "../lib/cx";
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
 * ★ 認証の仕様は未確定（Issue #7、status:needs-human）。
 *   ここに書いてある規則（ID の形・パスワードの長さ）は画面を動かすための仮置きで、
 *   決まったら data/api.ts の定数といっしょに直す。
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
    password_weak: "パスワードは " + String(PASSWORD_MIN_LENGTH) + " 文字以上に してください。",
    nickname_empty: "ふたつとも ニックネームを 入れてください。",
    nickname_too_long:
      "ニックネームは " + String(NICKNAME_MAX_LENGTH) + " 文字までに してください。",
    nickname_same:
      "ふたつの ニックネームを 同じに できません。同じだと、同じ人だと 分かってしまいます。",
    /* 匿名性の保護として説明する。当たった規則そのものは書かない（FR-MOD-033/034） */
    nickname_moderation:
      "えんじいろでは、あなたと 他の利用者の 匿名性を まもるため、個人が特定できる情報・外部連絡先・実際に会うための内容は ニックネームにも つかえません。",
  };

type SignUpScreenProps = {
  /** 登録できたら、決まったニックネームを渡して本編へ */
  readonly onDone: (babyNickname: string) => void;
  readonly onBack: () => void;
};

export function SignUpScreen({ onDone, onBack }: SignUpScreenProps) {
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [babyNickname, setBabyNickname] = useState("");
  const [motherNickname, setMotherNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const filled =
    accountId.trim() !== "" &&
    password !== "" &&
    babyNickname.trim() !== "" &&
    motherNickname.trim() !== "";

  async function submit() {
    setSending(true);
    setError(null);
    const result = await createAccount({ accountId, password, babyNickname, motherNickname });
    setSending(false);
    if (!result.ok) {
      setError(ERROR_TEXT[result.reason]);
      return;
    }
    /* 認証情報を画面に残さない（FR-ACCOUNT-003） */
    setPassword("");
    onDone(result.me.baby.nickname);
  }

  return (
    <div className="eg-signup">
      <form
        className="eg-signup__sheet"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <header className="eg-signup__head">
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

        <div className="eg-signup__password">
          <TextField
            label="パスワード"
            hint={String(PASSWORD_MIN_LENGTH) + " 文字以上"}
            type={showPassword ? "text" : "password"}
            value={password}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className={cx("eg-signup__peek", "t-label")}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "かくす" : "みる"}
          </button>
        </div>

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
              hint="よわねを 吐き出すときの 名前"
              value={babyNickname}
              maxLength={NICKNAME_MAX_LENGTH}
              onChange={(event) => setBabyNickname(event.target.value)}
            />
          </div>

          <div className="eg-signup__name">
            <PersonaAvatar kind="mother" size="md" />
            <TextField
              label="お母さんの ニックネーム"
              hint="だれかを あやすときの 名前"
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
      </form>
    </div>
  );
}
