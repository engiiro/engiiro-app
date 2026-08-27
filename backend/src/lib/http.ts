/** ルート1つ分の定義。 */
export interface Route {
  method: string;
  pattern: URLPattern;
  handler: (
    request: Request,
    params: Record<string, string | undefined>,
  ) => Promise<Response> | Response;
}

/** JSONのレスポンスを作る。 */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * エラーレスポンスを作る。
 * docs/design_doc.md 7章のエラー形式（`{ "error": "..." }`）に合わせ、
 * 内部の判定コードや辞書内容は含めない（FR-MOD-034、FR-AI-TRANS-009）。
 */
export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

/**
 * reason付きのエラーレスポンス。design_doc.mdの正本形式（{error}）に
 * reasonを足しただけなので、reasonを見ないクライアントには影響しない。
 */
export function errorWithReason(
  message: string,
  status: number,
  reason: string,
): Response {
  return json({ error: message, reason }, status);
}

/**
 * リクエストボディをJSONとして読む。
 * 壊れたJSONが来たときに500ではなく400を返せるよう、ここで失敗を吸収する。
 */
export async function readJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? body as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * 省略可能な文字列フィールドを取り出す。
 * 戻り値の意味は3通り。`undefined`はキーが無い（更新しない）、
 * `null`は型が不正、文字列は採用する値。
 */
export function optionalString(
  body: Record<string, unknown>,
  key: string,
): string | undefined | null {
  if (!(key in body)) return undefined;
  const value = body[key];
  return typeof value === "string" ? value : null;
}
