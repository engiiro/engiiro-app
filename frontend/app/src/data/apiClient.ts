/*
 * backend APIへのfetchラッパーとトークン管理。
 *
 * ベースURLは VITE_API_BASE_URL で指定する。未指定なら空文字（相対パス）になり、
 * vite.config.ts の server.proxy 経由で backend に届く（開発サーバ利用時）。
 * 本番ビルドではVITE_API_BASE_URLに実際のbackendのオリジンを指定する想定。
 *
 * トークンはJWT（docs/design_doc.md 6.4章）。localStorageに保存し、
 * 認証が必要なリクエストには Authorization: Bearer <token> を必ず付与する。
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN_STORAGE_KEY = "engiiro.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // localStorageが使えない環境（プライベートモード等）では、セッション中の
    // 認証保持を諦める。致命的ではないため握りつぶす。
  }
}

export class ApiError extends Error {
  readonly status: number;
  /** backendが返す拡張フィールド。design_doc.mdの正本形式（{error}）には無いが、
   * 実装フェーズの補完でエラー理由の粗い区分として付く場合がある（未設定ならundefined）。 */
  readonly reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

type RequestOptions = {
  readonly method?: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data && typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
    const reason = data && typeof data.reason === "string" ? data.reason : undefined;
    throw new ApiError(res.status, message, reason);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: "DELETE", body }),
};
