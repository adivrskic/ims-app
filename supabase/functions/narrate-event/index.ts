// Supabase Edge Function · Deno runtime.
//
// Generates short prose narrations for three event types:
//   - "forecast"  → Analytics page summary (2-3 sentences)
//   - "anomaly"   → Notification title + body
//   - "po_draft"  → Per-line PO reasoning
//
// Hashes the payload, checks app.ai_narrations cache, calls Claude
// Haiku 4.5 on miss, stores the result, returns the narration.

import Anthropic from "npm:@anthropic-ai/sdk@0.32.1";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PROMPT_VERSION = "v1";
const MODEL = "claude-haiku-4-5-20251001";

// ───────── Payload shapes ─────────

interface ForecastPayload {
  type: "forecast";
  scope: string;
  window: { start: string; end: string };
  metrics: {
    totalScans: number;
    scansToday: number;
    scansLast7: number;
    totalStock: number;
    lowStockCount: number;
    actionMix: Array<{ action: string; count: number; pct: number }>;
    trend14d: number[];
    topSections?: Array<{ code: string; pct: number }>;
  };
}

interface AnomalyPayload {
  type: "anomaly";
  kind: "stock_alert" | "velocity_spike" | "scan_summary" | "variance";
  context: Record<string, unknown>;
}

interface PoDraftPayload {
  type: "po_draft";
  lines: Array<{
    product_name: string;
    barcode: string;
    velocity: number;
    on_hand: number;
    reorder_point: number;
    lead_time_days: number;
    recommended_qty: number;
  }>;
}

type Payload = ForecastPayload | AnomalyPayload | PoDraftPayload;

// ───────── Handler ─────────

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Caller-scoped Supabase client. RLS enforces narration access.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      db: { schema: "app" },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Resolve workspace (first membership — matches the dashboard's
  // current "one workspace per user" assumption).
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (!membership) {
    return new Response("No workspace", { status: 403 });
  }
  const orgId = membership.org_id as string;

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const hash = await hashPayload(payload);

  // ── Cache hit? ───────────────────────────────────────────────
  const { data: cached } = await supabase
    .from("ai_narrations")
    .select("narration, model, created_at, tokens_used")
    .eq("event_type", payload.type)
    .eq("event_hash", hash)
    .eq("prompt_version", PROMPT_VERSION)
    .eq("org_id", orgId)
    .maybeSingle();

  if (cached) {
    return Response.json({
      narration: cached.narration,
      cached: true,
      model: cached.model,
      created_at: cached.created_at,
    });
  }

  // ── Miss → call Anthropic ────────────────────────────────────
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      "Server misconfigured: ANTHROPIC_API_KEY not set",
      { status: 500 },
    );
  }

  const prompt = buildPrompt(payload);
  const anthropic = new Anthropic({ apiKey });

  let narration = "";
  let tokensUsed = 0;
  try {
    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: payload.type === "po_draft" ? 800 : 400,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    narration = result.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    tokensUsed =
      (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM call failed";
    return new Response(`LLM error: ${msg}`, { status: 502 });
  }

  // Store cache row. If two requests race on the same hash, the unique
  // constraint will reject the loser — that's fine, we still return our
  // narration. Use upsert-or-ignore semantics.
  await supabase
    .from("ai_narrations")
    .insert({
      org_id: orgId,
      event_type: payload.type,
      event_hash: hash,
      prompt_version: PROMPT_VERSION,
      narration,
      model: MODEL,
      tokens_used: tokensUsed,
    })
    .select("id");

  return Response.json({
    narration,
    cached: false,
    model: MODEL,
    tokens_used: tokensUsed,
  });
});

// ───────── Helpers ─────────

async function hashPayload(payload: Payload): Promise<string> {
  // Stable stringify so key order doesn't affect the hash.
  const json = JSON.stringify(payload, Object.keys(payload).sort());
  const buf = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildPrompt(payload: Payload): { system: string; user: string } {
  switch (payload.type) {
    case "forecast":
      return forecastPrompt(payload);
    case "anomaly":
      return anomalyPrompt(payload);
    case "po_draft":
      return poDraftPrompt(payload);
  }
}

function forecastPrompt(p: ForecastPayload) {
  const system = [
    "You are an operations analyst summarizing warehouse activity for a daily standup.",
    "Write 2-3 short sentences in plain English. No markdown, no bullet points, no headings.",
    "Lead with the most significant signal (direction of change, biggest mover, biggest risk).",
    "Avoid hedging words like 'appears to' or 'seems to'. Use plain English numbers ('up 22%', not 'increased by 22 percent').",
    "Reference specific numbers when they sharpen the point. Be terse.",
  ].join(" ");

  const trendDirection = (() => {
    const t = p.metrics.trend14d;
    if (t.length < 4) return "flat";
    const firstHalf = t.slice(0, Math.floor(t.length / 2)).reduce((a, b) => a + b, 0);
    const secondHalf = t.slice(Math.floor(t.length / 2)).reduce((a, b) => a + b, 0);
    if (secondHalf > firstHalf * 1.15) return "rising";
    if (secondHalf < firstHalf * 0.85) return "falling";
    return "flat";
  })();

  const user = [
    `Window: ${p.window.start} → ${p.window.end}`,
    `Scope: ${p.scope}`,
    "",
    "Metrics:",
    `- Total scans: ${p.metrics.totalScans}`,
    `- Scans today: ${p.metrics.scansToday}`,
    `- Scans last 7 days: ${p.metrics.scansLast7}`,
    `- Units on hand: ${p.metrics.totalStock}`,
    `- Low-stock SKUs: ${p.metrics.lowStockCount}`,
    `- 14-day trend: ${trendDirection}`,
    `- Action mix (top 5): ${p.metrics.actionMix.slice(0, 5).map((a) => `${a.action} ${a.pct}%`).join(", ")}`,
    p.metrics.topSections?.length
      ? `- Top sections by units: ${p.metrics.topSections.slice(0, 3).map((s) => `${s.code} (${s.pct}%)`).join(", ")}`
      : "",
    "",
    "Write the standup summary.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user };
}

function anomalyPrompt(p: AnomalyPayload) {
  const system = [
    "You are writing a single notification for a warehouse operator's inbox.",
    "Output exactly two lines separated by a single newline: line 1 is the title (max 60 chars), line 2 is the body (1-2 short sentences, max 160 chars).",
    "No markdown. No emoji. Be specific about what happened and what to do next.",
    "Lead with the noun (SKU name, supplier, section), not a verb.",
  ].join(" ");

  const user = [
    `Anomaly kind: ${p.kind}`,
    `Context: ${JSON.stringify(p.context, null, 2)}`,
    "",
    "Write the notification (title on line 1, body on line 2).",
  ].join("\n");

  return { system, user };
}

function poDraftPrompt(p: PoDraftPayload) {
  const system = [
    "You are explaining purchase-order line items to a warehouse operator.",
    "For each input line, write one short sentence (max 25 words) explaining the recommended quantity.",
    "Reference the product's daily velocity, current stock, reorder point, and lead time naturally.",
    "Output exactly one line per input line, in the same order. No numbering, no markdown.",
  ].join(" ");

  const user = p.lines
    .map((l, i) =>
      `${i + 1}. ${l.product_name} (${l.barcode}): velocity ${l.velocity}/day, ` +
      `on hand ${l.on_hand}, ROP ${l.reorder_point}, lead time ${l.lead_time_days}d, ` +
      `recommended ${l.recommended_qty}`,
    )
    .join("\n");

  return { system, user };
}
