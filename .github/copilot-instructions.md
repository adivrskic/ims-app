# Copilot instructions — Nautilus Dashboard

These instructions guide GitHub Copilot (and other AI pair-programmers) when working in this repository. Follow it for every suggestion.

## Project context

This is the **Nautilus Dashboard** — the desk-bound web app of the Nautilus warehouse platform. It's a server-first **Next.js 15 (App Router) + React 19 + TypeScript** application backed by **Supabase** (Postgres, Auth, Realtime, Edge Functions), styled with **Tailwind** driven by CSS-custom-property design tokens.

It is part of a suite: a marketing site (apex domain), this dashboard (`app.<apex>`), a React Native mobile picker app, and an edge-functions repo (`nimbus-edge-functions`). All surfaces share one Supabase project and one design system documented in `nimbus-design-system.md`.

**Naming:** the brand is **Nautilus**. Some legacy identifiers still say `nimbus` (the `app-nimbus` package, `nimbus-design-system.md`, the edge-functions repo). Don't rename those, but use **Nautilus** in all new user-facing copy.

## Architecture rules

- **Server-first.** New pages are Server Components by default — no `"use client"` unless the component needs interactivity (forms, canvas, realtime, command palette).
- **Mutations are Server Actions.** Put them in an `actions.ts` co-located with the route, marked `"use server"`. Don't create REST route handlers for things a server action can do; reserve `app/api/` for OAuth callbacks, webhook ingest, CSV exports, and print proxies.
- **Three Supabase clients, used deliberately:**
  - `lib/supabase/client.ts` — browser, RLS-scoped. Client Components only.
  - `lib/supabase/server.ts` — server, RLS-scoped. Server Components + actions. **Default choice.**
  - `lib/supabase/admin.ts` — service role, **bypasses RLS**. Only for integration callbacks, `/admin`, and cron jobs.
- **Never import `lib/supabase/admin.ts` from a Client Component.** It leaks the service-role key into the client bundle. Keep all consumers `"use server"`.
- **When using the admin client, always filter by `org_id` explicitly.** RLS is off for it — an unfiltered query reads across every workspace.
- **Schema is `app`, never `public`.** `.from("products")` resolves to `app.products`. Don't query `public`.
- **Cache + revalidate.** Slow-changing org data goes through the `unstable_cache` helpers in `lib/data/` with per-`org_id` keys. After a mutation, call `revalidateTag(tags.X(orgId))` (and/or `revalidatePath`). Don't rely on the 1-hour revalidate alone.
- **Realtime.** For live pages, mount the relevant `components/realtime/PageRealtime.tsx` subcomponent near the top — it refreshes the route on change. Don't hand-roll channel subscriptions in pages.
- **AI calls fail open.** Anything going through `lib/ai/narrate.ts` must tolerate a `null` return and fall back to deterministic copy. Never block an operation on the LLM.

## Auth + access control

- Middleware (`middleware.ts`) handles session refresh and redirects; don't duplicate auth gating in pages. It does **not** protect Server Actions — those must gate themselves.
- **Every server action starts with `getActionContext()`** (`lib/data/actionContext.tsx`). It resolves the active workspace from the cookie-validated membership and returns `{ supabase, user, orgId, role, permissions, can }` or `{ error }`. Never hand-roll an org lookup — an `org_members ... .limit(1)` resolver ignores the workspace cookie and writes to the wrong org after a switch.
- **Gate privileged writes on granular permissions, not role.** The pattern is:

  ```ts
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("inventory.manage")) return { error: "Not authorized" };
  ```

  Permissions are defined in `lib/permissions.ts`. Role-only checks (`app.has_org_role`) are the older pattern and are no longer sufficient on their own.
- **RLS enforces the same permissions independently** via `app.has_any_perm` (`20260715120000_rls_permission_gating`). This is defense in depth, not a substitute for the app-level check — an action that skips `ctx.can()` gets its write silently rejected by RLS, and if it ignores the error the user sees a page reload with no explanation and no error. Check in the action **and** hide the control in the UI.
- The `/admin/*` area is staff-only (`profiles.is_staff`) and redirects non-staff to `/` (it must not 404 — that would leak its existence). The layout gate does not cover its server actions; `createWorkspace` re-checks `getStaffUser()` itself, and any new staff action must too.
- **Never invent a fallback origin.** Public URLs for invites, resets and email links come from `appUrl()` (`lib/appUrl.ts`). A plausible-looking hardcoded hostname for an unset `NEXT_PUBLIC_APP_URL` sends real invite links to a domain we don't own, and nothing errors.

## Design system — non-negotiable

The whole suite must look identical. Pull from the tokens in `globals.css`; never invent values.

- **0px border radius** everywhere. The only exceptions are the avatar pill and live/status dots. Never suggest `rounded-*` Tailwind classes.
- **Hairlines, not heavy borders.** 1px borders via `var(--border)`; 1px dividers via `var(--border-subtle)`. Cards are defined by their hairline, not a fill.
- **Color comes from tokens.** Use `var(--accent)`, `var(--text)`, `var(--surface)`, `var(--danger)`, etc. Never hard-code hex. The single gold accent (`#D4A853`) is rationed to ≤3 instances per viewport — don't sprinkle it. Reds/ambers are likewise rare and semantic.
- **Type:** Satoshi (display) via `var(--display)`, JetBrains Mono via `var(--mono)`. Mono is used for labels, buttons, table headers, IDs, and all numeric readouts. Apply `.tnum` to any numeric/count display. Don't introduce a new font.
- **Use existing primitives.** Reach for `PageHeader`, `KpiCard`, `Badge`, `CornerButton`/`CornerLink`, the float-label field shell, `EmptyState`, `SectionTitle` before writing bespoke markup. Match their props and patterns.
- **Layout convention:** header → KPI strip → primary content → secondary sections, separated by hairlines with ~56px vertical breathing room.
- **Light theme** is `[data-theme="light"]` — any new styling must work in both themes (which it will automatically if you only use tokens).

