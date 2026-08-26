// docs/design_doc.md 7章「API設計」の
//   POST /api/posts
//   GET  /api/posts/feed
// に対応するスタブ実装。他のエンドポイント（comments, reactions, follows, ai/* など）も
// 同じパターンで src/routes/ に追加していく想定。

import { getKv } from "../lib/kv.ts";
import type { Post } from "../models/types.ts";

export async function handleCreatePost(req: Request): Promise<Response> {
  const body = await req.json();
  const kv = await getKv();

  const post: Post = {
    id: crypto.randomUUID(),
    babyPersonaId: body.babyPersonaId,
    body: body.body ?? "",
    stamps: body.stamps ?? [],
    tags: body.tags ?? [],
    mood: body.mood,
    createdAt: new Date().toISOString(),
  };

  await kv.set(["posts", post.id], post);
  await kv.set(["posts_by_persona", post.babyPersonaId, post.id], post.id);

  return Response.json({ id: post.id, createdAt: post.createdAt }, {
    status: 201,
  });
}

export async function handleFeed(_req: Request): Promise<Response> {
  const kv = await getKv();
  const posts: Post[] = [];

  for await (const entry of kv.list<Post>({ prefix: ["posts"] })) {
    posts.push(entry.value);
  }

  // TODO: 閲覧者の推定年齢・投稿傾向に近い投稿を優先表示するレコメンドロジックを実装する
  // （docs/design_doc.md 7.1 の GET /api/posts/feed を参照。まずは新着順で返すだけの状態）
  const ordered = posts
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((p) => ({ postId: p.id }));

  return Response.json({ posts: ordered });
}
