import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

/**
 * 接続プールはモジュールのトップレベルで1回だけ作る。
 *
 * リクエストごとに `new Pool()` すると、リクエストの数だけ接続が作られてPostgres側の
 * 接続上限をすぐ使い切る。モジュールのトップレベルに置けば、同じインスタンスが
 * 生きている間はこの1つを使い回せる。
 *
 * 接続先は引数で渡さない。Deno DeployがPGHOST / PGPORT / PGDATABASE / PGUSER /
 * PGPASSWORDを自動で注入し、npm:pgがそれを読むため。ここにhostやpasswordを書くと、
 * 環境ごとに違うDBを指せなくなる（production/preview/ブランチで同じDBを共有してしまう）。
 *
 * maxは3にしている。Deno Deployはアクセスに応じてインスタンスを増やすので、
 * 1インスタンスあたりの接続数を小さくしておかないとインスタンスの数 × maxが
 * DBの接続上限を超える。
 */
export const pool = new Pool({ max: 3 });

/**
 * プールが持っているidle接続がDB側から切られると、Poolは`error`イベントを出す。
 * これを購読していないとNode互換の未処理エラーになり、プロセスごと落ちる。
 *
 * Deno Deployではインスタンスが頻繁に停止・再起動し、DB側のメンテナンスや
 * アイドルタイムアウトでも接続は切られる。つまりこのハンドラは必須。
 */
pool.on("error", (err: Error) => {
  console.error("[db] idle client error:", err.message);
});

/** 一時的な切断として扱うエラーコード。次のリクエストではなく、その場で1回だけ貼り直す。 */
const RETRYABLE = new Set([
  "08000", // connection_exception
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
]);

/**
 * エラーからPostgres/OSのエラーコードを取り出す。
 *
 * 接続先がlocalhostのように複数のアドレスに解決される場合、Node互換層は個々の失敗を
 * まとめたAggregateErrorを返す。この場合codeは外側に無いので、中のerrorsを1段掘る。
 */
function errorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;

  if ("code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }

  if (err instanceof AggregateError) {
    for (const inner of err.errors) {
      const code = errorCode(inner);
      if (code !== undefined) return code;
    }
  }

  return undefined;
}

/**
 * SQLを実行する。
 *
 * 値は必ず`params`で渡す。SQLの文字列に埋め込むとSQLインジェクションになる。
 *
 * ```ts
 * // 良い例
 * await query("select * from accounts where id = $1", [id]);
 * // 悪い例
 * await query(`select * from accounts where id = ${id}`);
 * ```
 *
 * 切断が原因のエラーのときだけ、少し待って貼り直す。文法エラーや制約違反まで
 * 再試行しても結果は変わらないため、そのまま投げる。
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  // 待ち時間（ミリ秒）。要素数がそのまま再試行の回数になる。
  const backoff = [100, 400, 1000];

  for (let attempt = 0;; attempt++) {
    try {
      return await pool.query<T>(sql, params);
    } catch (err) {
      const code = errorCode(err);
      if (
        attempt >= backoff.length || code === undefined || !RETRYABLE.has(code)
      ) throw err;
      console.warn(`[db] retrying after ${code} (attempt ${attempt + 1})`);
      await new Promise((resolve) => setTimeout(resolve, backoff[attempt]));
    }
  }
}

/**
 * 複数の書き込みを1つのトランザクションにまとめる。
 * アカウント登録（accounts + baby_personas + mother_personas）のように、
 * 途中で失敗したら全体を無かったことにしたい処理で使う。
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** プールを閉じる。プロセス終了時に呼ぶ。 */
export async function closePool(): Promise<void> {
  try {
    await pool.end();
  } catch (err) {
    console.error(
      "[db] failed to close pool:",
      err instanceof Error ? err.message : err,
    );
  }
}
