# `app.nimbus` — Customer dashboard

The customer-facing web dashboard for Nimbus. Operators and admins use it to
manage inventory, run cycle counts, work orders + POs + returns, configure
facilities, and connect integrations. Mobile pickers stay on the React Native
app; this surface is for the desk.

Marketing site lives at the apex domain (`nimbuswms.com` /
`nimbusinventory.com`). This is `app.<apex>`.

---

## Stack

- **Framework** — Next.js 15 (App Router, React 19, TypeScript)
- **Auth + DB** — Supabase (`@supabase/ssr`)
- **Styling** — Tailwind CSS with Nimbus design tokens (CSS custom properties)
- **3D viewer** — `three` + `@react-three/fiber` + `@react-three/drei` (lazy-loaded)
- **Icons** — Lucide
- **Hosting** — Netlify (second site sharing env scope conventions with the
  marketing repo per the architecture doc)

All data lives in the `app` schema of the Supabase project (project ref
`seypbrzjjiuibrwyxewj`). The dashboard never touches the `public` schema.

---

## Setup

### 1. Install

```bash
npm install
```

> **Note on peer deps.** The 3D viewer pulls in `@react-three/fiber`, which
> declares an optional React Native peer. If Expo is present elsewhere in your
> tree (it can land via a workspace sibling), npm will trip on peer resolution.
> Add `legacy-peer-deps=true` to a root `.npmrc` to keep installs frictionless.

### 2. Configure env

```bash
cp .env.local.example .env.local
```

The example has the project URL + publishable key for the `nimbus-wms`
Supabase project. For production, swap to the prod project values.

Required env vars:

| Var                                      | Where it's used                                   |
| ---------------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`               | Browser + server clients                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`          | Browser + RLS-scoped server reads                 |
| `NEXT_PUBLIC_SUPABASE_DB_SCHEMA`         | Always `app`                                      |
| `SUPABASE_SERVICE_ROLE_KEY`              | Admin client (server only — see RLS section)      |
| `NEXT_PUBLIC_APP_URL`                    | OAuth redirect targets, transactional email links |
| `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` | Shopify OAuth callback only                       |
| `RESEND_API_KEY`                         | Transactional email (invite delivery)             |

### 3. One-time Supabase configuration

These must be done in the Supabase dashboard before the app can talk to the
database:

1. **Expose the `app` schema to PostgREST.**
   Settings → API → "Exposed schemas". Add `app`. Final value should be
   `public, app, storage, graphql_public`.

2. **Add the dashboard origin to allowed redirect URLs.**
   Authentication → URL Configuration → Redirect URLs. Add:

   - `http://localhost:3000/auth/callback` (dev)
   - `https://app.<apex>/auth/callback` (prod)

3. **Configure the Google OAuth provider.**
   Authentication → Providers → Google. Paste the Google Cloud OAuth client ID
   and secret. (Use the existing marketing-site Google OAuth client if there is
   one — the redirect URI on Google's side is the Supabase callback URL, not
   ours.)

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>. Unauthenticated traffic redirects to `/login`.

---

## Project layout

