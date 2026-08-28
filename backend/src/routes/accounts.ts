// docs/design_doc.md 7.1章 POST /api/accounts に対応する。
// アカウント登録（ログインID・パスワード・生年月日）と、赤ちゃん／お母さん両ペルソナの
// 同時作成をひとつのトランザクションで行う。

import { query, withTransaction } from "../lib/db.ts";
import { hashPassword, issueToken } from "../lib/auth.ts";
import { error, errorWithReason, json, readJson } from "../lib/http.ts";
import {
  checkNickname,
  isSameNickname,
  NICKNAME_PROBLEM_MESSAGE,
} from "../lib/nickname.ts";
import type { BabyPersonaRow, MotherPersonaRow } from "../models/types.ts";

const LOGIN_ID_PATTERN = /^[a-zA-Z0-9_-]{3,50}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/*
 * パスワードの規則（人間の決定、2026-08-28）。
 *
 * 8文字以上・半角の英字/数字/記号のみ。全角文字とスペースは不可。
 * 印字できるASCII（U+0021〜U+007E）はスペース（U+0020）を含まないので、
 * この1本で「記号は使える／空白は使えない／全角は使えない」を全部いえる。
 *
 * frontend/app/src/data/api.ts の PASSWORD_ALLOWED と同じ形。
 * 片方だけ直すと、画面は通すのにサーバが弾く（またはその逆）状態になる。
 */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_PATTERN = /^[!-~]+$/;

/*
 * ★ ここで検査するのは登録だけ。ログイン（sessions.ts）では検査しない。
 *   この規則が決まる前に作られたアカウントのパスワードは この形に従っておらず、
 *   ログイン側で弾くと既存の利用者が自分のアカウントから締め出される。
 */
const PASSWORD_RULE_MESSAGE =
  "パスワードは8文字以上で、半角の英字・数字・記号だけが使えます（全角文字と空白は使えません）。";

export async function handleCreateAccount(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const { loginId, password, birthDate, babyNickname, motherNickname } = body;

  if (typeof loginId !== "string" || !LOGIN_ID_PATTERN.test(loginId)) {
    return error(
      "ログインIDは英数字・アンダースコア・ハイフンで3〜50文字にしてください。",
      400,
    );
  }
  if (
    typeof password !== "string" ||
    password.length < PASSWORD_MIN_LENGTH ||
    !PASSWORD_PATTERN.test(password)
  ) {
    // 画面側が同じ規則で先に止めているので、ここに来るのは直接叩かれた場合。
    // それでも理由は返す（frontendがpassword_weakとして出し分けられるように）。
    return errorWithReason(PASSWORD_RULE_MESSAGE, 400, "password_weak");
  }
  if (typeof birthDate !== "string" || !DATE_PATTERN.test(birthDate)) {
    return error("生年月日はYYYY-MM-DD形式で入力してください。", 400);
  }
  if (Number.isNaN(Date.parse(birthDate)) || new Date(birthDate) > new Date()) {
    return error("生年月日が正しくありません。", 400);
  }
  /*
   * ニックネームの検査は lib/nickname.ts に寄せてある（2026-08-28）。
   * 変更（PATCH /api/profile/me）と同じものを見る。
   * 以前はここで「空でないこと」しか見ておらず、登録画面が約束している
   * 「20文字まで」「ふたつを同じにできない」がサーバ側で守られていなかった。
   */
  const baby = checkNickname(babyNickname);
  const mother = checkNickname(motherNickname);
  for (const checked of [baby, mother]) {
    if (checked.problem) {
      return errorWithReason(
        NICKNAME_PROBLEM_MESSAGE[checked.problem],
        400,
        "nickname_" + checked.problem,
      );
    }
  }
  // 同じ名前が両方に出ると、それ自体が同一人物の手がかりになる（FR-PERSONA-003）
  if (isSameNickname(baby.value, mother.value)) {
    return errorWithReason(
      "赤ちゃんとお母さんのニックネームを同じにはできません。",
      400,
      "nickname_same",
    );
  }

  const existing = await query("select 1 from accounts where login_id = $1", [
    loginId,
  ]);
  if ((existing.rowCount ?? 0) > 0) {
    return error("そのログインIDは既に使われています。", 409);
  }

  const passwordHash = await hashPassword(password);

  try {
    const result = await withTransaction(async (client) => {
      const accountResult = await client.query<
        { id: string; created_at: string }
      >(
        `insert into accounts (login_id, password_hash, birth_date)
         values ($1, $2, $3)
         returning id, created_at`,
        [loginId, passwordHash, birthDate],
      );
      const account = accountResult.rows[0];

      const babyResult = await client.query<BabyPersonaRow>(
        `insert into baby_personas (account_id, nickname)
         values ($1, $2)
         returning id, nickname`,
        [account.id, baby.value],
      );
      const motherResult = await client.query<MotherPersonaRow>(
        `insert into mother_personas (account_id, nickname)
         values ($1, $2)
         returning id, nickname`,
        [account.id, mother.value],
      );

      return {
        accountId: account.id,
        createdAt: account.created_at,
        babyPersona: babyResult.rows[0],
        motherPersona: motherResult.rows[0],
      };
    });

    const token = await issueToken(result.accountId);

    return json(
      {
        babyPersona: {
          id: result.babyPersona.id,
          nickname: result.babyPersona.nickname,
        },
        motherPersona: {
          id: result.motherPersona.id,
          nickname: result.motherPersona.nickname,
        },
        token,
        createdAt: result.createdAt,
      },
      201,
    );
  } catch (err) {
    console.error("[accounts] create failed:", err);
    return error("アカウントの作成に失敗しました。", 500);
  }
}
