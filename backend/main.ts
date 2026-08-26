import { closePool } from "./src/lib/db.ts";
import { handleCreateAccount } from "./src/routes/accounts.ts";
import { handleEvaluate } from "./src/routes/ai.ts";
import { handleHealth } from "./src/routes/health.ts";
import { handleCreatePost, handleFeed } from "./src/routes/posts.ts";
import { handleLogin, handleLogout } from "./src/routes/sessions.ts";

// 最低限のルーティング。エンドポイントが増えてきたら、フレームワーク（Hono等）の導入も検討。
// エンドポイント一覧は docs/design_doc.md 7章を参照。
async function router(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (pathname === "/health" && req.method === "GET") {
    return await handleHealth();
  }

  if (pathname === "/api/accounts" && req.method === "POST") {
    return await handleCreateAccount(req);
  }

  if (pathname === "/api/sessions" && req.method === "POST") {
    return await handleLogin(req);
  }

  if (pathname === "/api/sessions" && req.method === "DELETE") {
    return await handleLogout(req);
  }

  if (pathname === "/api/posts" && req.method === "POST") {
    return await handleCreatePost(req);
  }

  if (pathname === "/api/posts/feed" && req.method === "GET") {
    return await handleFeed(req);
  }

  if (pathname === "/api/ai/evaluate" && req.method === "POST") {
    return await handleEvaluate(req);
  }

  // TODO: /api/personas/*, /api/profile/me, /api/posts/:id, /api/posts/:id/comments,
  //       /api/posts/:id/reactions, /api/comments/:id/reactions, /api/follows,
  //       /api/follows/me, /api/ai/transform, /api/stamps を追加していく

  return Response.json({ error: "Not Found" }, { status: 404 });
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