```
app/
├── (auth)/                       # Sign-in surfaces (login, signup, magic-link, forgot, MFA)
│   ├── actions.ts                # Server actions for every auth flow
│   └── layout.tsx                # Centered card chrome
├── (app)/                        # Authenticated surfaces
│   ├── layout.tsx                # Top nav + side rail, fetches user + workspace
│   ├── page.tsx                  # Overview (KPIs, recent scans, low-stock signals)
│   │
│   ├── inventory/                # Product catalog, detail, CSV import/export
│   ├── analytics/                # Headline metrics + dead-stock report
│   ├── cycle-counts/             # Variance recording + accuracy tracking
│   │
│   ├── orders/                   # Pick lists, deliveries, customer pickups
│   ├── purchase-orders/          # Inbound from suppliers + AI-drafted POs
│   ├── returns/                  # Disposition routing (restock/damaged/RMA)
│   │
│   ├── facilities/               # Warehouses, sections, layout builder + 2D/3D viewer
│   │   └── [id]/
│   │       ├── page.tsx          # Read-only viewer (2D SVG + 3D r3f scene)
│   │       ├── builder/          # Layout editor with snap-to-grid, snapshots, AI blueprint scan
│   │       └── sections/[sectionId]/  # Bay × level slot grid with inventory placement
│   │
│   ├── suppliers/                # Supplier directory + scorecard (canonical home)
│   ├── customers/                # Customer directory
│   ├── scan/                     # USB/Bluetooth HID barcode workstation
│   ├── notifications/            # Inbox for stock alerts, scan summaries, system events
│   │
│   ├── integrations/             # Shopify, Slack, Resend, Webhooks (built); 9 more stubbed
│   └── settings/                 # Account, Security (TOTP), Members, Devices, Billing,
│                                 # API keys, Audit log, Webhooks
│
├── admin/                        # Internal staff dashboard (gated by profiles.is_staff)
│   └── onboard/                  # Provision new customer workspaces
│
├── api/                          # Route handlers: OAuth callbacks, CSV exports,
│                                 # webhook ingest, label print proxies
├── onboarding/                   # First-run flow for new owners
├── auth/callback/route.ts        # OAuth + magic-link exchange handler
├── globals.css                   # All Nimbus design tokens + utility classes
└── layout.tsx                    # Root shell

components/
├── nav/                          # TopNav, SideRail, CommandPalette, WorkspaceSwitcher
├── ui/                           # Button, Input, KpiCard, PageHeader, Badge, EmptyState, …
├── dashboard/                    # ScopeFilter, GlowCardGrid, ForecastNarration
├── realtime/                     # PageRealtime — per-page Supabase channel subscriptions
├── integrations/                 # ProviderLogo, IntegrationGrid
├── print/                        # Zebra ZPL label generation + WebUSB driver
└── effects/                      # AuthAtmosphere particle ring (auth pages only)

lib/
├── supabase/
│   ├── client.ts                 # Browser client (Client Components)
│   ├── server.ts                 # RLS-scoped server client
│   ├── admin.ts                  # Service-role client (server only)
│   └── middleware.ts             # Session refresh + auth gate
├── ai/narrate.ts                 # Edge-function wrapper for AI-narrated forecasts + PO reasoning
├── integrations/                 # Provider clients (shopify, slack, webhooks, resend)
├── data/                         # Request-cached fetchers (user, org, suppliers, …)
└── print/zebra.ts                # ZPL transport over WebUSB

types/db.ts                       # Hand-written DB types (regeneratable from Supabase)
middleware.ts                     # Wires lib/supabase/middleware.ts into Next.js
```

---

## Design system

Every visible token, weight, and spacing rule comes from
`nimbus-design-system.md` (the canonical document). Specifically:

- **Sharp corners** — every component is 0px radius except the avatar pill and
  the live/online status dots.
- **Hairlines** — borders are 1px in `var(--border)`; dividers are 1px in
  `var(--border-subtle)` (≈6% white).
- **Type** — Satoshi (display) + JetBrains Mono. JetBrains Mono is used for
  every label, button text, table header, ID, and numeric readout. Tabular
  numerals (`.tnum`) are applied everywhere stock counts appear.
- **Color** — black background, white text, a single gold accent (`#D4A853`)
  rationed to ≤3 instances per viewport. Reds and ambers are likewise rationed.
- **Signature affordances** — the gold corner-bracket button hover is on every
  `Button`. Float-label inputs with the gold caret are the universal field
  shell. Inputs and buttons set their own focus rings.

Custom fonts are referenced in `globals.css` but **not bundled** — add
`Satoshi` and `JetBrains Mono` woff2 files to `public/fonts/` and the
matching `@font-face` declarations to `globals.css` before going to production.
Until then, the system stack fallbacks render acceptably for development.

### Adding a new page

