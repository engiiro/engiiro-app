import { hashPassword, issueToken } from "../lib/auth.ts";
import { withTransaction } from "../lib/db.ts";
import { error, json, readJson } from "../lib/http.ts";

/**
 * `POST /api/accounts` の入力チェック。
 *
 * loginId・password・babyNickname・motherNicknameの文字種・長さ規則、
 * birthDateの妥当な範囲（未来日付や極端な高齢の扱い）は
 * design_doc.md 10章で未確定。ここでは「空でない文字列であること」
 * までの最低限のみ検査する（FR-COMMON-003）。
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** YYYY-MM-DD形式かどうかだけを確認する。実在する日付かはPostgres側のdate型に判定を委ねる。 */
function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * バブルの投稿者・あやすの発信者として、`GET /api/personas/*`等の公開系応答で
 * そのまま返せる形。design_doc.md 7.1章の`PublicPersona`に対応する。
 */
function toPublicPersona(
  row: { id: string; nickname: string },
  kind: "baby" | "mother",
) {
  return { id: row.id, kind, nickname: row.nickname };
}

export async function handleCreateAccount(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (body === null) {
    return error("リクエストの形式が正しくありません", 400);
  }

  const { loginId, password, birthDate, babyNickname, motherNickname } = body;
  if (
    !isNonEmptyString(loginId) ||
    !isNonEmptyString(password) ||
    !isDateString(birthDate) ||
    !isNonEmptyString(babyNickname) ||
    !isNonEmptyString(motherNickname)
  ) {
    return error("入力内容を確認してください", 422);
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
        [loginId.trim(), passwordHash, birthDate],
      );
      const account = accountResult.rows[0];

      const babyResult = await client.query<{ id: string; nickname: string }>(
        `insert into baby_personas (account_id, nickname)
         values ($1, $2)
         returning id, nickname`,
        [account.id, babyNickname.trim()],
      );
      const motherResult = await client.query<
        { id: string; nickname: string }
      >(
        `insert into mother_personas (account_id, nickname)
         values ($1, $2)
         returning id, nickname`,
        [account.id, motherNickname.trim()],
      );

      return {
        accountId: account.id,
        createdAt: account.created_at,
        baby: babyResult.rows[0],
        mother: motherResult.rows[0],
      };
    });

    const token = await issueToken(result.accountId);

    return json(
      {
        baby: toPublicPersona(result.baby, "baby"),
        mother: toPublicPersona(result.mother, "mother"),
        token,
        createdAt: result.createdAt,
      },
      201,
    );
  } catch (err) {
    // login_idのUNIQUE制約違反（23505）は重複として扱う。それ以外は想定外なので投げ直す。
    if (isUniqueViolation(err, "accounts_login_id_key")) {
      return error("このログインIDは既に使われています", 409);
    }
    throw err;
  }
}

function isUniqueViolation(err: unknown, constraint: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const cst = (err as { constraint?: unknown }).constraint;
  return code === "23505" && cst === constraint;
}
