// ニックネームの検査。登録（accounts.ts）と変更（profile.ts）が同じものを見る。
//
// docs/specification.md にニックネームの文字数・使用可能文字の規定は無い（2026-08-28 時点）。
// そこで「既存の画面がすでに約束していること」を規則として起こした：
//
//   - frontend の登録画面が maxLength=20 を入力欄に掛けている
//     → 上限 20 文字（NICKNAME_MAX_LENGTH。frontend/app/src/data/api.ts と同じ値）
//   - 登録画面が「ふたつの ニックネームを 同じに できません」と書いている
//     → 両ペルソナで同一のニックネームを拒否する（FR-PERSONA-003 の手がかりを消すため）
//   - 表示は1行のチップ（PersonaChip）
//     → 改行・タブ・制御文字は入れない
//
// これまで backend 側は「空でないこと」しか見ていなかったため、画面の約束が
// サーバで守られていなかった（登録時に同一ニックネームがそのまま通る状態だった）。
//
// ★ モデレーション（checkModeration）はここに掛けていない。理由は2つ。
//   1. あれは本文用で、部分一致で判定する。短いニックネームに掛けると
//      「よしねこ」が「しね」を含む、といった誤検知が出る
//   2. ニックネームをモデレーションの対象にするかは PO 判断待ち（Issue #30 の A-1）
//   登録画面には nickname_moderation の文言が用意されているが、判定を入れるのは
//   A-1 が決まり、ニックネーム用の判定が用意できてからにする。

/** 上限。frontend/app/src/data/api.ts の NICKNAME_MAX_LENGTH と同じ値 */
export const NICKNAME_MAX_LENGTH = 20;

/**
 * 改行・タブを含む制御文字が入っていないか。1行のチップに出すので入れさせない。
 *
 * 正規表現ではなくコードポイントで見る（制御文字を字面で書いた正規表現は
 * no-control-regex に当たるうえ、ソース上で目に見えない）。
 */
function hasControlChar(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export type NicknameProblem = "empty" | "too_long" | "charset";

export interface NicknameCheck {
  /** 前後の空白を落としたあとの値。保存するのはこちら */
  value: string;
  problem?: NicknameProblem;
}

/**
 * 1つのニックネームを検査する。
 *
 * 文字数はコードポイントで数える（絵文字を2文字と数えない）。
 * frontend の countChars と同じ数え方。
 */
export function checkNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== "string") return { value: "", problem: "empty" };

  // 前後の空白は落とす。JSのtrimは全角スペース（U+3000）も落とす
  const value = raw.trim();

  if (value === "") return { value, problem: "empty" };
  if (hasControlChar(value)) return { value, problem: "charset" };
  if ([...value].length > NICKNAME_MAX_LENGTH) {
    return { value, problem: "too_long" };
  }
  return { value };
}

/** 画面に出す文。どの規則に当たったかは書くが、内部の判定は書かない */
export const NICKNAME_PROBLEM_MESSAGE: Readonly<
  Record<NicknameProblem, string>
> = {
  empty: "ニックネームを入力してください。",
  too_long: `ニックネームは${NICKNAME_MAX_LENGTH}文字までにしてください。`,
  charset: "ニックネームに改行や制御文字は使えません。",
};

/**
 * 2つのニックネームが同じか。
 *
 * 同じ名前が赤ちゃんとお母さんの両方に出ると、それだけで同一人物の手がかりになる
 * （FR-PERSONA-003）。前後の空白を落としたうえで比べる。
 * 「よわねA / よわねB」のような**類似は見ていない**（Issue #30 の A-2、PO 判断待ち）。
 */
export function isSameNickname(baby: string, mother: string): boolean {
  return baby === mother;
}
