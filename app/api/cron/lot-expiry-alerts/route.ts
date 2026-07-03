import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { daysToExpiry } from "@/lib/lots";

/**
 * Scheduled lot-expiry alert sweep.
 *
 * For every org, finds lots at/near expiry (within ALERT_THRESHOLD_DAYS, or
 * already expired) and writes an in-app notification to owners/admins. Same
 * shape as the stockout-alerts cron: CRON_SECRET-guarded, admin client (RLS
 * bypassed) with explicit org_id filtering, and dedup against recent
 * notifications (skip a (user, lot) pair alerted within ALERT_COOLDOWN_DAYS).
 *
 * SCHEDULE: external — pg_cron POSTs daily (see the cron migration). The link
 * carries the lot id (`/lots?lot=<id>`) so dedup is per-lot.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALERT_THRESHOLD_DAYS = 30;
const ALERT_COOLDOWN_DAYS = 7;
const ROLES_TO_ALERT = ["owner", "admin"] as const;

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
  // Cutoff = today + threshold; pull lots with an expiry on/before it
  // (includes already-expired). Lots only exist for lot-tracked products.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + ALERT_THRESHOLD_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data: lots } = await admin
    .from("lots")
    .select("id, lot_number, expires_at, product:products ( name )")
    .eq("org_id", orgId)
    .not("expires_at", "is", null)
    .lte("expires_at", cutoffIso);

  type LotRow = {
    id: string;
    lot_number: string;
    expires_at: string | null;
    product: { name: string } | { name: string }[] | null;
  };
  const atRisk = (lots ?? []) as LotRow[];
  if (atRisk.length === 0) return 0;

  // Owners + admins get the alert.
  const { data: members } = await admin
    .from("org_members")
    .select("user_id, role")
    .eq("org_id", orgId)
    .in("role", ROLES_TO_ALERT as unknown as string[]);
  const userIds = ((members ?? []) as Array<{ user_id: string }>).map(
    (m) => m.user_id
  );
  if (userIds.length === 0) return 0;

  const links = atRisk.map((l) => `/lots?lot=${l.id}`);
  const cooldownSince = new Date();
  cooldownSince.setDate(cooldownSince.getDate() - ALERT_COOLDOWN_DAYS);

  const { data: recent } = await admin
    .from("notifications")
    .select("user_id, link")
    .in("user_id", userIds)
    .eq("kind", "lot_expiry")
    .in("link", links)
    .gte("created_at", cooldownSince.toISOString());
  const alreadyAlerted = new Set(
    ((recent ?? []) as Array<{ user_id: string; link: string | null }>).map(
      (r) => `${r.user_id}|${r.link}`
    )
  );

  type NotificationInsert = {
    org_id: string;
    user_id: string;
    kind: string;
    title: string;
    body: string;
    link: string;
  };
  const inserts: NotificationInsert[] = [];

  for (const lot of atRisk) {
    const link = `/lots?lot=${lot.id}`;
    const targets = userIds.filter(
      (uid) => !alreadyAlerted.has(`${uid}|${link}`)
    );
    if (targets.length === 0) continue;

    const product = Array.isArray(lot.product) ? lot.product[0] : lot.product;
    const name = product?.name ?? "Product";
    const d = daysToExpiry(lot.expires_at);
    const runway =
      d == null
        ? ""
        : d < 0
        ? `expired ${Math.abs(d)}d ago`
        : d === 0
        ? "expires today"
        : `expires in ${d}d`;
    const title =
      d != null && d < 0
        ? `Lot expired: ${name}`
        : `Lot expiring: ${name}`;
    const body = `Lot ${lot.lot_number} ${runway}. Review and rotate or dispose.`;

    for (const uid of targets) {
      inserts.push({
        org_id: orgId,
        user_id: uid,
        kind: "lot_expiry",
        title,
        body,
        link,
      });
    }
  }

  if (inserts.length === 0) return 0;

  const { error: insertErr } = await admin
    .from("notifications")
    .insert(inserts);
  if (insertErr) {
    console.error(`[lot-expiry-alerts] insert failed for org ${orgId}:`, insertErr);
    return 0;
  }
  return inserts.length;
}
