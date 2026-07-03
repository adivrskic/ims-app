<div align="center">

# Nautilus — Dashboard

**The desk-bound web app for the Nautilus warehouse platform.**
Inventory, orders, purchasing, returns, facilities, and integrations — for operators and admins at a desk. Mobile pickers stay on the React Native app; this surface is for the big screen.

`Next.js 15` · `React 19` · `TypeScript` · `Supabase` · `Tailwind`

_Internal engineering doc — Nautilus team only._

</div>

---

## Table of contents

- [What this is](#what-this-is)
- [Where it sits in the suite](#where-it-sits-in-the-suite)
- [Stack](#stack)
- [Feature tour](#feature-tour)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [One-time Supabase configuration](#one-time-supabase-configuration)
- [Architecture](#architecture)
- [Design system](#design-system)
- [Hardware integrations](#hardware-integrations)
- [Kiosk / wallboard mode](#kiosk--wallboard-mode)
- [Project layout](#project-layout)
- [Common tasks](#common-tasks)
- [Deploying](#deploying)
- [Status snapshot](#status-snapshot)
- [Engineering notes](#engineering-notes)

---

## What this is

Nautilus Dashboard is the customer-facing web application that warehouse teams use to run their operation from a desk or wallboard: managing the product catalog, running cycle counts, working orders / purchase orders / returns, designing facility layouts in 2D and 3D, and wiring up integrations. It is a server-first Next.js App Router application backed by Supabase (Postgres + Auth + Realtime + Edge Functions), with row-level security isolating every workspace's data.

This README is for the Nautilus engineering team. It assumes you have access to the shared Supabase project (ref `seypbrzjjiuibrwyxewj`), the sibling repos, and the internal design-system doc.

> **Naming note.** The product and brand is **Nautilus**. Some internal identifiers still carry the original `nimbus` codename — the npm package (`app-nimbus`), the design-system doc (`nimbus-design-system.md`), the edge-functions repo (`nimbus-edge-functions`), and assorted CSS comments. These are intentionally left as-is so they remain greppable; treat **Nautilus** as canonical in all new user-facing copy.

---

## Where it sits in the suite

Nautilus is a multi-surface product. This repo is one piece of it.

| Surface                     | Repo / location              | Purpose                                            |
| --------------------------- | ---------------------------- | -------------------------------------------------- |
| **Marketing site**          | apex domain (`<apex>`)       | Public marketing + sign-up entry point             |
| **Dashboard** _(this repo)_ | `app.<apex>`                 | Desk-bound operator + admin console                |
| **Mobile app**              | React Native (separate repo) | On-the-floor barcode picking + adjustments         |
| **Edge functions**          | `nimbus-edge-functions`      | AI narration (`narrate-event`) and background jobs |

All four share one **Supabase project** and one **design system** (`nimbus-design-system.md`). The dashboard reads and writes exclusively to the `app` schema — it never touches `public`.

---

## Stack

- **Framework** — Next.js 15 (App Router, React 19, TypeScript, server-first)
- **Auth + data** — Supabase via `@supabase/ssr` (Postgres, Auth, Realtime, Edge Functions)
- **Styling** — Tailwind CSS driven by CSS-custom-property design tokens
- **3D** — `three` + `@react-three/fiber` + `@react-three/drei` (lazy-loaded for the facility viewer)
- **Motion** — GSAP
- **Icons** — Lucide
- **Hosting** — Netlify (a second site sharing env conventions with the marketing repo)

---

## Feature tour

### Operate

- **Overview** — KPI strip, recent scans, low-stock signals, link into kiosk mode.
- **Inventory** — Product catalog with detail pages, CSV import/export, per-product reorder point / safety stock / lead time.
- **Analytics** — Headline metrics, a dead-stock report, and an AI-narrated operations summary.
- **Cycle counts** — Variance recording and accuracy tracking.
- **Scan workstation** — Browser-side barcode capture surface (see [Hardware](#hardware-integrations)).

### Flow

- **Orders** — Pick lists, deliveries, and customer pickups driven by a full status state machine.
- **Purchase orders** — Manual creation plus **AI-drafted reorder POs**: for every product at or below its reorder point the system computes daily velocity from the last 60 days of scans, a reorder point (`velocity × lead time + safety stock`), an economic order quantity (EOQ), and a recommended quantity, then groups lines by preferred supplier and attaches a one-line reasoning sentence per item. Unit cost is snapshotted onto each line for historical cost analysis.
- **Returns** — Disposition routing (restock / damaged / RMA).

### Directory

- **Suppliers** — Directory with a performance scorecard and default lead times.
- **Customers** — Customer directory (business + individual).

### Facilities

- **Viewer** — Read-only 2D top-down (SVG) and 3D orbital (`react-three-fiber`, β) views.
- **Builder** — Layout editor with snap-to-grid, smart guides, undo/redo, snapshots, and an AI blueprint scan. _(Editing is 2D-only today.)_
- **Sections** — Bay × level slot grids with inventory placement.

### Settings

- **Account** — Profile and workspace membership.
- **Security** — TOTP-based multi-factor auth via Supabase `auth.mfa`.
- **Members** — Role management plus CSV bulk invite with Resend-delivered transactional email.
- **Devices** — Pair/test barcode scanners and Zebra label printers.
- **Billing** — Stripe-aware plan and seat management.
- **API keys** — Tokens for the mobile app and integrations.
- **Audit log** — Workspace activity history.
- **Webhooks** — HMAC-signed outbound endpoints with a delivery log.

### Integrations

Built: **Slack** (reference implementation), **Shopify** (OAuth + webhook ingestion), **Resend** (transactional email), and custom webhook endpoints. Nine more providers (Square, WooCommerce, QuickBooks, Xero, Stripe, ShipStation, FedEx, Gmail, Zapier, HubSpot) ship as stubs — Slack is the template for building any new one.

### Admin

Staff-only console (gated by `profiles.is_staff`) for provisioning new customer workspaces at `/admin/onboard`. The route is deliberately invisible to non-staff: it redirects to `/` rather than 404-ing, so its existence isn't leaked.

---

## Getting started

### 1. Install

```bash
npm install
```

> **Peer-deps note.** The 3D viewer pulls in `@react-three/fiber`, which declares an optional React Native peer. If Expo is present elsewhere in your tree, npm may trip on peer resolution. Add `legacy-peer-deps=true` to a root `.npmrc` to keep installs frictionless.

### 2. Configure env

```bash
cp .env.local.example .env.local
```

Fill in the values from the [environment variables](#environment-variables) table. For production, swap to the prod Supabase project values.

### 3. One-time Supabase setup

Complete the [Supabase configuration](#one-time-supabase-configuration) steps below — the app can't talk to the database until the `app` schema is exposed and redirect URLs are allowed.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>. Unauthenticated traffic redirects to `/login`.

### Scripts

| Script              | Does                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`       | Start the dev server                                                                           |
| `npm run build`     | Production build                                                                               |
| `npm run start`     | Serve the production build                                                                     |
| `npm run lint`      | Lint with Next's ESLint config                                                                 |
| `npm run types:gen` | Regenerate Supabase types into `types/db.ts` (requires the Supabase CLI + a logged-in session) |

---

## Environment variables

| Var                                      | Used by                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`               | Browser + server clients                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`          | Browser + RLS-scoped server reads                 |
| `NEXT_PUBLIC_SUPABASE_DB_SCHEMA`         | Always `app`                                      |
| `SUPABASE_SERVICE_ROLE_KEY`              | Admin (service-role) client — **server only**     |
| `NEXT_PUBLIC_APP_URL`                    | OAuth redirect targets, transactional email links |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Shopify OAuth callback                            |
| `RESEND_API_KEY`                         | Transactional email (invite delivery)             |

> Without `SUPABASE_SERVICE_ROLE_KEY`, every integration callback and all `/admin` routes throw. It must never be exposed to the client — see [Architecture](#the-three-supabase-clients).

---

## One-time Supabase configuration

These are done once in the Supabase dashboard, per project (dev and prod):

1. **Expose the `app` schema to PostgREST.** Settings → API → _Exposed schemas_. Final value: `public, app, storage, graphql_public`.
2. **Allow the dashboard redirect URLs.** Authentication → URL Configuration → _Redirect URLs_:
   - `http://localhost:3000/auth/callback` (dev)
   - `https://app.<apex>/auth/callback` (prod)
3. **Configure the Google OAuth provider.** Authentication → Providers → Google. The redirect URI on Google's side is the Supabase callback URL, not ours.

---

## Architecture

### Server-first App Router

Pages default to Server Components and fetch data directly with the RLS-scoped Supabase client. All mutations are **Server Actions** (`actions.ts` files co-located with their routes). Client Components are reserved for interactivity (the canvas builder, command palette, realtime mounts, forms).

### The three Supabase clients

| Client  | File                     | Scope                           | Use for                                    |
| ------- | ------------------------ | ------------------------------- | ------------------------------------------ |
| Browser | `lib/supabase/client.ts` | RLS, user JWT                   | Client Components                          |
| Server  | `lib/supabase/server.ts` | RLS, user JWT                   | Server Components + actions                |
| Admin   | `lib/supabase/admin.ts`  | **Bypasses RLS** (service role) | Integration callbacks, `/admin`, cron jobs |

The admin client is **server-only**. Importing it from a Client Component throws at runtime, and the `"use server"` directive on every consumer keeps the service-role key out of the client bundle. Never call it from anywhere a user's intent isn't already authenticated at the route boundary — and when you do use it, **always filter by `org_id` explicitly**, because RLS is no longer protecting you.

### Auth + RLS

Middleware (`middleware.ts` → `lib/supabase/middleware.ts`) runs on every request: it refreshes the session and redirects unauthenticated traffic to `/login?next=…`, authenticated traffic away from auth pages, and org-less users to `/onboarding`. Every `app.*` table has RLS enabled, gated by two Postgres helpers:

- `app.is_org_member(org_id) → boolean` — gates reads
- `app.has_org_role(org_id, allowed text[]) → boolean` — gates owner/admin writes

### Data-fetching layer

Slow-changing org data (categories, suppliers, warehouses, …) is fetched through request-cached helpers in `lib/data/`, wrapped in `unstable_cache` with per-`org_id` cache keys and tags. Mutating actions call `revalidateTag(tags.X(orgId))` so the next read is fresh; a 1-hour revalidate is the safety net, not the primary strategy.

### Realtime

Per-page subscriptions live in `components/realtime/PageRealtime.tsx`. Each named subcomponent (`OverviewRealtime`, `OrdersRealtime`, etc.) opens a Supabase channel scoped to the relevant tables and active facility, then calls `router.refresh()` on change — so the page stays a Server Component.

### AI narration

Three copy surfaces route through `lib/ai/narrate.ts`, which invokes the `narrate-event` Supabase edge function (source in the `nimbus-edge-functions` repo): `narrateForecast` (Analytics summary), `narrateAnomaly` (notification title + body), and `narratePoDraft` (per-line PO reasoning). All three return `null` on failure so callers fall back to deterministic copy — the LLM being down never blocks an operation.

---

## Design system

Every token, weight, and spacing rule is defined in `globals.css` and documented canonically in `nimbus-design-system.md` — **the shared source of truth across the marketing site, dashboard, and mobile app.** Keep all surfaces consistent by pulling from it rather than inventing values.

- **Sharp corners** — 0px radius everywhere, except the avatar pill and live/status dots.
- **Hairlines** — 1px borders in `var(--border)`; 1px dividers in `var(--border-subtle)` (~6% white). Cards are defined by their hairline, not a fill.
- **Type** — Satoshi (display) + JetBrains Mono. Mono is used for every label, button, table header, ID, and numeric readout; tabular numerals (`.tnum`) wherever counts appear.
- **Color** — black background, white text, a single gold accent (`#D4A853`) rationed to ≤3 instances per viewport. Reds/ambers are likewise rationed. A cream **light theme** is triggered by `[data-theme="light"]`.
- **Signature affordances** — gold corner-bracket button hover, float-label inputs with a gold caret, self-contained focus rings.

> **Fonts are referenced but not bundled.** Add `Satoshi` and `JetBrains Mono` woff2 files to `public/fonts/` (and the matching `@font-face` rules) before production. System fallbacks render acceptably in dev.

---

## Hardware integrations

Two browser-native surfaces (both desktop-Chromium only — Firefox + Safari lack WebUSB):

- **Barcode scanners** (USB / Bluetooth HID, keyboard-emulating) — `lib/useScanner.ts` debounces keystroke bursts into single scan events; `components/scanner/ScannerProvider.tsx` shares one capture surface across authenticated pages. Test pad under Settings → Devices.
- **Zebra ZPL printers** (USB via WebUSB) — `lib/print/zebra.ts` handles pairing and the ZPL byte stream, used for bay/section labels and PO receipt labels. Templates assume 203 DPI desktop printers (ZD420/ZD620/GK420); 300 DPI industrial units need them rebuilt at 1.5× scale. Set the printer language to `ZPL` (not `EPL`/`Line`). WebUSB permissions are per-origin, per-browser, per-profile.

---

## Kiosk / wallboard mode

Append `?kiosk=1` to any URL to set `data-kiosk="true"` on `<html>`. The matching CSS in `globals.css` hides the side rail, mobile nav, and ornamental layers, then inflates typography ~25% and KPI numerals for across-the-room reading. The Overview page links to it from its corner action.

---

## Project layout

```
app/
├── (auth)/                  # Sign-in surfaces (login, signup, magic-link, forgot, MFA)
│   ├── actions.ts           # Server actions for every auth flow
│   └── layout.tsx           # Centered card chrome
├── (app)/                   # Authenticated surfaces
│   ├── layout.tsx           # Nav + side rail; fetches user + workspace
│   ├── page.tsx             # Overview
│   ├── inventory/           # Catalog, detail, CSV import/export
│   ├── analytics/           # Metrics + dead-stock report
│   ├── cycle-counts/        # Variance + accuracy tracking
│   ├── orders/              # Pick lists, deliveries, pickups
│   ├── purchase-orders/     # Manual + AI-drafted POs
│   ├── returns/             # Disposition routing
│   ├── facilities/[id]/     # Viewer (2D/3D) + builder + sections
│   ├── suppliers/           # Supplier directory + scorecard
│   ├── customers/           # Customer directory
│   ├── scan/                # HID barcode workstation
│   ├── notifications/       # Inbox for alerts, scan summaries, system events
│   ├── integrations/        # Slack, Shopify, Resend, Webhooks (+ stubs)
│   └── settings/            # Account, Security, Members, Devices, Billing, …
├── admin/onboard/           # Staff-only workspace provisioning
├── api/                     # OAuth callbacks, CSV exports, webhook ingest, print proxies
├── onboarding/              # First-run flow for new owners
├── auth/callback/route.ts   # OAuth + magic-link exchange
├── globals.css              # Design tokens + utility classes
└── layout.tsx               # Root shell

components/
├── nav/                     # TopNav, SideRail, CommandPalette, WorkspaceSwitcher
├── ui/                       # Button, Input, KpiCard, PageHeader, Badge, EmptyState, …
├── dashboard/               # ScopeFilter, GlowCardGrid, ForecastNarration
├── realtime/                # PageRealtime — per-page Supabase channel subscriptions
├── integrations/            # ProviderLogo, IntegrationGrid
├── print/                   # Zebra ZPL generation + WebUSB driver
└── effects/                 # AuthAtmosphere (auth pages only)

lib/
├── supabase/                # client / server / admin / middleware
├── ai/narrate.ts            # Edge-function wrapper
├── replenishment.ts         # velocity / ROP / EOQ math
├── integrations/            # Provider clients (shopify, slack, webhooks, resend)
├── data/                    # Request-cached fetchers
└── print/zebra.ts           # ZPL transport over WebUSB

types/db.ts                  # Hand-written DB types (regeneratable)
middleware.ts                # Wires the Supabase middleware into Next.js
```

---

## Common tasks

### Add a new authenticated page

1. Create `app/(app)/<route>/page.tsx` as a Server Component (no `"use client"`).
2. Fetch via `createClient()` from `@/lib/supabase/server` — `.from("products")` hits `app.products`, RLS-scoped to the user's org.
3. Compose with `PageHeader`, `KpiCard`, and the other UI primitives. Layout convention: header → KPI strip → primary content → secondary sections, separated by hairlines with ~56px vertical breathing room.
4. Register the route in `lib/navData.ts` (it powers `SideRail`, `MobileNav`, and the command palette).
5. Need live updates? Mount the relevant `*Realtime` component near the top.

### Add a new integration

Copy the Slack provider as the reference implementation: add the client under `lib/integrations/`, the metadata in `app/(app)/integrations/providers.ts`, the OAuth/webhook route handlers under `app/api/`, and the logo slug in `components/integrations/ProviderLogo.tsx`.

### Regenerate DB types after a schema change

```bash
npm run types:gen
```

Requires the Supabase CLI and a logged-in session; output replaces `types/db.ts`. (The committed file is hand-written so fresh clones compile without the CLI.)

---

## Deploying

A second Netlify site sharing the build profile with the marketing repo.

- **Build command:** `npm run build`
- **Publish directory:** `.next`
- **Plugin:** `@netlify/plugin-nextjs`
- **Env:** copy from `.env.local.example`, swap to production Supabase values, and don't forget `SUPABASE_SERVICE_ROLE_KEY`.
- Re-run the two [one-time Supabase steps](#one-time-supabase-configuration) (expose `app` schema, allow `https://app.<apex>/auth/callback`) against the prod project.

---

## Status snapshot

**Live:** Operate (Overview, Inventory, Analytics, Cycle counts, Scan), Flow (Orders, POs incl. AI drafting, Returns), Directory (Suppliers, Customers), Facilities (2D + 3D viewer, full builder, slot management), Settings (TOTP MFA, Members + bulk invite, Devices, Billing, API keys, Audit, Webhooks), Integrations (Slack, Shopify, Resend, custom webhooks), Admin onboarding.

**Stubbed / partial:**

- **Integrations** — Square, WooCommerce, QuickBooks, Xero, Stripe, ShipStation, FedEx, Gmail, Zapier, HubSpot are "Not yet available" stubs.
- **Shopify v2** — inventory write-back, fulfillment + tracking, multi-location routing, unknown-SKU mapping, reconciliation pull.
- **3D builder** — only the viewer has a 2D/3D toggle; editing is 2D-only.
- **Tests** — Vitest unit suite over critical pure logic (`npm test`); no E2E suite yet.

---

## Engineering notes

- Stay server-first: default to Server Components, mutate via Server Actions.
- Pull every color, font, and spacing value from the design tokens — never hard-code hex or introduce a new font/radius. Consistency across the suite is a hard requirement; the canonical reference is `nimbus-design-system.md`.
- Respect the client boundary: never import `lib/supabase/admin.ts` outside server code, and always filter admin-client queries by `org_id`.
- See [`.github/copilot-instructions.md`](.github/copilot-instructions.md) for the full convention set (it also steers AI pair-programming).

### Known sharp edges worth knowing before you touch them

- **Admin client = no RLS.** The `lib/data/` cached fetchers use the service-role client, so an `org_id` filter is the _only_ thing isolating workspaces. Drop it and you leak cross-org data.
- **Workspace context is cookie-driven.** `getCurrentOrgContext` resolves the active workspace from a cookie validated against the user's real memberships (`lib/data/user.ts`); creating additional workspaces goes through the transactional `app.provision_workspace` RPC.
- **No E2E suite.** `npm test` covers the pure logic (SSRF guard, redirect safety, RBAC math, allocation, forecasting, replenishment); anything touching the DB or browser still needs manual verification against the dev server.
