// ai/ (Python/FastAPI) 推論APIを呼び出すクライアント。
// docs/design_doc.md 5章「AI処理」の通り、フロントエンドから推論APIを直接呼ばず、
// 必ずbackend経由にする（FR-AI-002）。呼び出しにアカウントID等の識別情報は含めない
// （FR-AI-003、FR-PRIV-003）。
//
// ai/側は現時点でプレースホルダー実装（キーワードカウント/文字列置換）のまま
// （ai/src/evaluate.py, ai/src/transform.py）。将来より高度な実装に差し替わっても、
// ここで叩いているI/F（POST /evaluate, POST /transform）さえ保たれれば影響しない。

function aiServiceUrl(): string {
  return Deno.env.get("AI_SERVICE_URL") ?? "http://localhost:8001";
}

export interface AiEvaluateResult {
  estimatedAge: number;
}

export interface AiTransformResult {
  transformedText: string;
}

/** AI推論APIが応答しない/エラーの場合はnullを返す。呼び出し側でNFR-001〜004の扱いを判断する。 */
export async function callAiEvaluate(
  body: string,
  personaType: "baby" | "mother",
): Promise<AiEvaluateResult | null> {
  try {
    const res = await fetch(`${aiServiceUrl()}/evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, personaType }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.estimatedAge !== "number") return null;
    return { estimatedAge: data.estimatedAge };
  } catch (err) {
    console.error("[ai] evaluate call failed:", err);
    return null;
  }
}

export async function callAiTransform(
  body: string,
  style: "baby" | "mother",
): Promise<AiTransformResult | null> {
  try {
    const res = await fetch(`${aiServiceUrl()}/transform`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, style }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.transformedText !== "string") return null;
    return { transformedText: data.transformedText };
  } catch (err) {
    console.error("[ai] transform call failed:", err);
    return null;
  }
}
