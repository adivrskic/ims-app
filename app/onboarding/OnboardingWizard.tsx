"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";
import { Input } from "@/components/ui/Input";
import { AddressFields } from "@/components/ui/AddressFields";
import { Stepper } from "@/components/ui/Stepper";
import { OptionCardGroup } from "@/components/ui/OptionCard";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { INDUSTRIES, getIndustry, primaryNavKeys } from "@/lib/industries";
import {
  ACTIVITIES,
  PRIORITIES,
  SIZE_CLASS_DEFS,
  MAX_PRIORITIES,
  MAX_INVITES,
  MAX_NAME_LENGTH,
  EMAIL_RE,
  defaultActivities,
  modulesFromActivities,
} from "@/lib/modules";
import { resolveNav } from "@/lib/navData";
import { resolveDashboard } from "@/lib/dashboardWidgets";
import { setUpWorkspace, type OnboardingState } from "./actions";
import { OnboardingSuccess } from "./OnboardingSuccess";

interface Props {
  fullName: string | null;
  email: string;
  userId: string;
}

const STEPS = [
  { key: "workspace", label: "Workspace" },
  { key: "work", label: "How you work" },
  { key: "facility", label: "Facility" },
  { key: "team", label: "Team" },
  { key: "review", label: "Review" },
];

interface Draft {
  step: number;
  maxReached: number;
  workspaceName: string;
  industry: string;
  activities: string[];
  activitiesTouched: boolean;
  priorities: string[];
  sizeClass: string;
  facilityName: string;
  inviteEmails: string;
  addr: { city: string; state: string; zip: string };
}

const emptyDraft = (): Draft => ({
  step: 0,
  maxReached: 0,
  workspaceName: "",
  industry: "",
  activities: defaultActivities(primaryNavKeys(null)),
  activitiesTouched: false,
  priorities: [],
  sizeClass: "single_site",
  facilityName: "Main warehouse",
  inviteEmails: "",
  addr: { city: "", state: "", zip: "" },
});

const draftKey = (userId: string) => `nimbus-onboarding-draft:${userId}`;

// Sentinel for the explicit "Something else" pick. Not a real slug, so
// isIndustrySlug() rejects it server-side → stored as null; distinct from ""
// (nothing chosen yet) so the card only highlights once actually selected.
const NO_INDUSTRY = "general";

/** Human titles per step — the H1 swaps as you move through. */
const STEP_TITLES: Array<{ pre: string; em: string; post: string }> = [
  { pre: "Set up your ", em: "workspace", post: "." },
  { pre: "How do you ", em: "work", post: "?" },
  { pre: "Your first ", em: "facility", post: "." },
  { pre: "Invite your ", em: "team", post: "." },
  { pre: "Check and ", em: "create", post: "." },
];

const STEP_INTROS = [
  "A workspace holds your facilities, inventory, and team. Two quick facts and you're moving.",
  "Pick what applies to you — this decides which tools show up in your sidebar and what your dashboard leads with. Nothing here is permanent: change any of it later in Settings → Navigation.",
  "A facility is one physical location — a warehouse, store, or a single storage room. You can add more anytime.",
  "Optional. Teammates join as members with a personal link — you can also do this later from Settings → Members.",
  "A quick read-back of your choices. Edit anything, then create your workspace.",
];

