import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { draftReorderPOs, type PoNarrator } from "@/lib/data/reorderDraft";

/**
 * Scheduled auto-draft-PO sweep.
 *
 * For every org that has opted in (orgs.auto_draft_pos_enabled = true), runs the
 * SAME reorder-draft engine the manual "Draft from low-stock" button uses
 * (lib/data/reorderDraft) and creates draft POs for products at/below their
 * reorder point — grouped by preferred supplier, with AI reasoning per line.
 * Buyers walk in to ready-to-review drafts instead of running it by hand.
 *
 * AUTH: shared-secret bearer token (CRON_SECRET) so only the scheduler can
 * trigger it. Uses the admin client (RLS bypassed); the engine filters org_id
 * explicitly on every query, per repo convention for cron jobs.
 *
 * SCHEDULE: external — pg_cron or a scheduled edge function POSTs to this URL.
 * Recommended cadence: once daily, off-hours. Idempotency note: re-running the
 * same day creates ANOTHER set of draft POs (drafts are cheap and reviewable),
 * so schedule it once per day rather than hourly.
 *
 * AI COPY: fails open — narration uses the admin client's functions.invoke
 * (cron has no user session), and a null return just leaves reasoning empty.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: orgs, error } = await admin
    .from("orgs")
    .select("id")
    .eq("auto_draft_pos_enabled", true)
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const narrate = makeAdminNarrator(admin);
  const summary = { orgs: 0, posCreated: 0, skus: 0 };

  for (const org of (orgs ?? []) as Array<{ id: string }>) {
    summary.orgs++;
    try {
      const result = await draftReorderPOs({
        supabase: admin,
        orgId: org.id,
        userId: null, // system-generated; created_by is nullable
        narrate,
      });
      summary.posCreated += result.createdPoIds.length;
      summary.skus += result.skuCount;
    } catch (e) {
      console.error(`[auto-draft-pos] org ${org.id} failed:`, e);
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}

/**
 * PO-draft narrator over the admin client (the cookie-based createClient that
 * lib/ai/narrate.ts uses can't authenticate in a session-less cron). Mirrors
 * narratePoDraft's split/pad behaviour. Fails open to null.
 */
function makeAdminNarrator(
  admin: ReturnType<typeof createAdminClient>
): PoNarrator {
  return async ({ lines }) => {
    try {
      const { data, error } = await admin.functions.invoke<{
        narration?: string;
      }>("narrate-event", { body: { type: "po_draft", lines } });
      if (error || !data?.narration) return null;
      const out = data.narration
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (out.length === 0) return null;
      while (out.length < lines.length) out.push("");
      return out.slice(0, lines.length);
    } catch {
      return null;
    }
  };
}
