import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import {
  getReasons,
  getPendingAdjustments,
} from "@/lib/data/adjustments";
import { AddReasonForm } from "./AddReasonForm";
import {
  seedDefaultReasons,
  toggleReason,
  setApprovalThreshold,
  approveAdjustment,
  rejectAdjustment,
} from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerButton } from "@/components/ui/CornerButton";
import { ShieldCheck, Check, X } from "lucide-react";

export const metadata = { title: "Adjustment governance" };

export default async function AdjustmentsSettingsPage() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) {
    return <PageHeader eyebrow="Settings" title="Adjustments" description="No workspace." />;
  }
  const supabase = await createClient();
  const isAdmin = ctx.can("adjustments.approve");

  const [reasons, pending, { data: org }] = await Promise.all([
    getReasons(supabase, ctx.orgId),
    getPendingAdjustments(supabase, ctx.orgId, null),
    supabase
      .from("orgs")
      .select("adjustment_approval_threshold")
      .eq("id", ctx.orgId)
      .maybeSingle(),
  ]);
  const threshold =
    (org as { adjustment_approval_threshold: number | null } | null)
      ?.adjustment_approval_threshold ?? null;

  return (
    <div className="flex flex-col gap-32">
      <PageHeader
        backHref="/cycle-counts"
        backLabel="Cycle counts"
        eyebrow="Settings · Inventory control"
        title="Adjustment governance"
        description="Reason codes captured on every stock adjustment, plus an approval gate for large manual adjustments."
        meta={[{ label: "Pending approvals", value: String(pending.length), status: pending.length ? ("live" as const) : undefined }]}
      />

      {/* Approval queue */}
      <section aria-labelledby="queue">
        <SectionTitle numeral="01" eyebrow="Review" title="Pending approvals" />
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing awaiting approval"
            description="Manual adjustments over the threshold (or with a reason that requires approval) land here for an admin to approve or reject."
            icon={<ShieldCheck size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="flex flex-col gap-10">
            {pending.map((p) => (
              <li key={p.id} className="hairline bg-[var(--surface)] p-16 flex items-center gap-14 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-10 flex-wrap">
                    <Link
                      href={`/inventory/${p.productId}`}
                      className="text-text hover:text-[var(--accent)] transition-colors"
                      style={{ fontFamily: "var(--display)", fontSize: 13, fontWeight: 600 }}
                    >
                      {p.productName}
                    </Link>
                    <span className="mono-body tnum text-text">
                      {p.currentQty} →{" "}
                      <span className={p.delta < 0 ? "text-[var(--danger)]" : "text-[var(--success)]"}>
                        {p.requestedQty}
                      </span>{" "}
                      <span className="text-text-dim">({p.delta > 0 ? "+" : ""}{p.delta})</span>
                    </span>
                  </div>
                  <p className="mono-sm text-text-dim mt-2">
                    {p.slotLabel ?? "—"}
                    {p.warehouseName ? ` · ${p.warehouseName}` : ""}
                    {p.reasonLabel ? ` · ${p.reasonLabel}` : ""}
                    {p.notes ? ` · “${p.notes}”` : ""}
                  </p>
                </div>
                {isAdmin ? (
                  <div className="flex items-center gap-8">
                    <form action={approveAdjustment}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="hairline-subtle px-12 py-7 inline-flex items-center gap-6 border-[var(--success)] text-[var(--success)] hover:bg-[var(--success-dim)] transition-colors"
                      >
                        <Check size={11} strokeWidth={1.5} />
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase" }}>Approve</span>
                      </button>
                    </form>
                    <form action={rejectAdjustment}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="hairline-subtle px-12 py-7 inline-flex items-center gap-6 border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-dim)] transition-colors"
                      >
                        <X size={11} strokeWidth={1.5} />
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.8px", textTransform: "uppercase" }}>Reject</span>
                      </button>
                    </form>
                  </div>
                ) : (
                  <span className="mono-sm text-text-dim">Awaiting admin</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Threshold */}
      <section aria-labelledby="threshold">
        <SectionTitle numeral="02" eyebrow="Policy" title="Approval threshold" />
        <div className="hairline bg-[var(--surface)] p-20">
          <p className="mono-sm text-text-secondary mb-12" style={{ lineHeight: 1.6 }}>
            Manual adjustments whose magnitude exceeds this many units require
            approval before they change on-hand. Leave blank to disable.
          </p>
          {isAdmin ? (
            <form action={setApprovalThreshold} className="flex items-end gap-10">
              <label className="flex flex-col gap-2" style={{ fontFamily: "var(--mono)", fontSize: 10 }}>
                <span className="text-text-dim" style={{ letterSpacing: "0.5px" }}>UNITS</span>
                <input
                  name="threshold"
                  type="number"
                  min={1}
                  defaultValue={threshold ?? ""}
                  placeholder="off"
                  className="hairline-subtle bg-[var(--surface-2)] px-10 py-6 text-text tnum w-[120px] focus:border-[var(--accent)] outline-none"
                />
              </label>
              <CornerButton type="submit" variant="ghost" size="sm">Save</CornerButton>
            </form>
          ) : (
            <p className="mono-body text-text">
              {threshold != null ? `${threshold} units` : "Disabled"}
            </p>
          )}
        </div>
      </section>

      {/* Reasons */}
      <section aria-labelledby="reasons">
        <SectionTitle
          numeral="03"
          eyebrow="Vocabulary"
          title="Reason codes"
          action={
            isAdmin && reasons.length === 0 ? (
              <form action={seedDefaultReasons}>
                <CornerButton type="submit" variant="ghost" size="sm">Add default set</CornerButton>
              </form>
            ) : undefined
          }
        />
        {reasons.length === 0 ? (
          <EmptyState
            title="No reason codes yet"
            description="Add a standard set, or create your own. Reasons are captured on every adjustment for audit and reporting."
            icon={<ShieldCheck size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {reasons.map((r) => (
              <div key={r.id} className="px-16 py-12 flex items-center gap-14 flex-wrap">
                <span
                  className="text-text"
                  style={{ fontFamily: "var(--display)", fontSize: 13, opacity: r.isActive ? 1 : 0.45 }}
                >
                  {r.label}
                </span>
                <code className="mono-sm text-text-dim">{r.code}</code>
                {r.requiresApproval && (
                  <span className="bg-[var(--warning-dim)] text-[var(--warning)] px-6 py-1" style={{ fontFamily: "var(--mono)", fontSize: 8, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                    Approval
                  </span>
                )}
                {!r.isActive && (
                  <span className="mono-sm text-text-dim" style={{ fontSize: 10 }}>inactive</span>
                )}
                {isAdmin && (
                  <div className="flex items-center gap-8 ml-auto">
                    <ToggleForm id={r.id} field="requires_approval" value={!r.requiresApproval} label={r.requiresApproval ? "No approval" : "Require approval"} />
                    <ToggleForm id={r.id} field="is_active" value={!r.isActive} label={r.isActive ? "Disable" : "Enable"} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {isAdmin && reasons.length > 0 && (
          <div className="mt-14">
            <AddReasonForm />
          </div>
        )}
      </section>
    </div>
  );
}

function ToggleForm({
  id,
  field,
  value,
  label,
}: {
  id: string;
  field: "is_active" | "requires_approval";
  value: boolean;
  label: string;
}) {
  return (
    <form action={toggleReason}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={String(value)} />
      <button
        type="submit"
        className="hairline-subtle px-8 py-4 text-text-secondary hover:text-text hover:border-[var(--border-hover)] transition-colors"
        style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "0.5px", textTransform: "uppercase" }}
      >
        {label}
      </button>
    </form>
  );
}
