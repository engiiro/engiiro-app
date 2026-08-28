// docs/design_doc.md 7.1章 GET /api/profile/me に対応する。
// 本人しか呼べないエンドポイント。赤ちゃん／お母さん両ペルソナと生年月日を
// まとめて返すのはここだけ（FR-PERSONA-005、FR-PRIV-007）。
//
// PATCH /api/profile/me はニックネームの変更（人間の指示 2026-08-28）。
// 設計書 §7 の一覧にはまだ無い口で、実装フェーズの補完として足したもの。
// FR-PERSONA-002 の受入条件「一方のニックネーム変更が他方に反映されない」が
// 変更機能の存在を前提にしている。

import { query, withTransaction } from "../lib/db.ts";
import { resolveAccountId } from "../lib/auth.ts";
import {
  error,
  errorWithReason,
  json,
  optionalString,
  readJson,
} from "../lib/http.ts";
import {
  checkNickname,
  isSameNickname,
  NICKNAME_PROBLEM_MESSAGE,
} from "../lib/nickname.ts";
import type {
  AccountRow,
  BabyPersonaRow,
  MotherPersonaRow,
  PersonaAgeEstimateRow,
} from "../models/types.ts";

export async function handleGetMyProfile(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  // birth_dateはdate型。pgのデフォルトパーサーはJSのDateに変換してからISO文字列化するため
  // タイムゾーンの影響でYYYY-MM-DDがずれる。文字列としてそのまま取り出す。
  const accountResult = await query<AccountRow>(
    "select birth_date::text as birth_date from accounts where id = $1",
    [accountId],
  );
  const account = accountResult.rows[0];
  if (!account) return error("アカウントが見つかりません。", 404);

  const babyResult = await query<BabyPersonaRow>(
    "select id, nickname from baby_personas where account_id = $1",
    [accountId],
  );
  const motherResult = await query<MotherPersonaRow>(
    "select id, nickname from mother_personas where account_id = $1",
    [accountId],
  );
  const baby = babyResult.rows[0];
  const mother = motherResult.rows[0];

  const estimateResult = await query<PersonaAgeEstimateRow>(
    `select persona_type, persona_id, estimated_age
     from persona_age_estimates
     where (persona_type = 'baby' and persona_id = $1)
        or (persona_type = 'mother' and persona_id = $2)`,
    [baby.id, mother.id],
  );
  const babyEstimate = estimateResult.rows.find(
    (r: PersonaAgeEstimateRow) => r.persona_type === "baby",
  );
  const motherEstimate = estimateResult.rows.find(
    (r: PersonaAgeEstimateRow) => r.persona_type === "mother",
  );

  return json({
    birthDate: account.birth_date,
    babyPersona: {
      id: baby.id,
      nickname: baby.nickname,
      estimatedAge: babyEstimate?.estimated_age
        ? Number(babyEstimate.estimated_age)
        : null,
    },
    motherPersona: {
      id: mother.id,
      nickname: mother.nickname,
      estimatedAge: motherEstimate?.estimated_age
        ? Number(motherEstimate.estimated_age)
        : null,
    },
  });
}

/**
 * ニックネームの変更（人間の指示、2026-08-28）。
 *
 * ★ 他人のニックネームは変えられない。
 *   変更先をリクエストで受け取らない。トークンから引いた account_id を where に置き、
 *   「その持ち主の赤ちゃん／お母さん」だけを更新する。ペルソナ id を body で
 *   受ける作りにすると、他人の id を入れて叩けるようになるので、そうしていない。
 *
 * ★ 片方だけ送れる。送らなかった側は触らない（FR-PERSONA-002：
 *   一方のニックネーム変更が他方に反映されないこと）。
 *
 * ★ 2つが同じ名前になる変更は拒否する。同じ名前が両方に出ると、それ自体が
 *   同一人物の手がかりになる（FR-PERSONA-003）。片方だけ送られた場合も、
 *   保存後の組み合わせで判定する。
 */
export async function handleUpdateMyProfile(req: Request): Promise<Response> {
  const accountId = await resolveAccountId(req);
  if (!accountId) return error("認証が必要です。", 401);

  const body = await readJson(req);
  if (!body) return error("リクエストの形式が正しくありません。", 400);

  const rawBaby = optionalString(body, "babyNickname");
  const rawMother = optionalString(body, "motherNickname");

  // optionalStringは「キーが無い」をundefined、「型が違う」をnullで返す
  if (rawBaby === null || rawMother === null) {
    return errorWithReason(
      NICKNAME_PROBLEM_MESSAGE.empty,
      400,
      "nickname_empty",
    );
  }
  if (rawBaby === undefined && rawMother === undefined) {
    return errorWithReason(
      "変更するニックネームがありません。",
      400,
      "nothing_to_update",
    );
  }

  const nextBaby = rawBaby === undefined ? undefined : checkNickname(rawBaby);
  const nextMother = rawMother === undefined
    ? undefined
    : checkNickname(rawMother);
  for (const checked of [nextBaby, nextMother]) {
    if (checked?.problem) {
      return errorWithReason(
        NICKNAME_PROBLEM_MESSAGE[checked.problem],
        400,
        "nickname_" + checked.problem,
      );
    }
  }

  const babyResult = await query<BabyPersonaRow>(
    "select id, nickname from baby_personas where account_id = $1",
    [accountId],
  );
  const motherResult = await query<MotherPersonaRow>(
    "select id, nickname from mother_personas where account_id = $1",
    [accountId],
  );
  const baby = babyResult.rows[0];
  const mother = motherResult.rows[0];
  if (!baby || !mother) return error("アカウントが見つかりません。", 404);

  // 保存後にこうなる、という組み合わせで判定する
  const resultBaby = nextBaby?.value ?? baby.nickname;
  const resultMother = nextMother?.value ?? mother.nickname;
  if (isSameNickname(resultBaby, resultMother)) {
    return errorWithReason(
      "赤ちゃんとお母さんのニックネームを同じにはできません。",
      400,
      "nickname_same",
    );
  }

  try {
    await withTransaction(async (client) => {
      if (nextBaby) {
        await client.query(
          "update baby_personas set nickname = $1 where account_id = $2",
          [nextBaby.value, accountId],
        );
      }
      if (nextMother) {
        await client.query(
          "update mother_personas set nickname = $1 where account_id = $2",
          [nextMother.value, accountId],
        );
      }
    });
  } catch (err) {
    console.error("[profile] update nickname failed:", err);
    return error("ニックネームの変更に失敗しました。", 500);
  }

  // 変更後の値を返す。画面はこれで自分の表示を差し替える（推測で書き換えない）
  return json({
    babyPersona: { id: baby.id, nickname: resultBaby },
    motherPersona: { id: mother.id, nickname: resultMother },
  });
}