1. Create the route file under `app/(app)/<route>/page.tsx`.
2. Mark it as a Server Component (the default — no `"use client"`).
3. Pull data via `createClient()` from `@/lib/supabase/server`. Because the
   client is scoped to the `app` schema, `.from("products")` hits
   `app.products`. RLS scopes results to the user's org_id automatically.
4. Compose the page with `PageHeader`, `KpiCard`, and the other UI primitives.
   Follow the layout convention: header → KPI strip → primary content →
   secondary sections separated by hairlines with 56px vertical breathing room.
5. Add the route to `lib/navData.ts` (it powers `SideRail`, `MobileNav`, and
   the command palette).

---

## Auth flows

The middleware (`middleware.ts` → `lib/supabase/middleware.ts`) runs on every
request, refreshes the session if needed, and redirects:

- Unauthenticated traffic to `/(app)/*` → `/login?next=<path>`
- Authenticated traffic to `/(auth)/*` → `/`
- Authenticated users without an org → `/onboarding`

All sign-in/up actions live in `app/(auth)/actions.ts` as **Server Actions**.
The OAuth and magic-link callbacks land on `/auth/callback`, which exchanges
the code for a session cookie and redirects to `next` (or `/`).

TOTP-based MFA is wired via Supabase's `auth.mfa` API at
`/settings/security`. Sign-out is also a server action; the settings page has
a button wired to it.

---

## RLS

Every `app.*` table has RLS enabled. Policies use two helper functions:

- `app.is_org_member(org_id uuid) → boolean` — gates reads
- `app.has_org_role(org_id uuid, allowed text[]) → boolean` — gates
  privileged writes (owner/admin only)

User-facing queries use the RLS-scoped client (`lib/supabase/server.ts`,
`lib/supabase/client.ts`) — these run against the user's JWT and are subject
to RLS.

A service-role client also exists (`lib/supabase/admin.ts`) for the narrow
set of operations that legitimately need to bypass RLS:

- **Integration callbacks** (Shopify OAuth, Slack webhook delivery, custom
  webhook fan-out) — the third party doesn't have a user session.
- **Staff admin actions** at `/admin/*` — onboarding new customer workspaces
  requires cross-org access.
- **Cron-triggered routes** (inventory snapshots, scheduled emails) — run
  without a user context.

The service-role key is **server-only**. Importing `lib/supabase/admin.ts`
from a client component will throw at runtime, and the `"use server"`
directive on every consumer prevents accidental bundling into the client
build. Never call the admin client from anywhere a user's intent isn't
already authenticated at the route boundary.

---

## Realtime

Page-specific realtime subscriptions live in
`components/realtime/PageRealtime.tsx`. Each named subcomponent
(`OverviewRealtime`, `OrdersRealtime`, `PurchaseOrdersRealtime`,
`InventoryRealtime`, `CycleCountsRealtime`, `NotificationsRealtime`,
`OrderDetailRealtime`) opens a Supabase channel scoped to the relevant
tables + (where applicable) the active facility, and triggers
`router.refresh()` on relevant events.

To add realtime to a new page: import the appropriate `*Realtime` component
or add a new one to `PageRealtime.tsx`, mount it near the top of the page,
and you're done — the rest of the page stays as a Server Component.

---

## AI narration

Three AI-generated copy surfaces are wired through `lib/ai/narrate.ts`,
which calls an `narrate-event` Supabase edge function:

- **`narrateForecast`** — 2-3 sentence operational summary on the Analytics
  page.
- **`narrateAnomaly`** — title + body for notification entries.
- **`narratePoDraft`** — per-line reasoning on AI-drafted purchase orders
  (rendered as the "Why" sub-row in the PO detail page).

All three return `null` on edge-function failure so callers fall back to
deterministic copy. The edge function is deployed separately from the
dashboard — its source lives in the `nimbus-edge-functions` repo.

---

## Hardware integrations

Two browser-native hardware surfaces:

- **Barcode scanners** (USB or Bluetooth HID, keyboard-emulating) —
  `lib/useScanner.ts` debounces keystroke bursts into single scan events;
  `components/scanner/ScannerProvider.tsx` lifts that into a context so
  every authenticated page shares one capture surface. Settings → Devices
  has a test pad.

