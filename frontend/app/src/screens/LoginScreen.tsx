import { useState } from "react";

import { ACCOUNT_ID_RULE_TEXT, login } from "../data/api";
import type { Me } from "../data/types";
import { cx } from "../lib/cx";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/Button";
import { NoteBox } from "../components/NoteBox";
import { TextField } from "../components/TextField";
import "./SignUpScreen.css";

/*
 * ログイン。S1 の兄弟なので、見た目は SignUpScreen.css をそのまま使う。
 *
 * ★ 失敗の理由を分けて出さない。
 *   「ID がありません」と「パスワードが違います」を区別すると、
 *   どの ID が存在するかを外から数えられる。ここは1つの文にまとめる。
 *
 * ★ ここでは パスワードの形を検査しない（人間の決定 2026-08-28）。
 *   登録側の規則（8文字以上・半角の英数字と記号）は 2026-08-28 に決まったもので、
 *   それ以前に作られたアカウントの パスワードは その形に従っていない。
 *   ログインで形を検査すると、既存の利用者が自分のアカウントから締め出される。
 *   規則の補足文もここには出さない（出すと「いまの自分のパスワードは違う」と読める）。
 *
 * ★ ID の形（ACCOUNT_ID_RULE_TEXT）は未確定のまま（Issue #7、status:needs-human）。
 *
 * ログインしなくても読むことはできる（人間の指示、2026-08-26）。
 * だから「もどる」は行き止まりではなく、読むのに戻る道として出す。
 */

export function LoginScreen({
  onDone,
  onSignUp,
  onGuest,
}: {
  readonly onDone: (me: Me) => void;
  readonly onSignUp: () => void;
  /** ログインせずに読むのに戻る */
  readonly onGuest: () => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    setError(null);
    const result = await login(accountId, password);
    setSending(false);
    if (!result.ok) {
      setError("ID か パスワードが ちがいます。もういちど 入れてみてください。");
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
          void submit();
        }}
      >
        <header className="eg-signup__head">
          <BrandMark className="eg-signup__mark" />
          <p className={cx("eg-signup__brand", "t-display")}>おかえりなさい</p>
          <button type="button" className={cx("eg-signup__back", "t-label")} onClick={onGuest}>
            ログインせずに よむ
          </button>
        </header>

        <TextField
          label="ID"
          hint={ACCOUNT_ID_RULE_TEXT}
          value={accountId}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => setAccountId(event.target.value)}
        />

        <TextField
          label="パスワード"
          type={showPassword ? "text" : "password"}
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
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

        {error ? (
          <NoteBox variant="reject" role="alert">
            {error}
          </NoteBox>
        ) : null}

        <Button type="submit" fullWidth disabled={accountId.trim() === "" || password === "" || sending}>
          {sending ? "たしかめています…" : "ログインする"}
        </Button>

        <button type="button" className={cx("eg-signup__switch", "t-label")} onClick={onSignUp}>
          はじめて？ アカウントを つくる
        </button>
      </form>
    </div>
  );
}
