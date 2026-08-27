// URLPatternベースの最小ルーター。main.tsの完全一致比較を置き換え、`:id`のような
// パスパラメータを扱えるようにする（backend/CLAUDE.mdで示唆されていた課題への対応）。
//
// ルートは登録順に評価する。`/api/posts/:id`が`/api/posts/feed`を飲み込まないよう、
// 固定パスのルートを可変パスより先に登録すること。

import type { Route } from "./http.ts";
import { error } from "./http.ts";
import { preflightResponse, withCors } from "./cors.ts";

export function createRouter(routes: Route[]) {
  return async function router(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return preflightResponse();
    }

    const url = new URL(req.url);

    for (const route of routes) {
      if (route.method !== req.method) continue;
      const match = route.pattern.exec(url);
      if (!match) continue;
      const response = await route.handler(req, match.pathname.groups);
      return withCors(response);
    }

    return withCors(error("Not Found", 404));
  };
}