- **Zebra ZPL printers** (USB only, WebUSB) — `lib/print/zebra.ts` handles
  pairing + ZPL byte stream. Used for bay/section labels (bulk + per-slot)
  and PO receipt labels. Bluetooth/network printers are out of scope for
  v1 — Chrome/Edge/Opera only since Firefox + Safari lack WebUSB.

---

## Kiosk / wallboard mode

Adding `?kiosk=1` to any URL sets `data-kiosk="true"` on `<html>`. The
matching CSS rules in `globals.css` hide the side rail, mobile nav, and
ornamental layers, then inflate typography ~25% for distance reading. The
Overview page links to this mode from its corner action.

---

## Type regeneration

Whenever the schema changes:

```bash
npm run types:gen
```

This requires the Supabase CLI and a logged-in session. Output replaces
`types/db.ts`. (The current `types/db.ts` is hand-written so the project
compiles without running the CLI on a fresh clone.)

---

## Status snapshot

What's live today:

- **Operate** — Overview, Inventory (+ detail, CSV import/export), Analytics
  (+ dead-stock report), Cycle counts, Scan workstation
- **Flow** — Orders (full status state machine), Purchase Orders (manual +
  AI-drafted from low-stock with velocity/ROP/EOQ math), Returns
- **Directory** — Suppliers (with scorecard), Customers
- **Facilities** — list, 2D top-down viewer, 3D orbital viewer (β), full
  builder with snap-to-grid, smart guides, undo/redo, snapshots, AI
  blueprint scan, bay × level slot management
- **Settings** — Account, Security (TOTP MFA), Members (with CSV bulk
  invite + Resend-delivered transactional email), Devices, Billing
  (Stripe-aware), API keys, Audit log, Webhooks (HMAC-signed custom
  endpoints with delivery log)
- **Integrations** — Slack (full), Shopify (full OAuth + webhook
  ingestion), Resend (transactional email), custom webhook endpoints
- **Admin** — Staff-only onboarding flow at `/admin/onboard`

What's stubbed or partial:

- **Workspace switching** — switcher renders, but `getCurrentOrgContext`
  always returns `memberships[0]`. Until the workspace-cookie wiring lands,
  multi-org users effectively see only their first org. (`lib/data/user.ts`
  has the TODO.)
- **Create workspace** button in the switcher is disabled — wiring to the
  existing onboarding flow is pending.
- **Integrations not built yet** (stub pages with "Not yet available"):
  Square, WooCommerce, QuickBooks Online, Xero, Stripe, ShipStation, FedEx,
  Gmail, Zapier, HubSpot. Slack is the reference implementation for any new
  provider.
- **Shopify v2 items** (called out on the integration page): inventory
  write-back, fulfillment marking with tracking, multi-location routing,
  unknown-SKU mapping, periodic reconciliation pull.
- **3D builder mode** — only the viewer has a 2D/3D toggle. Editing is 2D
  only.
- **Custom font bundling** — Satoshi + JetBrains Mono woff2 files aren't in
  `public/fonts/`; prod renders with system fallbacks.
- **E2E tests** — none. Manual testing via the dev server only.

What's been removed:

- `components/ui/ComingSoon.tsx` — no longer imported anywhere. Safe to
  delete on next cleanup pass.

---

## Deploying

Per the architecture doc this is a second Netlify site sharing the build
profile with the marketing repo.

- Build command: `npm run build`
- Publish directory: `.next`
- Plugin: `@netlify/plugin-nextjs`
- Env vars: copy from `.env.local.example`, swap to production Supabase values.
  Don't forget `SUPABASE_SERVICE_ROLE_KEY` — without it, every integration
  callback and the `/admin` routes will throw.

Production Supabase configuration still requires the two manual steps under
"One-time Supabase configuration" above — expose `app` schema, allow the
`https://app.<apex>/auth/callback` redirect URL.
