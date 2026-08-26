import { create, getNumericDate, verify } from "@zaubrik/djwt";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SCRYPT_KEY_LENGTH = 64;

/**
 * パスワードをscryptでハッシュ化する。`salt:derivedKey`（共にhex）の形で1本の文字列にする。
 * ソルトは呼び出しごとにランダム生成するため、同じパスワードでも毎回違う文字列になる。
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(
    password,
    salt,
    SCRYPT_KEY_LENGTH,
  )) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

/**
 * パスワードが保存済みハッシュと一致するかを検証する。
 * `timingSafeEqual`を使い、一致・不一致の判定にかかる時間で情報が漏れないようにする。
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = (await scryptAsync(
    password,
    salt,
    SCRYPT_KEY_LENGTH,
  )) as Buffer;
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * JWTの署名鍵はモジュールのトップレベルで1回だけ作る（db.tsのpoolと同じ考え方）。
 * `JWT_SECRET`環境変数から作る。未設定のまま起動させるとログイン状態が
 * 誰にも作れなくなるため、起動時に検知して落とす。
 */
const JWT_SECRET = Deno.env.get("JWT_SECRET");
if (!JWT_SECRET) {
  throw new Error(
    "JWT_SECRET環境変数が設定されていません。認証トークンの署名に使う秘密鍵です。",
  );
}

const signingKeyPromise = crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

/**
 * トークンの有効期限（日数）。
 *
 * JWTはステートレスなのでサーバ側の即時失効ができない
 * （design_doc.md 6.4章）。その分、有効期限は短めにする方針の仮値。
 * 具体的な日数は10章のオープンイシューで未確定。
 */
const TOKEN_EXPIRY_DAYS = 14;

/** ログイン・アカウント登録の成功時にJWTを発行する。ペイロードは`accountId`のみ。 */
export async function issueToken(accountId: string): Promise<string> {
  const key = await signingKeyPromise;
  return await create(
    { alg: "HS256", typ: "JWT" },
    { accountId, exp: getNumericDate(60 * 60 * 24 * TOKEN_EXPIRY_DAYS) },
    key,
  );
}

/**
 * `Authorization: Bearer <token>`から取り出したトークンを検証し、`accountId`を返す。
 * 署名不正・期限切れ・形式不正のいずれでもnullを返す（呼び出し側は401にする）。
 */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    const key = await signingKeyPromise;
    const payload = await verify(token, key);
    const accountId = payload.accountId;
    return typeof accountId === "string" ? accountId : null;
  } catch {
    return null;
  }
}

/**
 * リクエストの`Authorization`ヘッダーから`accountId`を解決する。
 * ヘッダーが無い・形式が違う・トークンが無効なときはnull（未認証として扱う）。
 */
export async function resolveAccountId(
  request: Request,
): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return await verifyToken(token);
}
