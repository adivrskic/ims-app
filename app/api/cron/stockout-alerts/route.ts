import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { productVelocities } from "@/lib/data/velocity";
import { daysToStockout } from "@/lib/replenishment";
import { dispatchEvent } from "@/lib/integrations/dispatch";

/**
 * Scheduled stockout-alert sweep (§2b).
 *
 * For every org, computes days-to-stockout per product (on-hand ÷ 60-day
 * velocity, via the same shared math the product page and PO drafts use) and,
 * for products within ALERT_THRESHOLD_DAYS of running out, writes an in-app
 * notification to the owners/admins who'd act on it. Both apps read the
 * notifications table, so the alert shows up on desktop and mobile.
 *
 * WHY AN API ROUTE, NOT A DENO EDGE FUNCTION: the detection reuses
 * daysToStockout, productVelocities, and the admin client — all dashboard
 * code. Keeping the logic here avoids re-implementing (and drifting) that math
 * in the edge repo. The *schedule* is external: pg_cron (or a scheduled edge
 * function) POSTs to this URL. See the companion migration.
 *
 * AUTH: guarded by a shared secret in the Authorization header so only the
 * scheduler can trigger it. Uses the admin client (RLS bypassed) — every query
 * filters org_id explicitly, per repo convention for cron jobs.
 *
 * DEDUP: there's no alert-state table, so we dedup against the notifications
 * themselves — skip a (user, product) pair that already got a stock_alert in
 * the last ALERT_COOLDOWN_DAYS. Good enough; a dedicated stockout_alerts table
 * would be more precise if this ever needs per-run idempotency guarantees.
 *
 * AI COPY: invokes the existing narrate-event "anomaly" kind, and falls open
 * to deterministic copy if the LLM is unavailable — the alert always ships.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60; // long-running sweep; raise/lower to host limits

const ALERT_THRESHOLD_DAYS = 3;
const ALERT_COOLDOWN_DAYS = 3;
const ROLES_TO_ALERT = ["owner", "admin"] as const;

interface AtRisk {
  id: string;
  name: string;
  onHand: number;
  velocity: number;
  dts: number;
}

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary = { orgs: 0, notified: 0 };

  const { data: orgs, error } = await admin
    .from("orgs")
    .select("id")
    .is("deleted_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const org of (orgs ?? []) as Array<{ id: string }>) {
    summary.orgs++;
    summary.notified += await processOrg(admin, org.id);
  }

  return NextResponse.json({ ok: true, ...summary });
}

async function processOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<number> {
  // Products + their on-hand totals.
  const { data: products } = await admin
    .from("products")
    .select("id, name, locations:locations ( quantity )")
    .eq("org_id", orgId);

  const rows = (products ?? []) as Array<{
    id: string;
    name: string;
    locations: Array<{ quantity: number | null }> | null;
  }>;
  if (rows.length === 0) return 0;

  const productIds = rows.map((r) => r.id);
  const velocities = await productVelocities(admin, { productIds });

  const atRisk: AtRisk[] = [];
  for (const p of rows) {
    const onHand = (p.locations ?? []).reduce(
      (s, l) => s + (l.quantity ?? 0),
      0
    );
    const velocity = velocities.get(p.id) ?? 0;
    const dts = daysToStockout({ onHand, velocity });
    if (dts != null && dts <= ALERT_THRESHOLD_DAYS) {
      atRisk.push({ id: p.id, name: p.name, onHand, velocity, dts });
    }
  }
  if (atRisk.length === 0) return 0;

  // Who to notify: owners + admins (the people who reorder). Adjust ROLES.
  const { data: members } = await admin
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .in("role", ROLES_TO_ALERT as unknown as string[]);
  const userIds = ((members ?? []) as Array<{ user_id: string }>).map(
    (m) => m.user_id
  );
  if (userIds.length === 0) return 0;

  // Dedup: which (user, product-link) pairs already got a stock_alert recently?
  const cooldownSince = new Date();
  cooldownSince.setDate(cooldownSince.getDate() - ALERT_COOLDOWN_DAYS);
  const links = atRisk.map((a) => `/inventory/${a.id}`);

  const { data: recent } = await admin
    .from("notifications")
    .select("user_id, link")
    .in("user_id", userIds)
    .eq("kind", "stock_alert")
    .in("link", links)
    .gte("created_at", cooldownSince.toISOString());

  const alreadyAlerted = new Set(
    ((recent ?? []) as Array<{ user_id: string; link: string | null }>).map(
      (r) => `${r.user_id}|${r.link}`
    )
  );

  // Build notification rows (one per user per at-risk product, minus dedup).
  type NotificationInsert = {
    user_id: string;
    kind: string;
    title: string;
    body: string;
    link: string;
  };
  const inserts: NotificationInsert[] = [];
  // Track distinct products that triggered a NEW alert this run (post-cooldown),
  // so the integration fan-out fires on the same cadence as the in-app alert
  // rather than every sweep.
  const newlyAlerted: AtRisk[] = [];

  // Pick the products that need a fresh alert, then narrate them with bounded
  // concurrency — the per-product LLM copy calls were previously sequential,
  // so 20 at-risk SKUs stacked 20 serial network+LLM latencies against the
  // route's maxDuration. copyFor already falls open to deterministic copy.
  const pending: Array<{ a: AtRisk; targets: string[] }> = [];
  for (const a of atRisk) {
    const link = `/inventory/${a.id}`;
    const targets = userIds.filter(
      (uid) => !alreadyAlerted.has(`${uid}|${link}`)
    );
    if (targets.length === 0) continue;
    newlyAlerted.push(a);
    pending.push({ a, targets });
  }

  const NARRATE_CONCURRENCY = 5;
  const copies = new Map<string, { title: string; body: string }>();
  for (let i = 0; i < pending.length; i += NARRATE_CONCURRENCY) {
    const chunk = pending.slice(i, i + NARRATE_CONCURRENCY);
    const results = await Promise.all(chunk.map(({ a }) => copyFor(admin, a)));
    chunk.forEach(({ a }, j) => copies.set(a.id, results[j]));
  }

  for (const { a, targets } of pending) {
    const link = `/inventory/${a.id}`;
    const copy = copies.get(a.id);
    if (!copy) continue;
    for (const uid of targets) {
      inserts.push({
        user_id: uid,
        kind: "stock_alert",
        title: copy.title,
        body: copy.body,
        link,
      });
    }
  }

  if (inserts.length === 0) return 0;

  // NOTE: inserting only the columns the read path uses (user_id, kind, title,
  // body, link); created_at/read_at default. If your notifications table has a
  // NOT NULL org_id, add `org_id: orgId` to each row.
  const { error: insertErr } = await admin
    .from("notifications")
    .insert(inserts);
  if (insertErr) {
    console.error(
      `[stockout-alerts] insert failed for org ${orgId}:`,
      insertErr
    );
    return 0;
  }

  // Fan the same alert out to connected integrations + webhooks subscribed to
  // "low_stock". dispatchEvent only delivers to orgs that opted in, and swallows
  // its own delivery errors, so this can't break the in-app alert path.
  if (newlyAlerted.length > 0) {
    const preview = newlyAlerted
      .slice(0, 5)
      .map(
        (a) =>
          `${a.name} — ~${a.dts <= 0 ? "<1" : a.dts}d to stockout (${a.onHand} on hand)`
      )
      .join("; ");
    try {
      await dispatchEvent({
        type: "low_stock",
        org_id: orgId,
        title:
          newlyAlerted.length === 1
            ? `Low stock: ${newlyAlerted[0].name}`
            : `${newlyAlerted.length} products low on stock`,
        body:
          preview +
          (newlyAlerted.length > 5
            ? `; +${newlyAlerted.length - 5} more`
            : ""),
        link:
          newlyAlerted.length === 1
            ? `/inventory/${newlyAlerted[0].id}`
            : "/inventory?low=1",
        data: {
          products: newlyAlerted.map((a) => ({
            id: a.id,
            name: a.name,
            onHand: a.onHand,
            daysToStockout: a.dts,
          })),
        },
      });
    } catch (err) {
      console.error(`[stockout-alerts] dispatch failed for org ${orgId}:`, err);
    }
  }

  return inserts.length;
}

/**
 * AI copy via narrate-event (anomaly/stock_alert). Uses the admin client's
 * functions.invoke deliberately — a cron request has no user session, so the
 * cookie-based RLS client can't authenticate the edge-function call. Fails
 * open to a deterministic title/body so the alert ships even if the LLM is down.
 */
async function copyFor(
  admin: ReturnType<typeof createAdminClient>,
  a: AtRisk
): Promise<{ title: string; body: string }> {
  const runway =
    a.dts <= 0
      ? "within a day"
      : `in ~${a.dts} ${a.dts === 1 ? "day" : "days"}`;
  const fallback = {
    title: `Low runway: ${a.name}`,
    body: `Projected to stock out ${runway} at current demand (${a.velocity.toFixed(
      1
    )}/day, ${a.onHand.toLocaleString()} on hand). Consider reordering.`,
  };

  try {
    const { data, error } = await admin.functions.invoke<{
      narration?: string;
    }>("narrate-event", {
      body: {
        type: "anomaly",
        kind: "stock_alert",
        context: {
          product: a.name,
          days_to_stockout: a.dts,
          velocity: Number(a.velocity.toFixed(2)),
          on_hand: a.onHand,
        },
      },
    });
    if (error || !data?.narration) return fallback;
    const lines = data.narration
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return fallback;
    return { title: lines[0], body: lines.slice(1).join(" ") };
  } catch {
    return fallback;
  }
}
