// docs/design_doc.md 7.1章 POST/DELETE /api/sessions に対応する。

import { query } from "../lib/db.ts";
import { issueToken, resolveAccountId, verifyPassword } from "../lib/auth.ts";
import { error, json, readJson } from "../lib/http.ts";
import type {
  AccountRow,
  BabyPersonaRow,
  MotherPersonaRow,
} from "../models/types.ts";

export async function handleLogin(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const { loginId, password } = body;
  if (typeof loginId !== "string" || typeof password !== "string") {
    return error("ログインIDとパスワードを入力してください。", 400);
  }

  // ログインIDが存在しない場合とパスワードが誤っている場合を区別しない
  // （design_doc.md 7.1章：総当たりでログインIDの存在を調べられないようにするため）。
  const invalidCredentials = () =>
    error("ログインIDまたはパスワードが正しくありません。", 401);

  const accountResult = await query<AccountRow>(
    "select * from accounts where login_id = $1",
    [loginId],
  );
  const account = accountResult.rows[0];
  if (!account) return invalidCredentials();

  const valid = await verifyPassword(password, account.password_hash);
  if (!valid) return invalidCredentials();

  const babyResult = await query<BabyPersonaRow>(
    "select id, nickname from baby_personas where account_id = $1",
    [account.id],
  );
  const motherResult = await query<MotherPersonaRow>(
    "select id, nickname from mother_personas where account_id = $1",
    [account.id],
  );

  const token = await issueToken(account.id);

  return json({
    babyPersona: {
      id: babyResult.rows[0].id,
      nickname: babyResult.rows[0].nickname,
    },
    motherPersona: {
      id: motherResult.rows[0].id,
      nickname: motherResult.rows[0].nickname,
    },
    token,
  });
}

export async function handleLogout(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  // JWTはステートレスなためサーバ側の即時失効は行わない（design_doc.md 6.4章）。
  // クライアント側でトークンを破棄することでログアウト状態を表現する。
  return new Response(null, { status: 204 });
}
