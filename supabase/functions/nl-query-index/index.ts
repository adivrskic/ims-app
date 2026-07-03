// supabase/functions/nl-query-index/index.ts
//
// Parses a plain-English search query into a structured intent the dashboard's
// nlSearch action turns into a whitelisted query. Mirrors narrate-event: it
// only returns data; the caller (lib/ai/nlQuery) tolerates failure and falls
// back to command matching, so this function never needs to be bulletproof.
//
// The model returns intent ONLY — never SQL, never data. Entity + filters are
// a fixed vocabulary the dashboard validates again before querying.
//
// Env: ANTHROPIC_API_KEY. Deploy with: supabase functions deploy nl-query-index
//
// NOTE: reference implementation — untested in this environment. Adjust the
// model string and CORS origins to your setup.

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You translate a warehouse operator's plain-English search into a JSON intent.
Return ONLY a JSON object, no prose, no markdown fences. Shape:

{
  "entity": "product" | "location" | "scan" | "order" | "unknown",
  "filters": {
    "text"?: string,        // product name / barcode terms
    "lowStock"?: boolean,   // at or below reorder point
    "sectionCode"?: string, // aisle/section like "A3"
    "action"?: "register"|"locate"|"relocate"|"pick"|"receive"|"return"|"cycle_count"|"adjust"|"putaway"|"transfer",
    "sinceDays"?: number    // recency window
  },
  "sort"?: { "field": string, "dir": "asc"|"desc" },
  "limit"?: number
}

Rules:
- "products low on stock in aisle 3" -> entity product, filters {lowStock:true, sectionCode:"3"}
- "where is the blue widget" -> entity location, filters {text:"blue widget"}
- "what was picked yesterday" / "recent movements" -> entity scan, filters {action:"pick", sinceDays:1}
- If you can't tell, use entity "unknown".
- Omit filters you're unsure about. Never invent product names. Keep limit <= 25.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ───────── Rate limiting ─────────
// Every call bills an Anthropic request, so budget per user. The platform
// (verify_jwt) has already validated the JWT — we only decode the payload to
// identify the caller. Service-role calls are exempt. Fail-open if the counter
// is unavailable; fail-closed (429) when the budget is spent.
const RL_MAX = 20;
const RL_WINDOW_SECONDS = 60;
const RL_BUCKET_PREFIX = "fn:nl-query:";

function jwtPayload(req: Request): { sub?: string; role?: string } | null {
  try {
    const token = (req.headers.get("authorization") ?? "").replace(
      /^Bearer\s+/i,
      ""
    );
    const part = token.split(".")[1] ?? "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

async function rateLimitCheck(
  req: Request
): Promise<{ ok: boolean; status: number; retryAfter: number }> {
  const claims = jwtPayload(req);
  if (claims?.role === "service_role") {
    return { ok: true, status: 200, retryAfter: 0 };
  }
  // verify_jwt accepts ANY valid project JWT — including the public anon key
  // that ships in every client bundle. Require a real user identity so the
  // anon key alone can't spend Anthropic budget.
  if (!claims?.sub || claims.role !== "authenticated") {
    return { ok: false, status: 401, retryAfter: 0 };
  }
  try {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/rate_limit_hit`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: key,
          authorization: `Bearer ${key}`,
          "content-profile": "app",
        },
        body: JSON.stringify({
          p_bucket: RL_BUCKET_PREFIX + claims.sub,
          p_max: RL_MAX,
          p_window_seconds: RL_WINDOW_SECONDS,
        }),
      }
    );
    if (!resp.ok) return { ok: true, status: 200, retryAfter: 0 };
    const data = await resp.json();
    return data?.allowed === false
      ? { ok: false, status: 429, retryAfter: Number(data?.retry_after ?? 60) }
      : { ok: true, status: 200, retryAfter: 0 };
  } catch {
    return { ok: true, status: 200, retryAfter: 0 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const rl = await rateLimitCheck(req);
  if (!rl.ok) {
    return new Response(
      JSON.stringify({
        error: rl.status === 401 ? "unauthorized" : "rate_limited",
      }),
      {
        status: rl.status,
        headers: {
          ...cors,
          "content-type": "application/json",
          ...(rl.status === 429
            ? { "retry-after": String(rl.retryAfter) }
            : {}),
        },
      }
    );
  }

  try {
    const { query } = await req.json();
    if (typeof query !== "string" || query.trim().length < 3) {
      return json({ intent: { entity: "unknown" } });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ intent: { entity: "unknown" } });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: "user", content: query.trim() }],
      }),
    });

    if (!resp.ok) return json({ intent: { entity: "unknown" } });

    const data = await resp.json();
    const text: string =
      data?.content?.find((b: { type: string }) => b.type === "text")?.text ??
      "";

    let intent: unknown;
    try {
      // Strip any stray fences just in case.
      intent = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      return json({ intent: { entity: "unknown" } });
    }

    return json({ intent });
  } catch {
    return json({ intent: { entity: "unknown" } });
  }
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...cors, "content-type": "application/json" },
  });
}
