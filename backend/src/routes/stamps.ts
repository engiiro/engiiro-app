// docs/design_doc.md 7章 GET /api/stamps に対応する。

import { query } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import type { StampRow } from "../models/types.ts";

export async function handleListStamps(): Promise<Response> {
  // 並びは sort_order が正本。frontendは受け取った順を保つ（並べ直さない）。
  const result = await query<StampRow>(
    "select id, name, image_url, shelf from stamps order by sort_order asc, id asc",
  );
  return json({
    stamps: result.rows.map((s: StampRow) => ({
      id: s.id,
      name: s.name,
      imageUrl: s.image_url,
      // 設計書§7の応答には無いが、一覧を棚に分けるためfrontendが要る項目
      // （2026-08-28。無いと全件が1つの棚に落ちる）。
      shelf: s.shelf,
    })),
  });
}
