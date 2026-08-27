// docs/design_doc.md 7章 GET /api/stamps に対応する。

import { query } from "../lib/db.ts";
import { json } from "../lib/http.ts";
import type { StampRow } from "../models/types.ts";

export async function handleListStamps(): Promise<Response> {
  const result = await query<StampRow>(
    "select id, name, image_url from stamps order by created_at asc",
  );
  return json({
    stamps: result.rows.map((s: StampRow) => ({
      id: s.id,
      name: s.name,
      imageUrl: s.image_url,
    })),
  });
}
