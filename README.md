# `app.nimbus` — Customer dashboard

The customer-facing web dashboard for Nimbus. Operators and admins manage
inventory, view analytics, and (in upcoming releases) manage orders, POs, and
integrations here. Mobile operators stay on the React Native app; this surface
is for the desk.

Marketing site lives at the apex domain (`nimbuswms.com` / `nimbusinventory.com`).
This is `app.<apex>`.

---

## Stack

- **Framework** — Next.js 15 (App Router, React 19, TypeScript)
- **Auth + DB** — Supabase (`@supabase/ssr`)
- **Styling** — Tailwind CSS with Nimbus design tokens (CSS custom properties)
- **Icons** — Lucide
- **Hosting** — Netlify (configure as a second site sharing env scope conventions
  with the marketing repo per the architecture doc)

All data lives in the `app` schema of the Supabase project (project ref
`seypbrzjjiuibrwyxewj`). The dashboard never touches the `public` schema.

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure env

```bash
cp .env.local.example .env.local
```

The example file already has the project URL and publishable key for the
`nimbus-wms` Supabase project. For production, swap these for the production
project values.

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
├── (auth)/                  # Sign-in surfaces (login, signup, magic-link, forgot)
│   ├── actions.ts           # Server actions for every auth flow
│   └── layout.tsx           # Centered card chrome, lighter visual treatment
├── (app)/                   # Authenticated surfaces
│   ├── layout.tsx           # Top nav + side rail, fetches user + workspace
│   ├── page.tsx             # Overview (KPIs, recent scans, quick links)
│   ├── inventory/
│   │   ├── page.tsx         # Product list with search + category filter
│   │   └── [id]/page.tsx    # Product detail (spec, locations, scan history)
│   ├── analytics/page.tsx   # Headline metrics + breakdowns
│   ├── orders/page.tsx      # Coming soon
│   ├── purchase-orders/page.tsx  # Coming soon
│   ├── integrations/page.tsx     # Coming soon
│   └── settings/page.tsx    # Account + workspaces + sign out
├── auth/callback/route.ts   # OAuth + magic-link exchange handler
├── globals.css              # All Nimbus design tokens + utility classes
├── layout.tsx               # Root shell
└── not-found.tsx            # 404

components/
├── nav/{TopNav,SideRail}.tsx
├── ui/{Button,Input,KpiCard,PageHeader,StatusDot,Badge,EmptyState,ComingSoon}.tsx
└── inventory/InventoryTable.tsx

lib/supabase/
├── client.ts      # Browser client (Client Components)
├── server.ts      # Server Components / Route Handlers
└── middleware.ts  # Session refresh + auth gate

types/db.ts        # Database types (hand-written, regeneratable)
middleware.ts      # Wires lib/supabase/middleware.ts into Next.js
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
   Follow the §8.2 layout: header → KPI strip → primary content → secondary
   sections separated by hairlines with 56px vertical breathing room.
5. Add the route to `components/nav/SideRail.tsx`.

---

## Auth flows

The middleware (`middleware.ts` → `lib/supabase/middleware.ts`) runs on every
request, refreshes the session if needed, and redirects:

- Unauthenticated traffic to `/(app)/*` → `/login?next=<path>`
- Authenticated traffic to `/(auth)/*` → `/`

All sign-in/up actions live in `app/(auth)/actions.ts` as **Server Actions**.
The OAuth and magic-link callbacks land on `/auth/callback`, which exchanges
the code for a session cookie and redirects to `next` (or `/`).

Sign-out is also a server action; the `Settings` page has a button wired to it.

---

## RLS

Every `app.*` table has RLS enabled. Policies use two helper functions:

- `app.is_org_member(org_id uuid) → boolean` — gates reads
- `app.has_org_role(org_id uuid, allowed text[]) → boolean` — gates
  privileged writes (owner/admin only)

The dashboard never bypasses RLS — every query uses the user's JWT. There is
no service-role key in the dashboard's runtime environment, and there should
never be one. Operations that require elevated access (Stripe webhook
processors, the queue worker on Fly) live outside this codebase.

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

## What's not in v1

Per the agreed scope:

- Orders, Purchase Orders, Integrations, full Settings — stubbed with
  "Coming soon" empty states using `ComingSoon`. The database tables exist;
  the UI doesn't.
- Realtime subscriptions — wired structurally (the supabase-js client supports
  it out of the box) but no live channels are subscribed to from any page.
  Adding one is a `useEffect` + `supabase.channel(...).subscribe()` on
  the Overview or Analytics page.
- Kiosk / wallboard mode (`?kiosk=1` from §8.3) — deferred.
- AI-narrated forecasts, drafted POs, and anomaly alert text — deferred.
- White-label tier (Enterprise only).
- E2E tests — none. Manual testing via the dev server only.

---

## Deploying

Per the architecture doc this is a second Netlify site sharing the build
profile with the marketing repo.

- Build command: `npm run build`
- Publish directory: `.next`
- Plugin: `@netlify/plugin-nextjs`
- Env vars: copy from `.env.local.example`, swap to production Supabase values.

Production Supabase configuration still requires the two manual steps under
"One-time Supabase configuration" above — expose `app` schema, allow the
`https://app.<apex>/auth/callback` redirect URL.
