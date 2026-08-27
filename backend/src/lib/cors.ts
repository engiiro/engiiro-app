// ローカル検証用のCORS対応。
//
// frontendの開発サーバ（Vite、既定で別オリジン）からbackendを直接叩けるようにするための
// 最小限の実装。許可オリジンは環境変数 CORS_ORIGIN で指定する（未設定時は "*"）。
// 本番でのオリジン制限方針は未確定（design_doc.md 10章のオープンイシュー）。

const ALLOWED_HEADERS = "content-type, authorization";
const ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";

function allowedOrigin(): string {
  return Deno.env.get("CORS_ORIGIN") ?? "*";
}

export function withCors(response: Response): Response {
  response.headers.set("access-control-allow-origin", allowedOrigin());
  response.headers.set("access-control-allow-methods", ALLOWED_METHODS);
  response.headers.set("access-control-allow-headers", ALLOWED_HEADERS);
  return response;
}

export function preflightResponse(): Response {
  return withCors(new Response(null, { status: 204 }));
}
