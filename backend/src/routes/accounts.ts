// docs/design_doc.md 7.1章 POST /api/accounts に対応する。
// アカウント登録（ログインID・パスワード・生年月日）と、赤ちゃん／お母さん両ペルソナの
// 同時作成をひとつのトランザクションで行う。

import { query, withTransaction } from "../lib/db.ts";
import { hashPassword, issueToken } from "../lib/auth.ts";
import { error, json, readJson } from "../lib/http.ts";
import type { BabyPersonaRow, MotherPersonaRow } from "../models/types.ts";

const LOGIN_ID_PATTERN = /^[a-zA-Z0-9_-]{3,50}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  if (typeof password !== "string" || password.length < 8) {
    return error("パスワードは8文字以上にしてください。", 400);
  }
  if (typeof birthDate !== "string" || !DATE_PATTERN.test(birthDate)) {
    return error("生年月日はYYYY-MM-DD形式で入力してください。", 400);
  }
  if (Number.isNaN(Date.parse(birthDate)) || new Date(birthDate) > new Date()) {
    return error("生年月日が正しくありません。", 400);
  }
  if (typeof babyNickname !== "string" || babyNickname.trim() === "") {
    return error("赤ちゃんペルソナのニックネームを入力してください。", 400);
  }
  if (typeof motherNickname !== "string" || motherNickname.trim() === "") {
    return error("お母さんペルソナのニックネームを入力してください。", 400);
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
        [account.id, babyNickname],
      );
      const motherResult = await client.query<MotherPersonaRow>(
        `insert into mother_personas (account_id, nickname)
         values ($1, $2)
         returning id, nickname`,
        [account.id, motherNickname],
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
