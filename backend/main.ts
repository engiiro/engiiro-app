import { closePool } from "./src/lib/db.ts";
import type { Route } from "./src/lib/http.ts";
import { createRouter } from "./src/lib/router.ts";
import { handleHealth } from "./src/routes/health.ts";
import {
  handleCreatePost,
  handleDeletePost,
  handleFeed,
  handleGetPost,
} from "./src/routes/posts.ts";
import { handleCreateAccount } from "./src/routes/accounts.ts";
import { handleLogin, handleLogout } from "./src/routes/sessions.ts";
import { handleListStamps } from "./src/routes/stamps.ts";
import { handleGetMyProfile } from "./src/routes/profile.ts";
import {
  handleGetBabyPersona,
  handleGetMotherPersona,
} from "./src/routes/personas.ts";
import {
  handleCreateComment,
  handleGetComment,
  handleListCommentReplies,
  handleListComments,
} from "./src/routes/comments.ts";
import {
  handleCreateCommentReaction,
  handleCreatePostReaction,
  handleDeleteCommentReaction,
  handleDeletePostReaction,
} from "./src/routes/reactions.ts";
import {
  handleCreateFollow,
  handleDeleteFollow,
  handleListMyFollows,
} from "./src/routes/follows.ts";
import { handleAiEvaluate, handleAiTransform } from "./src/routes/ai.ts";

// エンドポイント一覧・リクエスト/レスポンス形式は docs/design_doc.md 7章を参照。
// 固定パスのルートを可変パス（:id等）より先に置く（/api/posts/feed が
// /api/posts/:id に飲み込まれないようにするため）。
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
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/stamps" }),
    handler: handleListStamps,
  },

  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/profile/me" }),
    handler: handleGetMyProfile,
  },

  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/personas/baby/:id" }),
    handler: handleGetBabyPersona,
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/personas/mother/:id" }),
    handler: handleGetMotherPersona,
  },

  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/posts/feed" }),
    handler: handleFeed,
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/posts" }),
    handler: handleCreatePost,
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/posts/:id" }),
    handler: handleGetPost,
  },
  {
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/api/posts/:id" }),
    handler: handleDeletePost,
  },

  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/posts/:id/comments" }),
    handler: handleCreateComment,
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/posts/:id/comments" }),
    handler: handleListComments,
  },

  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/posts/:id/reactions" }),
    handler: handleCreatePostReaction,
  },
  {
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/api/posts/:id/reactions/:type" }),
    handler: handleDeletePostReaction,
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/comments/:id" }),
    handler: handleGetComment,
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/comments/:id/comments" }),
    handler: handleListCommentReplies,
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/comments/:id/reactions" }),
    handler: handleCreateCommentReaction,
  },
  {
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/api/comments/:id/reactions/:type" }),
    handler: handleDeleteCommentReaction,
  },

  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/follows" }),
    handler: handleCreateFollow,
  },
  {
    method: "DELETE",
    pattern: new URLPattern({ pathname: "/api/follows" }),
    handler: handleDeleteFollow,
  },
  {
    method: "GET",
    pattern: new URLPattern({ pathname: "/api/follows/me" }),
    handler: handleListMyFollows,
  },

  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/ai/evaluate" }),
    handler: handleAiEvaluate,
  },
  {
    method: "POST",
    pattern: new URLPattern({ pathname: "/api/ai/transform" }),
    handler: handleAiTransform,
  },
];

const router = createRouter(routes);

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
