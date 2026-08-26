import { issueToken, resolveAccountId, verifyPassword } from "../lib/auth.ts";
import { query } from "../lib/db.ts";
import { error, json, readJson } from "../lib/http.ts";

type AccountRow = { id: string; password_hash: string };
type PersonaRow = { id: string; nickname: string };

/**
 * ログインID・パスワードが存在しない場合とパスワードが誤っている場合を
 * 区別しないメッセージ（FR-AUTH-005）。総当たりでログインIDの存在を
 * 調べられないようにするため、両方のケースでこの1文だけを返す。
 */
const INVALID_CREDENTIALS_MESSAGE = "ログインIDまたはパスワードが違います";

export async function handleLogin(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (body === null) {
    return error("リクエストの形式が正しくありません", 400);
  }

  const { loginId, password } = body;
  if (typeof loginId !== "string" || typeof password !== "string") {
    return error(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const accountResult = await query<AccountRow>(
    "select id, password_hash from accounts where login_id = $1",
    [loginId.trim()],
  );
  const account = accountResult.rows[0];
  // アカウントが無い場合も、パスワード検証と同じ形の分岐にするため
  // ダミーの検証を行ってからfalseにする（早期returnで応答時間に差が出ないようにする）。
  const passwordOk = account
    ? await verifyPassword(password, account.password_hash)
    : await verifyPassword(password, DUMMY_HASH);

  if (!account || !passwordOk) {
    return error(INVALID_CREDENTIALS_MESSAGE, 401);
  }

  const [babyResult, motherResult] = await Promise.all([
    query<PersonaRow>(
      "select id, nickname from baby_personas where account_id = $1",
      [account.id],
    ),
    query<PersonaRow>(
      "select id, nickname from mother_personas where account_id = $1",
      [account.id],
    ),
  ]);

  const token = await issueToken(account.id);

  return json({
    baby: {
      id: babyResult.rows[0].id,
      kind: "baby",
      nickname: babyResult.rows[0].nickname,
    },
    mother: {
      id: motherResult.rows[0].id,
      kind: "mother",
      nickname: motherResult.rows[0].nickname,
    },
    token,
  });
}

/**
 * ログインIDが存在しないときも、存在するときと同じだけscryptを1回計算させるための
 * ダミーハッシュ。これが無いと「アカウントが存在しない」応答だけscrypt計算を
 * スキップして速く返り、応答時間の差からログインIDの存在を推測されうる。
 */
const DUMMY_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

/**
 * ログアウト。JWTはステートレスなのでサーバ側の強制失効は行わない
 * （design_doc.md 6.4章）。トークンが有効なことだけ確認し、実際の破棄は
 * クライアント側に委ねる。
 */
export async function handleLogout(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) {
    return error("認証が必要です", 401);
  }
  return new Response(null, { status: 204 });
}
