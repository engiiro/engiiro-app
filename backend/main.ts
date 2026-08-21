import { handleHealth } from "./src/routes/health.ts";
import { handleCreatePost, handleFeed } from "./src/routes/posts.ts";

// 最低限のルーティング。エンドポイントが増えてきたら、フレームワーク（Hono等）の導入も検討。
// エンドポイント一覧は docs/design_doc.md 7章を参照。
async function router(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (pathname === "/health" && req.method === "GET") {
    return handleHealth();
  }

  if (pathname === "/api/posts" && req.method === "POST") {
    return await handleCreatePost(req);
  }

  if (pathname === "/api/posts/feed" && req.method === "GET") {
    return await handleFeed(req);
  }

  // TODO: /api/accounts, /api/personas/*, /api/posts/:id/comments,
  //       /api/posts/:id/reactions, /api/follows, /api/follows/me,
  //       /api/ai/evaluate, /api/ai/transform, /api/stamps を追加していく

  return Response.json({ error: "Not Found" }, { status: 404 });
}

const port = Number(Deno.env.get("PORT") ?? 8000);
console.log(`engiiro-app backend listening on :${port}`);
Deno.serve({ port }, router);
