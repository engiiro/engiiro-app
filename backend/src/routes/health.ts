import { query } from "../lib/db.ts";
import { json } from "../lib/http.ts";

/**
 * DBに届いているかを確認するためのエンドポイント。
 * デプロイ後にまずここを叩けば、アプリの問題かDBの問題かを切り分けられる。
 */
export async function handleHealth(): Promise<Response> {
  try {
    await query("select 1");
    return json({ status: "ok", db: "up" });
  } catch (err) {
    console.error("[health] db check failed:", err);
    return json({ status: "ok", db: "down" }, 503);
  }
}
