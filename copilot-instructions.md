# Copilot instructions — Nautilus Dashboard

These instructions guide GitHub Copilot (and other AI pair-programmers) when working in this repository. Place this file at `.github/copilot-instructions.md`. Follow it for every suggestion.

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

- Middleware (`middleware.ts`) handles session refresh and redirects; don't duplicate auth gating in pages.
- Gate privileged writes on role. Owner/admin-only actions check role server-side (mirroring the `app.has_org_role` policy) — re-validate in the action, never trust the client.
- The `/admin/*` area is staff-only (`profiles.is_staff`) and redirects non-staff to `/` (it must not 404 — that would leak its existence).

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

## Hardware code

- Scanner and printer features are **WebUSB / HID** and Chromium-desktop only. Guard for unsupported browsers and surface a clear message (Firefox/Safari lack WebUSB).
- ZPL templates assume 203 DPI; don't hard-code dimensions that break on other DPIs without noting it.

## Don't

- Don't add browser storage (`localStorage`/`sessionStorage`) for app state — use server state, cookies, or React state.
- Don't hard-code colors, fonts, or border radii.
- Don't call the admin client outside server code, or without an `org_id` filter.
- Don't introduce a new UI primitive when an existing one fits.
- Don't add dependencies for things the current stack already covers (Lucide for icons, GSAP for motion, three/r3f for 3D).
- Don't query the `public` schema.
