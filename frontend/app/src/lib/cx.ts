/** class 名の合成。条件付きの class を書くたびに三項演算子を並べないための道具 */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}
