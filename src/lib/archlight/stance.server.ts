// Stance classification: does EVIDENCE support, contradict, or stay neutral
// toward a CLAIM? One bounded AI-gateway call. Never throws — on any failure
// returns { stance: 'neutral', confidence: 0 } so callers can proceed safely.

import { callJson } from "./ai-gateway.server";

export type Stance = "supports" | "contradicts" | "neutral";

export interface StanceResult {
  stance: Stance;
  confidence: number;
  reason: string;
}

const NEUTRAL_FALLBACK: StanceResult = { stance: "neutral", confidence: 0, reason: "" };

function coerceStance(v: unknown): Stance {
  return v === "supports" || v === "contradicts" || v === "neutral" ? v : "neutral";
}

export async function classifyStance(claimText: string, evidenceText: string): Promise<StanceResult> {
  const claim = (claimText ?? "").trim();
  const evidence = (evidenceText ?? "").trim();
  if (!claim || !evidence) return NEUTRAL_FALLBACK;
  try {
    const r = await callJson<{ stance?: string; confidence?: number; reason?: string }>({
      task: "contradiction_analysis",
      system:
        "Decide whether the EVIDENCE supports, contradicts, or is neutral toward the CLAIM. " +
        "'contradicts' means it asserts the opposite of, or denies, the claim. " +
        "Return only JSON. Do not invent.",
      user:
        `CLAIM: ${claim.slice(0, 800)}\n\n` +
        `EVIDENCE: ${evidence.slice(0, 2000)}\n\n` +
        `Return STRICT JSON: {"stance":"supports"|"contradicts"|"neutral","confidence":0..1,"reason":string}`,
      temperature: 0.1,
      maxTokens: 256,
    });
    if (!r.ok || !r.data) return NEUTRAL_FALLBACK;
    const stance = coerceStance(r.data.stance);
    const confRaw = Number(r.data.confidence);
    const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : 0;
    const reason = typeof r.data.reason === "string" ? r.data.reason.slice(0, 500) : "";
    return { stance, confidence, reason };
  } catch {
    return NEUTRAL_FALLBACK;
  }
}