## Accessibility conventions

- Decorative glyphs/icons get `aria-hidden`; the adjacent text supplies the accessible name. Don't double-announce.
- Interactive controls get a meaningful `aria-label` when their text isn't self-describing (icon-only buttons).
- Error messages use `role="alert"`.
- Lucide icons use `strokeWidth={1.5}` and small sizes (≈11–16px) to match the existing weight.

## Code conventions

- TypeScript strict mode; no `any` — model Supabase row shapes with explicit types (see existing `actions.ts` files for the pattern of normalizing array-vs-object embedded relations).
- Use the `@/*` path alias for imports.
- Co-locate route-specific components, `actions.ts`, and `types.ts` under the route folder.
- Register new authenticated routes in `lib/navData.ts` so they appear in the side rail, mobile nav, and command palette.
- New integrations follow the **Slack** provider as the reference: client in `lib/integrations/`, metadata in `app/(app)/integrations/providers.ts`, logo slug in `ProviderLogo.tsx`, callbacks in `app/api/`.
- Replenishment math (velocity, ROP, EOQ) lives in `lib/replenishment.ts` — reuse it, don't reimplement.
- CSV export cells go through `csvCell` from `lib/print/csv.ts`. It handles spreadsheet formula injection and RFC 4180 quoting while keeping negative numbers numeric. Four routes previously inlined their own copy and drifted into two different bugs — don't start a fifth.

## Data access & performance

- **Aggregate in SQL for anything on a hot path.** `fetchAllPaged` (`lib/data/paginate.ts`) pulls a whole table in 1000-row pages — fine for COLD paths (reports, one-off analytics), wrong for dashboards and anything in a request the user waits on. For hot paths write an RPC that aggregates in Postgres; see `app.overview_stock_total` / `overview_scan_trend` / `overview_low_stock` and the `analytics_aggregate_rpcs` migration for the house pattern.
- **New RPCs follow that pattern:** `language sql`, `stable`, `security invoker`, `set search_path to 'app', 'public'`, then explicit `revoke ... from public, anon` + `grant execute ... to authenticated, service_role`. `security definer` needs a reason.
- **`unstable_cache` is not a fix for an expensive query.** The Overview cache is tag-busted by realtime events, so a slow fetcher re-runs most often exactly when the workspace is busiest.

## Two stock numbers — don't conflate them

These had drifted into three inconsistent definitions across the dashboard; they were reconciled in `20260814140000`. Preserve the distinction:

- **On hand** = *physical* stock. Includes quarantined units. Excludes soft-deleted (`is_active = false`) rows. This is `app.overview_stock_total` and `inventory_list.on_hand`.
- **Low stock** = judged on *available* stock, which **excludes quarantined units** — they can't be picked or sold, so counting them masks a real reorder need. This is `app.overview_low_stock` and `inventory_list`'s `p_low_only` predicate.

So a SKU can show on-hand 30 against a reorder point of 25 and still be flagged low. That is intended, not a bug.

Facility scoping resolves through **sections**: with a facility set, only locations whose section belongs to it count, so unsectioned stock drops out when scoped and counts workspace-wide. Any new stock rollup follows the same rule.

## Security headers

Set in `next.config.mjs` via `headers()` — CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Two traps:

- `script-src` keeps `'unsafe-inline'` deliberately for the pre-hydration theme script. **Do not add a nonce or hash alongside it** — per CSP3 that makes browsers ignore `'unsafe-inline'`, breaking every other inline script. Full-nonce or leave it; not halfway.
- `connect-src` is built from `NEXT_PUBLIC_SUPABASE_URL` and must keep the `wss:` entry, or Realtime stops updating with no visible error.

Any new external origin (script, image, font, fetch target) needs its directive updated or it is silently blocked in production.

## Hardware code

- Scanner and printer features are **WebUSB / HID** and Chromium-desktop only. Guard for unsupported browsers and surface a clear message (Firefox/Safari lack WebUSB).
- ZPL templates assume 203 DPI; don't hard-code dimensions that break on other DPIs without noting it.

## Don't

- Don't put app state in browser storage — use server state, cookies, or React state. `localStorage` is used for **device-local UI preferences only** (theme in `app/layout.tsx`, 2D/3D viewer mode in `FacilityViewer.tsx`), always inside a `try/catch` since private mode can throw.
- Don't hard-code colors, fonts, or border radii.
- Don't call the admin client outside server code, or without an `org_id` filter.
- Don't introduce a new UI primitive when an existing one fits.
- Don't add dependencies for things the current stack already covers: **Lucide** for icons, **three / @react-three/fiber / drei** for 3D, CSS transitions + custom properties for motion (there is no animation library — motion is hand-rolled, e.g. `lib/useGlowCards.ts`).
- Don't query the `public` schema.
- Don't `import` three/r3f into a route's main bundle — it's ~500 kB. Load it via `next/dynamic` with `ssr: false`, as `FacilityViewer.tsx` does.
