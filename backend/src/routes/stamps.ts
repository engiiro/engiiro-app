// docs/design_doc.md 7章「API設計」の
//   GET /api/stamps
// に対応する実装。

import { query } from "../lib/db.ts";
import { json } from "../lib/http.ts";

type StampRow = { id: string; name: string; image_url: string };

/** `GET /api/stamps`。バブル作成時のスタンプピッカー表示用（FR-STAMP-001）。認証不要。 */
export async function handleListStamps(): Promise<Response> {
  const result = await query<StampRow>(
    "select id, name, image_url from stamps order by created_at asc",
  );
  return json({
    stamps: result.rows.map((row: StampRow) => ({
      id: row.id,
      name: row.name,
      imageUrl: row.image_url,
    })),
  });
}
