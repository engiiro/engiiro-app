// Deno KV クライアントのシングルトン。
// ローカル実行時は `--unstable-kv` を付けて起動すると、ファイルベースのKVが自動で使われる。
// Deno Deploy上では自動的にマネージドのDeno KVに接続される。

let kv: Deno.Kv | null = null;

export async function getKv(): Promise<Deno.Kv> {
  if (!kv) {
    kv = await Deno.openKv();
  }
  return kv;
}
