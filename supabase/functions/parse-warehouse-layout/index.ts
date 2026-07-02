// supabase/functions/parse-warehouse-layout/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PROMPT = `You are analyzing a warehouse floor plan or blueprint image.

Identify each distinct storage section visible. A section is a labeled area, typically rectangular, containing storage bays. Common examples: receiving, picking, bulk storage, returns hold, staging.

For each section, extract:
- code: 1-4 character uppercase identifier. If the blueprint shows codes (like "A", "B-1", "RX"), use them verbatim. Otherwise generate sequential letters.
- name: Descriptive name from visible labels. If unlabeled, use a sensible default like "Section A".
- x: Left edge as a ratio 0-1 of image width
- y: Top edge as a ratio 0-1 of image height
- width: Width as a ratio 0-1 of image width
- height: Height as a ratio 0-1 of image height
- approximate_bays: Estimated bays in the section. Default 10 if unclear.
- approximate_levels: Estimated vertical levels. Default 3 if unclear.

Return ONLY a JSON object, no markdown fences, no preamble:
{
  "sections": [
    { "code": "A", "name": "Receiving Dock", "x": 0.05, "y": 0.10, "width": 0.40, "height": 0.30, "approximate_bays": 8, "approximate_levels": 3 }
  ]
}

If no warehouse sections are detectable, return { "sections": [] }.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
};

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_B64_LEN = 5_000_000; // ~3.75MB binary

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set");
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  let body: { image_base64?: unknown; mime_type?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const imageB64Raw = body.image_base64;
  const mimeType = body.mime_type;
  if (typeof imageB64Raw !== "string" || !imageB64Raw) {
    return jsonResponse({ error: "image_base64 required" }, 400);
  }
  if (typeof mimeType !== "string" || !ALLOWED_MIME.includes(mimeType)) {
    return jsonResponse({ error: "Unsupported mime_type, use PNG/JPEG/GIF/WEBP" }, 400);
  }

  const cleanB64 = imageB64Raw.replace(/^data:[^;]+;base64,/, "");
  if (cleanB64.length > MAX_B64_LEN) {
    return jsonResponse({ error: "Image too large, max ~3.75MB" }, 413);
  }

  let anthropicResp: Response;
  try {
    anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: cleanB64 } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
    });
  } catch (e) {
    console.error("Network error calling Anthropic:", e);
    return jsonResponse({ error: "Vision API unreachable" }, 502);
  }

  if (!anthropicResp.ok) {
    const errText = await anthropicResp.text();
    console.error("Anthropic error:", anthropicResp.status, errText);
    return jsonResponse({ error: `Vision API failed (${anthropicResp.status})` }, 502);
  }

  const data = await anthropicResp.json();
  const blocks = Array.isArray(data.content) ? data.content : [];
  const textBlock = blocks.find((b: { type?: string }) => b?.type === "text") as { text?: string } | undefined;
  if (!textBlock?.text) {
    return jsonResponse({ error: "Empty AI response" }, 502);
  }

  // Strip optional markdown fences
  let rawJson = textBlock.text.trim();
  rawJson = rawJson
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: { sections?: unknown };
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    console.error("JSON parse failed:", e, "Raw:", rawJson);
    return jsonResponse({ error: "AI returned malformed JSON", raw: rawJson.slice(0, 500) }, 502);
  }

  const sectionsRaw = Array.isArray(parsed.sections) ? parsed.sections : [];

  const sections = sectionsRaw
    .filter((s: unknown): s is Record<string, unknown> => s !== null && typeof s === "object")
    .map((s) => ({
      code: String(s.code ?? "X").slice(0, 4).toUpperCase() || "X",
      name: String(s.name ?? "Unnamed section").slice(0, 100),
      x: clamp01(Number(s.x)),
      y: clamp01(Number(s.y)),
      width: clamp(Number(s.width), 0.02, 1),
      height: clamp(Number(s.height), 0.02, 1),
      approximate_bays: clampInt(s.approximate_bays, 1, 50, 10),
      approximate_levels: clampInt(s.approximate_levels, 1, 10, 3),
    }))
    .slice(0, 20);

  return jsonResponse({ sections });
});
