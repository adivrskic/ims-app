import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { rankCountPriorities } from "@/lib/data/cycleCounts";

/**
 * Scheduled cycle-count queue generation.
 *
 * For every org that has opted in (orgs.auto_cycle_counts_enabled = true),
 * ranks the catalog by discrepancy risk (lib/cycle-risk via
 * rankCountPriorities — the same scoring behind the page's "count next" list)
 * and files the top SKUs as pending cycle_count_tasks due in DUE_DAYS.
 * Products that already have an open task are skipped, so re-runs and
 * ignored queues don't pile up duplicates (a partial unique index backstops
 * the race). Recording a count auto-completes the matching task; operators
 * can also dismiss tasks from the cycle-counts page.
 *
 * SCHEDULE: pg_cron POSTs weekly (Mondays 05:00 UTC — see the
 * cycle_count_tasks migration). AUTH: CRON_SECRET bearer, constant-time
 * compare. Admin client (RLS bypassed) with explicit org_id filters, per
 * repo convention for cron jobs.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUEUE_SIZE = 10;
const DUE_DAYS = 7;
const ROLES_TO_NOTIFY = ["owner", "admin"] as const;

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary = { orgs: 0, tasksCreated: 0 };

  const { data: orgs, error } = await admin
    .from("orgs")
    .select("id")
    .eq("auto_cycle_counts_enabled", true)
    .is("deleted_at", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const org of (orgs ?? []) as Array<{ id: string }>) {
    try {
      summary.tasksCreated += await processOrg(admin, org.id);
      summary.orgs++;
    } catch (err) {
      console.error(`[cycle-count-queue] org ${org.id} failed:`, err);
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}

async function processOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<number> {
  // Rank with headroom, then drop products that already have an open task.
  const [priorities, { data: pendingRows }] = await Promise.all([
    rankCountPriorities(orgId, QUEUE_SIZE * 2),
    admin
      .from("cycle_count_tasks")
      .select("product_id")
      .eq("org_id", orgId)
      .eq("status", "pending"),
  ]);

  const alreadyQueued = new Set(
    ((pendingRows ?? []) as Array<{ product_id: string }>).map(
      (r) => r.product_id
    )
  );
  // Top the queue up to QUEUE_SIZE total pending — a re-run against a full
  // queue is a no-op, and an unworked queue never grows past the cap.
  const capacity = Math.max(0, QUEUE_SIZE - alreadyQueued.size);
  const fresh = priorities
    .filter((p) => !alreadyQueued.has(p.product_id))
    .slice(0, capacity);
  if (fresh.length === 0) return 0;

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + DUE_DAYS);
  const due = dueDate.toISOString().slice(0, 10);

  const { error: insertErr } = await admin.from("cycle_count_tasks").insert(
    fresh.map((p) => ({
      org_id: orgId,
      product_id: p.product_id,
      score: p.score,
      reason: p.reason,
      due_date: due,
    }))
  );
  if (insertErr) {
    console.error(`[cycle-count-queue] insert failed for ${orgId}:`, insertErr);
    return 0;
  }

  // One heads-up notification per owner/admin (weekly cadence — no dedup
  // needed beyond the schedule itself).
  const { data: members } = await admin
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .in("role", ROLES_TO_NOTIFY as unknown as string[]);
  const userIds = ((members ?? []) as Array<{ user_id: string }>).map(
    (m) => m.user_id
  );
  if (userIds.length > 0) {
    const { error: notifyErr } = await admin.from("notifications").insert(
      userIds.map((uid) => ({
        org_id: orgId,
        user_id: uid,
        kind: "cycle_count_queue",
        title: `Count queue ready: ${fresh.length} SKU${fresh.length === 1 ? "" : "s"}`,
        body: `This week's cycle-count queue is ready — ${fresh.length} highest-risk products, due by ${due}.`,
        link: "/cycle-counts",
      }))
    );
    if (notifyErr) {
      console.error(`[cycle-count-queue] notify failed for ${orgId}:`, notifyErr);
    }
  }

  return fresh.length;
}
