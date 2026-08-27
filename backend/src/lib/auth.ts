// パスワードハッシュ化とJWTの発行・検証。
// docs/design_doc.md 6.4章「認証・セッションの持ち方」に対応する。
//
// JWTのペイロードは `{ accountId, iat, exp }` のみ（同章参照）。生年月日やペルソナ情報など
// 機微な内容は載せない。署名鍵は環境変数 JWT_SECRET から読む。ローカル検証用の仮値を
// フォールバックに持つが、本番相当の環境では必ず環境変数で上書きする。

import { create, verify } from "djwt";
import bcrypt from "bcrypt";

const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24時間。トークンの正式な有効期限は未確定（design_doc.md 7.1章）だが、ローカル検証用に短めの値を仮置きする。

let cachedKey: CryptoKey | null = null;

async function getSigningKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const secret = Deno.env.get("JWT_SECRET") ??
    "local-dev-only-insecure-secret-change-me";

  cachedKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return cachedKey;
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export async function issueToken(accountId: string): Promise<string> {
  const key = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  return await create(
    { alg: "HS256", typ: "JWT" },
    { accountId, iat: now, exp: now + TOKEN_TTL_SECONDS },
    key,
  );
}

/** トークンを検証し、accountIdを取り出す。無効・期限切れなら null。 */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    const key = await getSigningKey();
    const payload = await verify(token, key);
    const accountId = payload.accountId;
    return typeof accountId === "string" ? accountId : null;
  } catch {
    return null;
  }
}

/**
 * `Authorization: Bearer <token>` からaccountIdを解決する。
 * ヘッダーが無い、または無効な場合はnull（＝未認証として扱う。呼び出し側で
 * 認証必須のエンドポイントなら401を返す）。
 */
export async function resolveAccountId(
  req: Request,
): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header) return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  return await verifyToken(match[1]);
}
