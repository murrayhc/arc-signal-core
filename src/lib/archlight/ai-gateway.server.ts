// Server-only Archlight AI gateway helper.
// Uses Lovable AI Gateway (OpenAI-compatible) via direct fetch.

const CHAT_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";

export type TaskClass =
  | "atomic_claim_extraction"
  | "claim_normalisation"
  | "query_generation"
  | "contradiction_analysis"
  | "source_comparison"
  | "company_impact_analysis"
  | "historic_context"
  | "present_context"
  | "future_scenarios"
  | "strategic_positioning"
  | "report_synthesis"
  | "json_repair"
  | "embedding";

const ROUTES: Record<TaskClass, string> = {
  atomic_claim_extraction: "google/gemini-3-flash-preview",
  claim_normalisation: "google/gemini-3-flash-preview",
  query_generation: "google/gemini-3-flash-preview",
  contradiction_analysis: "google/gemini-2.5-flash",
  source_comparison: "google/gemini-2.5-flash",
  company_impact_analysis: "google/gemini-2.5-pro",
  historic_context: "google/gemini-2.5-pro",
  present_context: "google/gemini-2.5-flash",
  future_scenarios: "google/gemini-2.5-pro",
  strategic_positioning: "google/gemini-2.5-pro",
  report_synthesis: "google/gemini-2.5-pro",
  json_repair: "google/gemini-3-flash-preview",
  embedding: "openai/text-embedding-3-small",
};

export function pickModel(task: TaskClass): string {
  return ROUTES[task];
}

interface CallOpts {
  task: TaskClass;
  system: string;
  user: string;
  json?: boolean;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResult<T = unknown> {
  ok: boolean;
  data: T | null;
  raw: string;
  model: string;
  latencyMs: number;
  cost: number;
  error?: string;
  promptExcerpt: string;
  responseExcerpt: string;
  repaired?: boolean;
}

export async function callAI<T = unknown>(opts: CallOpts): Promise<AIResult<T>> {
  const key = process.env.LOVABLE_API_KEY;
  const model = opts.model ?? pickModel(opts.task);
  const promptExcerpt = `[SYS] ${opts.system.slice(0, 300)}\n[USR] ${opts.user.slice(0, 700)}`;
  if (!key) {
    return { ok: false, data: null, raw: "", model, latencyMs: 0, cost: 0, error: "Missing LOVABLE_API_KEY", promptExcerpt, responseExcerpt: "" };
  }
  const started = Date.now();
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? (opts.task === "report_synthesis" ? 8192 : 4096),
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, data: null, raw: text, model, latencyMs, cost: 0, error: `AI ${res.status}: ${text.slice(0, 200)}`, promptExcerpt, responseExcerpt: text.slice(0, 800) };
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const finishReason = body.choices?.[0]?.finish_reason;
    if (!raw.trim()) {
      const reason = finishReason ? ` finish_reason=${finishReason}` : "";
      return { ok: false, data: null, raw, model, latencyMs, cost: 0, error: `AI returned an empty response.${reason}`, promptExcerpt, responseExcerpt: "" };
    }
    let data: T | null = null;
    if (opts.json) {
      try { data = JSON.parse(raw) as T; } catch { data = null; }
    }
    return { ok: true, data, raw, model, latencyMs, cost: estimateCost(model, raw.length), promptExcerpt, responseExcerpt: raw.slice(0, 800) };
  } catch (err) {
    return { ok: false, data: null, raw: "", model, latencyMs: Date.now() - started, cost: 0, error: err instanceof Error ? err.message : String(err), promptExcerpt, responseExcerpt: "" };
  }
}

// JSON call with one repair retry when parse fails.
export async function callJson<T = unknown>(opts: CallOpts): Promise<AIResult<T>> {
  const first = await callAI<T>({ ...opts, json: true });
  if (first.ok && first.data !== null) return first;
  if (!first.raw) return first;
  const repair = await callAI<T>({
    task: "json_repair",
    json: true,
    system: "You repair malformed JSON. Return ONLY valid JSON matching what the upstream model was asked for. Do not add commentary, do not wrap in code fences.",
    user: `Requested schema (implicit): the original assistant reply below was intended as strict JSON but failed to parse. Return the same content as valid JSON.\n\nRAW:\n${first.raw.slice(0, 6000)}`,
  });
  return { ...repair, repaired: true, promptExcerpt: first.promptExcerpt };
}

// Text embedding via Lovable AI gateway (OpenAI-compatible /v1/embeddings).
export async function callEmbedding(text: string, model: string = ROUTES.embedding): Promise<{ ok: boolean; vector: number[] | null; model: string; latencyMs: number; error?: string }>{
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, vector: null, model, latencyMs: 0, error: "Missing LOVABLE_API_KEY" };
  const started = Date.now();
  try {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text.slice(0, 8000) }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, vector: null, model, latencyMs, error: `EMBED ${res.status}: ${t.slice(0, 200)}` };
    }
    const body = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = body.data?.[0]?.embedding ?? null;
    return { ok: !!vec, vector: vec, model, latencyMs };
  } catch (err) {
    return { ok: false, vector: null, model, latencyMs: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
  }
}

function estimateCost(model: string, chars: number): number {
  const tokens = chars / 4;
  const per1k = model.includes("pro") ? 0.008 : 0.0006;
  return Number(((tokens / 1000) * per1k).toFixed(6));
}

// ============ Financial advice guardrails ============
export const FORBIDDEN_PHRASES = [
  "buy this stock", "sell this stock", "hold this stock",
  "buy rating", "sell rating", "hold rating",
  "target price", "price target",
  "guaranteed profit", "guaranteed return", "certain return",
  "investment recommendation", "portfolio allocation",
  "should buy", "should sell", "should hold",
  "will profit", "guaranteed",
];

export interface GuardResult { ok: boolean; violations: string[]; }

export function guardFinancialAdvice(text: string): GuardResult {
  const lower = text.toLowerCase();
  const hits = FORBIDDEN_PHRASES.filter((p) => lower.includes(p));
  return { ok: hits.length === 0, violations: hits };
}
