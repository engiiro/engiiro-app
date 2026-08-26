import { handleCreateAccount } from "./src/routes/accounts.ts";
import { handleEvaluate } from "./src/routes/ai.ts";
import { closePool } from "./src/lib/db.ts";
import { error, type Route } from "./src/lib/http.ts";
import { handleHealth } from "./src/routes/health.ts";
import {
  handleCreatePost,
  handleDeletePost,
  handleFeed,
  handleGetPost,
} from "./src/routes/posts.ts";
import { handleLogin, handleLogout } from "./src/routes/sessions.ts";

// エンドポイント一覧・リクエスト/レスポンス形式は docs/design_doc.md 7章を参照。
// 増えてきたらフレームワーク（Hono等）の導入も検討する。
const routes: Route[] = [
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/health" }),
    handler: handleHealth,
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/accounts" }),
    handler: handleCreateAccount,
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/sessions" }),
    handler: handleLogin,
  },
  {
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/api/sessions" }),
    handler: handleLogout,
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/posts" }),
    handler: handleCreatePost,
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/posts/feed" }),
    handler: handleFeed,
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/posts/:id" }),
    handler: (req, params) => handleGetPost(req, params.id!),
  },
  {
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/api/posts/:id" }),
    handler: (req, params) => handleDeletePost(req, params.id!),
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/ai/evaluate" }),
    handler: handleEvaluate,
  },
  // TODO: /api/personas/*, /api/profile/me, /api/posts/:id/comments,
  //       /api/posts/:id/reactions, /api/comments/:id/reactions, /api/follows,
  //       /api/follows/me, /api/ai/transform, /api/stamps を追加していく
];

async function router(request: Request): Promise<Response> {
  const url = new URL(request.url);

  let pathMatched = false;
  for (const route of routes) {
    const match = route.pattern.exec(url);
    if (!match) continue;
    pathMatched = true;
    if (route.method !== request.method) continue;

    try {
      return await route.handler(request, match.pathname.groups);
    } catch (err) {
      // ハンドラが投げた例外をここで受ける。受けないと接続が切られ、
      // クライアント側には原因の分からないエラーだけが残る。
      console.error(`[${request.method} ${url.pathname}]`, err);
      return error("internal server error", 500);
    }
  }

  if (pathMatched) return error("method not allowed", 405);
  return error("not found", 404);
}

const port = Number(Deno.env.get("PORT") ?? 8000);
console.log(`engiiro-app backend listening on :${port}`);
const server = Deno.serve({ port }, router);

// Deno Deployはインスタンスを止めるときSIGINTを送り、5秒後に強制終了する。
// その5秒のうちに処理中のリクエストを返し終えて、接続プールを閉じる。
// 閉じずに終了しても動くが、DB側に切れかけの接続が残り、再起動を繰り返すと
// 接続上限に当たりやすくなる。
const signals: Deno.Signal[] = Deno.build.os === "windows"
  ? ["SIGINT"]
  : ["SIGINT", "SIGTERM"];

for (const signal of signals) {
  Deno.addSignalListener(signal, async () => {
    console.log(`[server] ${signal} received, shutting down`);
    await server.shutdown();
    await closePool();
    Deno.exit(0);
  });
}