export function OnboardingWizard({ fullName, email, userId }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const [state, formAction, pending] = useActionState<
    OnboardingState | undefined,
    FormData
  >(setUpWorkspace, undefined);

  const [d, setD] = useState<Draft>(emptyDraft);
  const [restored, setRestored] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const firstName = fullName?.split(" ")[0] ?? "there";

  // ── Draft persistence (refresh/back-button safe) ────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Draft>;
        setD((base) => ({ ...base, ...parsed }));
      }
    } catch {
      // Blocked/corrupt storage — start fresh.
    }
    setRestored(true);
  }, [userId]);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(draftKey(userId), JSON.stringify(d));
    } catch {
      // Storage full/blocked — the wizard still works, just won't survive refresh.
    }
  }, [d, restored, userId]);

  // ── Success handling ────────────────────────────────────────────────────
  const succeeded = state?.success === true;
  useEffect(() => {
    if (!succeeded) return;
    try {
      localStorage.removeItem(draftKey(userId));
    } catch {
      // best-effort
    }
    if (!state?.invites?.length && !state?.inviteError) {
      router.replace("/");
    }
  }, [succeeded, state, router, userId]);

  // Server error → surface it (we're on the review step when it can happen).
  useEffect(() => {
    if (state?.error) {
      errorRef.current?.scrollIntoView({ block: "center" });
    }
  }, [state?.error]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const industryDef = getIndustry(d.industry || null);

  // Live preview computed by the REAL resolvers — the same functions the app
  // shell and overview use, so this preview cannot drift from reality.
  const preview = useMemo(() => {
    const modules = modulesFromActivities(d.activities);
    const nav = resolveNav(d.industry || null, modules);
    const navLabels = nav.groups.flatMap((g) => g.items.map((i) => i.label));
    const blocks = resolveDashboard("owner", modules, d.priorities, {
      compact: d.sizeClass === "single_room",
    });
    const leads: string[] = [];
    for (const b of blocks) {
      if (b.kind === "section" && b.key !== "section.getting_started") {
        leads.push(SECTION_PREVIEW_LABELS[b.key] ?? b.key);
      } else if (b.kind === "columns") {
        for (const k of b.keys) leads.push(SECTION_PREVIEW_LABELS[k] ?? k);
      }
    }
    return { navLabels, moreCount: nav.more.length, leads: leads.slice(0, 3) };
  }, [d.activities, d.industry, d.priorities, d.sizeClass]);

  // Invite parsing for the live chip feedback.
  const inviteParsed = useMemo(() => {
    const tokens = d.inviteEmails.split(/[\s,;]+/).filter(Boolean);
    const self = email.trim().toLowerCase();
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const t of tokens) {
      const lower = t.trim().toLowerCase();
      if (!EMAIL_RE.test(lower)) invalid.push(t);
      else if (lower !== self && !valid.includes(lower)) valid.push(lower);
    }
    // The server caps each submit at MAX_INVITES. Mirror that here so the
    // wizard never shows (or promises on the review step) invites it won't
    // actually create.
    return {
      valid: valid.slice(0, MAX_INVITES),
      invalid,
      overflow: Math.max(0, valid.length - MAX_INVITES),
    };
  }, [d.inviteEmails, email]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const snapshotAddress = () => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    setD((prev) => ({
      ...prev,
      addr: {
        city: String(fd.get("facility_city") ?? ""),
        state: String(fd.get("facility_state") ?? ""),
        zip: String(fd.get("facility_zip") ?? ""),
      },
    }));
  };

  const goTo = (step: number) => {
    setFieldError(null);
    snapshotAddress();
    setD((prev) => ({
      ...prev,
      step,
      maxReached: Math.max(prev.maxReached, step),
    }));
  };

  const next = () => {
    if (d.step === 0 && d.workspaceName.trim().length < 2) {
      setFieldError("Give your workspace a name (at least 2 characters).");
      return;
    }
    if (d.step === 2 && !d.facilityName.trim()) {
      setFieldError("Give your facility a name — “Main warehouse” works fine.");
      return;
    }
    goTo(Math.min(d.step + 1, STEPS.length - 1));
  };

  const back = () => goTo(Math.max(d.step - 1, 0));

  // ── Success screen ──────────────────────────────────────────────────────
  if (succeeded && (state?.invites?.length || state?.inviteError)) {
    return (
      <OnboardingSuccess
        orgName={state?.orgName ?? d.workspaceName}
        invites={state?.invites ?? []}
        inviteError={state?.inviteError}
      />
    );
  }
  if (succeeded) {
    // No invites — the effect above is navigating to the dashboard.
    return (
      <p className="mono-sm text-text-muted" role="status">
        Workspace created — opening your dashboard…
      </p>
    );
  }

  const title = STEP_TITLES[d.step];

  return (
    <div className="flex flex-col gap-24">
      {/* Greeting + step title */}
      <div className="flex flex-col gap-12">
        <span className="label-text text-text-muted">
          — Welcome, {firstName}
        </span>
        <h1
          style={{
            fontFamily: "var(--display)",
            fontSize: 34,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.5px",
            margin: 0,
            color: "var(--text)",
          }}
        >
          {title.pre}
          <em className="accent-italic">{title.em}</em>
          {title.post}
        </h1>
        <p
          className="mono-sm"
          style={{ color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 520 }}
        >
          {STEP_INTROS[d.step]}
        </p>
      </div>

      <Stepper
        steps={STEPS}
        current={d.step}
        maxReached={d.maxReached}
        onSelect={goTo}
      />

      <form ref={formRef} action={formAction} className="flex flex-col gap-24">
        {/* Answers that live in wizard state, posted as hidden fields. */}
        <input type="hidden" name="industry" value={d.industry} />
        <input type="hidden" name="size_class" value={d.sizeClass} />
        {d.activities.map((a) => (
          <input key={a} type="hidden" name="activities" value={a} />
        ))}
        {d.priorities.map((p) => (
          <input key={p} type="hidden" name="priorities" value={p} />
        ))}

        {/* ── Step 1 · Workspace ─────────────────────────────────── */}
        <section
          hidden={d.step !== 0}
          className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
          aria-label="Workspace"
        >
          <Input
            label="Workspace name"
            name="workspace_name"
            type="text"
            aria-required="true"
            maxLength={MAX_NAME_LENGTH}
            value={d.workspaceName}
            onChange={(e) => {
              setFieldError(null);
              setD((prev) => ({ ...prev, workspaceName: e.target.value }));
            }}
            error={d.step === 0 ? fieldError ?? undefined : undefined}
            placeholder="Acme Flooring Supply"
            autoComplete="organization"
            hint="Usually your company name — you can rename it later."
          />

          <div className="flex flex-col gap-8">
            <p className="label-text text-text-muted">What do you handle?</p>
            <OptionCardGroup
              ariaLabel="What do you handle?"
              value={d.industry}
              onChange={(v) =>
                setD((prev) => {
                  const industry = prev.industry === v ? "" : v;
                  return {
                    ...prev,
                    industry,
                    // Until the user hand-edits step 2, keep its chips in
                    // sync with the picked industry's defaults.
                    activities: prev.activitiesTouched
                      ? prev.activities
                      : defaultActivities(primaryNavKeys(industry || null)),
                  };
                })
              }
              options={[
                ...INDUSTRIES.map((ind) => ({
                  value: ind.slug,
                  label: ind.label,
                  desc: ind.desc,
                })),
                {
                  value: NO_INDUSTRY,
                  label: "Something else",
                  desc: "A general setup — tune it on the next step",
                },
              ]}
            />
            <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
              This just pre-fills the next step — you stay in control of what
              actually turns on.
            </p>
          </div>
        </section>

        {/* ── Step 2 · How you work ──────────────────────────────── */}
        <div hidden={d.step !== 1} className="flex flex-col gap-16">
          <section
            className="hairline bg-[var(--surface)] p-24 flex flex-col gap-12"
            aria-label="What you do"
          >
            <header className="flex items-baseline justify-between gap-12">
              <p className="label-text--lg">What do you do day to day?</p>
              <span className="mono-sm text-text-dim">Pick all that apply</span>
            </header>
            <ChipGroup
              ariaLabel="Activities"
              chips={ACTIVITIES.map((a) => ({
                value: a.key,
                label: a.label,
                desc: a.desc,
              }))}
              values={d.activities}
              onChange={(values) =>
                setD((prev) => ({
                  ...prev,
                  activities: values,
                  activitiesTouched: true,
                }))
              }
            />
          </section>

          <section
            className="hairline bg-[var(--surface)] p-24 flex flex-col gap-12"
            aria-label="Priorities"
          >
            <header className="flex items-baseline justify-between gap-12">
              <p className="label-text--lg">
                What do you want to see first each morning?
              </p>
              <span className="mono-sm text-text-dim">
                Up to {MAX_PRIORITIES} · optional
              </span>
            </header>
            <ChipGroup
              ariaLabel="Dashboard priorities"
              chips={PRIORITIES.map((p) => ({ value: p.key, label: p.label }))}
              values={d.priorities}
              onChange={(priorities) => setD((prev) => ({ ...prev, priorities }))}
              max={MAX_PRIORITIES}
              showRank
            />
            <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
              Your dashboard leads with what you pick, in that order.
            </p>
          </section>

          <section
            className="hairline bg-[var(--surface)] p-24 flex flex-col gap-12"
            aria-label="Operation size"
          >
            <p className="label-text--lg">How big is your operation?</p>
            <OptionCardGroup
              ariaLabel="Operation size"
              columns={1}
              value={d.sizeClass}
              onChange={(sizeClass) => setD((prev) => ({ ...prev, sizeClass }))}
              options={SIZE_CLASS_DEFS.map((s) => ({
                value: s.key,
                label: s.label,
                desc: s.desc,
              }))}
            />
          </section>

          {/* Live preview — computed by the real resolvers, so it can't lie. */}
          <aside
            className="hairline-subtle bg-[var(--surface-2)] p-16 flex flex-col gap-8"
            aria-label="Preview of your setup"
          >
            <p className="label-text text-text-muted">Your Nimbus, so far</p>
            <p className="mono-sm text-text-secondary" style={{ lineHeight: 1.7 }}>
              Sidebar: {preview.navLabels.join(" · ")}
              {preview.moreCount > 0 && (
                <span className="text-text-dim">
                  {" "}
                  (+{preview.moreCount} tucked under “More”)
                </span>
              )}
            </p>
            {preview.leads.length > 0 && (
              <p className="mono-sm text-text-secondary" style={{ lineHeight: 1.7 }}>
                Dashboard leads with: {preview.leads.join(", ")}
              </p>
            )}
          </aside>
        </div>

        {/* ── Step 3 · Facility ──────────────────────────────────── */}
        <section
          hidden={d.step !== 2}
          className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
          aria-label="First facility"
        >
          <Input
            label="Facility name"
            name="facility_name"
            type="text"
            aria-required="true"
            maxLength={MAX_NAME_LENGTH}
            value={d.facilityName}
            onChange={(e) => {
              setFieldError(null);
              setD((prev) => ({ ...prev, facilityName: e.target.value }));
            }}
            error={d.step === 2 ? fieldError ?? undefined : undefined}
            placeholder="Main warehouse"
          />
          <details className="flex flex-col gap-12">
            <summary className="mono-sm text-text-muted cursor-pointer select-none">
              Add address (optional) — helps with labels &amp; paperwork
            </summary>
            <div className="mt-12">
              <AddressFields
                key={restored ? "restored" : "initial"}
                namePrefix="facility"
                initialCity={d.addr.city}
                initialState={d.addr.state}
                initialZip={d.addr.zip}
              />
            </div>
          </details>
        </section>

        {/* ── Step 4 · Team ──────────────────────────────────────── */}
        <section
          hidden={d.step !== 3}
          className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16"
          aria-label="Invite teammates"
        >
          <Input
            label="Teammate emails"
            name="invite_emails"
            type="text"
            value={d.inviteEmails}
            onChange={(e) =>
              setD((prev) => ({ ...prev, inviteEmails: e.target.value }))
            }
            placeholder="ops@acme.com, lead@acme.com"
            hint="Separate with commas. Each person gets a personal join link — sent by email and shown to you to share."
          />
          {(inviteParsed.valid.length > 0 || inviteParsed.invalid.length > 0) && (
            <div className="flex flex-wrap gap-6" aria-live="polite">
              {inviteParsed.valid.map((v) => (
                <span
                  key={v}
                  className="hairline-subtle border-[var(--accent-soft)] bg-[var(--accent-dim)] px-8 py-4 mono-sm text-text"
                >
                  {v}
                </span>
              ))}
              {inviteParsed.invalid.map((v, i) => (
                <span
                  key={`${v}${i}`}
                  className="hairline-subtle border-[var(--danger-border)] bg-[var(--danger-dim)] px-8 py-4 mono-sm text-[var(--danger)]"
                  title="Doesn't look like an email address"
                >
                  {v} ?
                </span>
              ))}
            </div>
          )}
          {inviteParsed.overflow > 0 && (
            <p
              role="status"
              className="hairline-subtle border-[var(--warning)] bg-[var(--warning-dim)] px-14 py-12 mono-sm text-[var(--warning)]"
              style={{ lineHeight: 1.6 }}
            >
              We can send {MAX_INVITES} invites at a time, so the last{" "}
              {inviteParsed.overflow}{" "}
              {inviteParsed.overflow === 1 ? "address" : "addresses"} won&apos;t
              be included. Invite the rest from Settings → Members once
              you&apos;re in.
            </p>
          )}
        </section>

        {/* ── Step 5 · Review ────────────────────────────────────── */}
        <section
          hidden={d.step !== 4}
          className="hairline bg-[var(--surface)] flex flex-col"
          aria-label="Review your choices"
        >
          <ReviewRow
            label="Workspace"
            value={`${d.workspaceName || "—"}${
              industryDef ? ` · ${industryDef.label}` : ""
            }`}
            onEdit={() => goTo(0)}
          />
          <ReviewRow
            label="How you work"
            value={
              d.activities.length > 0
                ? d.activities
                    .map(
                      (k) => ACTIVITIES.find((a) => a.key === k)?.label ?? k
                    )
                    .join("; ")
                : "Just the essentials — inventory, facilities, analytics"
            }
            onEdit={() => goTo(1)}
          />
          {d.priorities.length > 0 && (
            <ReviewRow
              label="See first"
              value={d.priorities
                .map((k) => PRIORITIES.find((p) => p.key === k)?.label ?? k)
                .join(" → ")}
              onEdit={() => goTo(1)}
            />
          )}
          <ReviewRow
            label="Facility"
            value={`${d.facilityName || "—"}${
              d.addr.city || d.addr.state
                ? ` · ${[d.addr.city, d.addr.state, d.addr.zip]
                    .filter(Boolean)
                    .join(", ")}`
                : ""
            }`}
            onEdit={() => goTo(2)}
          />
          <ReviewRow
            label="Team"
            value={
              inviteParsed.valid.length > 0
                ? `Inviting ${inviteParsed.valid.length} ${
                    inviteParsed.valid.length === 1 ? "person" : "people"
                  }`
                : "Just you for now"
            }
            onEdit={() => goTo(3)}
            last
          />
        </section>

        {/* Feedback */}
        {(state?.error || fieldError) && (
          <p
            ref={errorRef}
            role="alert"
            className="hairline-subtle border-[var(--danger-border)] bg-[var(--danger-dim)] px-14 py-12 mono-sm text-[var(--danger)] inline-flex items-start gap-8"
          >
            <AlertTriangle size={11} strokeWidth={1.5} className="mt-2 shrink-0" />
            <span>{state?.error ?? fieldError}</span>
          </p>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between gap-14 flex-wrap">
          {d.step > 0 ? (
            <CornerButton type="button" variant="ghost" size="sm" onClick={back}>
              <ArrowLeft size={11} strokeWidth={1.5} />
              Back
            </CornerButton>
          ) : (
            <p className="mono-sm text-text-dim" style={{ lineHeight: 1.6 }}>
              Signed in as <span className="text-text-muted">{email}</span> ·
              you&apos;ll be the owner.
            </p>
          )}

          {d.step < STEPS.length - 1 ? (
            <CornerButton type="button" variant="primary" onClick={next}>
              {d.step === 1 || d.step === 3 ? "Looks right" : "Next"}
              <ArrowRight size={11} strokeWidth={1.5} />
            </CornerButton>
          ) : (
            <CornerButton type="submit" variant="primary" loading={pending}>
              Create workspace
              <ArrowRight size={11} strokeWidth={1.5} />
            </CornerButton>
          )}
        </div>
      </form>
    </div>
  );
}

const SECTION_PREVIEW_LABELS: Record<string, string> = {
  "section.reorder_alerts": "Reorder alerts",
  "section.pick_queue": "Pick queue",
  "section.pos_in_transit": "POs in transit",
  "section.top_movers": "Top movers",
  "section.recent_scans": "Recent activity",
};

function ReviewRow({
  label,
  value,
  onEdit,
  last = false,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  last?: boolean;
}) {
  return (
    <div
      className={`px-20 py-14 flex items-start gap-14 ${
        last ? "" : "hairline-b"
      }`}
    >
      <span className="label-text text-text-muted w-[92px] shrink-0 mt-2">
        {label}
      </span>
      <span
        className="flex-1 min-w-0 text-text"
        style={{ fontFamily: "var(--display)", fontSize: 13, lineHeight: 1.5 }}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 inline-flex items-center gap-6 mono-sm text-text-muted hover:text-text transition-colors"
        aria-label={`Edit ${label}`}
      >
        <Pencil size={10} strokeWidth={1.5} />
        Edit
      </button>
    </div>
  );
}
