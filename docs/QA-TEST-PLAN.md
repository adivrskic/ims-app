# Nautilus — QA & UAT Test Plan

**Scope:** dashboard web app (`app.nautilusinventory.com`) — **every route** · marketing site (`nautilusinventory.com`) · mobile picker app (Expo/React Native)
**Goal:** a brand-new person can sign up from zero and run a full warehouse day without hitting a broken screen, a wrong number, or a dead end — before any customer sees it.

> **Status of this document:** regenerated from the code on **2026-09-11**. Every route, permission, field, message and business rule below was read out of the repo, not assumed. Where something is unverified or environment-dependent it says so explicitly.
>
> ### 2026-09-12 — every open defect fixed
>
> The register has **no open items left**. §22.1 lists the 51 fixed in this pass and §22.3 the
> last three, closed on the same day — including the one in the mobile repository. Every case
> they map to now describes the **corrected** behaviour and is marked *(regression)*, so a
> tester confirms the fix rather than reproducing the bug. Three reported "bugs" were disproved
> by reading the live database and are recorded in §22.4 so nobody re-files them.
>
> **Two migrations ship with this change** and are already applied to the live project:
> `20260912120000_analytics_page_aggregate_rpcs.sql` (without it `/analytics` and
> `/analytics/dead-stock` error) and `20260912140000_asn_receive_atomic.sql`.
>
> ### What changed in the previous revision
> - **Restructured to be route-complete.** The old phase-based layout covered maybe half the app. §3 is now a coverage index listing **all 79 pages and 22 route handlers**, each mapped to the section that tests it. Nothing is unlisted.
> - **Two previously-documented bugs are fixed** and are now regression cases, not expected failures: Inventory **Export CSV** (was a 404) and **Forecast → Apply RBAC** (was ungated; now gated on `inventory.manage`).
> - **New surfaces to test:** the 4-step onboarding wizard now also serves `/workspaces/new`; the spreadsheet import engine (products **+ suppliers + customers**, file *or* paste, check-then-import); "Explore with sample data"; three-field quick-add on Register product.
> - **Finding C is narrowed:** orders still don't link customers *when created by hand*, but sample-data orders do set `customer_id`, so the Customer → Orders panel is no longer *always* empty.
> - **~40 new defect candidates** surfaced by this pass are in §22, each with its file reference. They are written as test cases so a tester confirms rather than rediscovers.

---

## 0. How to use this document

### Roles for the test pass
| Role | Who | Covers |
|---|---|---|
| **Tester A — "New customer"** | Anyone, ideally the least familiar with the product | §18 (marketing), §4 (auth & onboarding), §6 (first impression). Must **not** be coached — we're testing discoverability. |
| **Tester B — "Warehouse operator"** | Someone who understands the domain | §7–§13 (inventory, facilities, floor ops, directory, purchasing, outbound) |
| **Tester C — "Admin/IT"** | Technical | §14–§17 (analytics, integrations, API, crons, settings, admin, security) |
| **Tester D — "Floor / mobile"** | Anyone with a physical phone | §19 (mobile) + every case marked **[MOBILE]** |

> **§13 depends on Tester D.** The desk app cannot execute picks (§2, finding A) — B and D must run outbound together, or B stops at `in_progress`.

### Result codes
- **P** — Pass, works as expected
- **F** — Fail, broken (file a bug)
- **B** — Blocked, couldn't run it (say why)
- **N/A** — Not applicable in this environment
- **?** — Works but feels wrong / confusing (these matter as much as failures before a customer demo)

### Severity
| Sev | Meaning | Ship rule |
|---|---|---|
| **S1** | Data loss/corruption, wrong stock numbers, security or cross-tenant leak, total blocker | **Must fix before any customer sees it** |
| **S2** | Core flow broken or unusable workaround required | Must fix before demo |
| **S3** | Wrong/missing behaviour, but a workaround exists | Fix if time |
| **S4** | Cosmetic, copy, polish | Backlog |

### Bug report format
```
[SEV] Short title
Case ID:      e.g. 7.3.2
Environment:  prod / staging / local · browser+version · desktop/mobile
Account:      email + role + workspace name
Steps:        1. … 2. … 3. …
Expected:     …
Actual:       …
Evidence:     screenshot / recording / console error / network response
Blast radius: does this affect stock accuracy or money? yes/no
```

### Two recurring patterns worth knowing before you start

**1. Silent permission failures.** Server actions wired as `action={fn}` return `void`. When the permission check fails they simply return — the page re-renders unchanged with **no error message**, which is indistinguishable from success. Actions wired through `useActionState` *do* render a message. Every "as a member, expect nothing to happen" case below is testing this. Collect them into one UX bug rather than 30 (see §17.1.12).

**2. Gate divergence.** Many pages render admin controls to everyone and only check the permission inside the action. `/settings/api-keys`, `/settings/audit`, `/settings/billing`, `/suppliers/new`, `/customers/new` and the facility builder all do this. A member sees a full form and learns it's forbidden only on submit (or never).

---

## 1. Environments & pre-flight

### 1.1 What you're testing against
| Surface | URL | Notes |
|---|---|---|
| Marketing site | https://nautilusinventory.com | Live |
| Dashboard app | https://app.nautilusinventory.com | Live |
| Mobile app | Expo — see §19 | Needs a build; not in an app store |

**Decide before you start:** **production** or a **local/staging** clone? Production is the honest test (real CSP, real CDN, real cold starts) — but *every order, product and count you create is real data in the real database.* Use an obviously-named throwaway workspace (e.g. `QA-2026-09-11-A`) and see §20 for cleanup.

### 1.2 Running it locally
```bash
npm install
cp .env.local.example .env.local   # then fill in values
npm run dev                        # http://localhost:3000
```
Unauthenticated traffic redirects to `/login`.

**Known install gotcha:** the 3D viewer pulls `@react-three/fiber`, which declares an optional React Native peer. If Expo exists elsewhere in your tree, npm can trip on peer resolution — add `legacy-peer-deps=true` to a root `.npmrc`.

⚠️ **Never run `npm run build` while `npm run dev` is running** — it clobbers `.next` and every route starts 500-ing until you delete `.next` and restart.

### 1.3 One-time Supabase config (must already be done, else everything fails)
1. `app` schema exposed to PostgREST — Settings → API → Exposed schemas = `public, app, storage, graphql_public`
2. Redirect URLs allowed — Authentication → URL Configuration: `http://localhost:3000/auth/callback` (dev), `https://app.nautilusinventory.com/auth/callback` (prod)
3. Google OAuth provider configured (redirect URI is Supabase's callback, not ours)

### 1.4 Environment variables — and what breaks without each
| Var | Needed for | If missing |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | Everything | App is dead |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin onboarding, crons, all cached data fetchers | Most pages fail |
| `NEXT_PUBLIC_SUPABASE_DB_SCHEMA` | `app` schema targeting | Queries hit the wrong schema |
| `RESEND_API_KEY` + `SYSTEM_EMAIL_FROM` | Invites, digests, alerts | **No email sends — invite flow partly untestable** |
| `ANTHROPIC_API_KEY` | AI narration (PO reasoning, stockout copy) | AI surfaces fall back to plain text |
| `CRON_SECRET` | All 6 cron endpoints | Crons reject as unauthorised (**fail-closed** — unset means every call 401s) |
| `INTEGRATION_ENCRYPTION_KEY` | Integration token storage | Integrations fail |
| `SHOPIFY_API_KEY` / `SECRET` | Shopify connect | Shopify untestable |
| `STRIPE_SECRET_KEY` / `WEBHOOK_SECRET` / 4× `PRICE_*` | Billing | Billing untestable |
| `NEXT_PUBLIC_APP_URL` | Links in emails, Stripe return URLs | Silently falls back to `http://localhost:3000` with only a `console.error`. **Every invite link in every environment will be wrong.** |

### 1.5 Pre-flight gate (one person, 10 minutes, before the team starts)
| # | Check | Expected | Result |
|---|---|---|---|
| 1.5.1 | `npm test` | **238 tests pass, 19 files** (verified 2026-09-11) | ☐ |
| 1.5.2 | `npm run build` (dev server stopped) | Compiles, exit 0, **103 routes** (3 prerendered static, 100 dynamic) | ☐ |
| 1.5.3 | `npx tsc --noEmit` | Exit 0 | ☐ |
| 1.5.4 | Load both live URLs | Both 200 | ☐ |
| 1.5.5 | `RESEND_API_KEY` set? | Invite emails will send | ☐ |
| 1.5.6 | Stripe keys + price IDs set? | Billing testable | ☐ |
| 1.5.7 | `CRON_SECRET` set? | Cron endpoints testable | ☐ |
| 1.5.8 | `NEXT_PUBLIC_APP_URL` set and correct? | Invite links point at the right host | ☐ |
| 1.5.9 | Pick + record the test workspace naming convention | e.g. `QA-<date>-<tester>` | ☐ |

### 1.6 Getting data into a workspace — three options

| Option | Command / action | Use for |
|---|---|---|
| **Build by hand** | Click through §7–§13 | Testing the new-customer experience itself (Testers A and B). This *is* the test. |
| **Sample data** (in-app) | Overview → getting-started card → **Explore with sample data** | Instant, industry-matched, ~10 products with stock, 3 suppliers, 4 customers, a PO in transit, 2 open orders, 14 days of scans. One click clears it. Good for demoing and for §14 smoke checks. |
| **Seed script** (90 days of history) | `node scripts/seed-demo.mjs --org <slug\|uuid>` | The history-dependent reports (forecast, valuation, dead stock, turnover) cannot be judged without it. Also `--wipe`, `--wipe-only`. |

Seed script details: a facility with a dock door and 4 zoned sections, 27 products with unit costs / reorder points / lead times, ~150 stock placements, lots (expiring in 9 and 25 days, plus one expired), **90 days of scan history with weekday seasonality**, 3 POs (draft / sent / partially received), 5 orders including one that deliberately backorders, 4 products below reorder point, 3 dead-stock products, and a kit with a 3-part BOM.
- Uses the service-role key — **it bypasses RLS.** Only point it at a workspace you mean to modify.
- Every seeded row is tagged; `--wipe` removes **only** tagged rows.
- After seeding, **switch the facility scope** to the seeded facility — `/picking` will not build waves under "All facilities".
- Dashboard sparklines stay flat until the nightly `kpi-snapshots` job has run **twice**; expected, not a bug.

> **Sample data vs seed script:** sample data is a *product feature* under test (§6.4) and only covers 14 days. The seed script is a *test fixture* and covers 90. Use both, in different workspaces.

### 1.7 Browser / device matrix
Run the full pass on **Chrome desktop**. Then repeat the §21 smoke test on each of:

| Target | Priority | Notes |
|---|---|---|
| Chrome desktop (latest) | **Required** | Primary target |
| Safari desktop | **Required** | No WebUSB — printer surfaces must degrade gracefully, not crash |
| Firefox desktop | Required | Same WebUSB caveat |
| Edge desktop | Nice | Chromium, low risk |
| iOS Safari (phone) | **Required** | Marketing site + app responsive |
| Android Chrome (phone) | **Required** | Marketing site + app responsive |
| iPad / tablet | Nice | Layout mid-breakpoint |

> **Hardware:** barcode scanners are USB/Bluetooth **HID keyboard-emulating** — a plain keyboard simulates them, so scan flows are testable without hardware (the global listener only accepts Enter-terminated fast bursts, so human typing into the page is correctly ignored). **Zebra ZPL label printing uses WebUSB → desktop Chromium only.** Templates assume **203 DPI** and the printer must be in **ZPL** mode. WebUSB permission is per-origin, per-browser, per-profile.

---

## 2. Structural findings — read before scheduling anyone

Verified against the code on 2026-09-11. These **change what is testable**.

| # | Finding | Evidence | Impact |
|---|---|---|---|
| **A** | **The desk app cannot pick.** `quantity_picked` is written only by the `app.pick_order_item` RPC, which has **zero callers** in this repo (one comment references it). The callers are in the mobile app. | grep `pick_order_item` across `app/ lib/ components/` | Orders **cannot leave `in_progress`**, waves **cannot complete**, and Returns are unreachable from the desk (the create-return panel only renders when `picked > 0`). **§13 must run with mobile, or with `quantity_picked` seeded via SQL.** |
| **B** | **Receiving mostly does not create stock — with one exception.** A plain PO/ASN receipt only increments `quantity_received`. **But** receiving with **"QC hold"** *does* land real stock immediately, as a quarantined pseudo-slot (no section, bay 1 / level 1). | `purchase-orders/actions.ts` — the `qcHold` branch inserts into `locations` with `quarantined: true` | A tester who receives a PO then checks Inventory sees **0 on hand** and files a false bug. Scripted explicitly at §12.3.6. Both behaviours are intended. |
| **C** | **Hand-created orders are never linked to customers** — the order form takes a free-text name and nothing writes `orders.customer_id`. **Sample-data orders do set it.** | only `lib/sampleData/actions.ts` writes `customer_id` | Customer detail's Orders panel is empty for every order you create by hand, populated for sample ones. Don't file it repeatedly; do check the sample path works (§11.4.4). |
| **D** | **The base schema is not in this repo.** 49 incremental migrations; **zero** `create table` for `orgs`, `org_members`, `profiles`, `products`, `warehouses`, `org_subscriptions`, `audit_log`, `api_keys`, `integrations`, `notifications`. | verified: 0 migrations create any of them | **You cannot build a clean QA environment from the repo — `supabase db reset` yields a broken DB. Clone the live project.** Also: **RLS on account tables is unverifiable from source, so multi-tenant isolation must be proven empirically (§17.2).** |
| **E** | **The audit log is written by nothing, but is NOT empty.** `app.audit_log` holds ~30 historical rows and **zero functions** reference it. The only code reference is the read at `settings/audit/page.tsx`. | live DB: 30 rows, newest 2026-05-13, 0 writing functions | `/settings/audit` shows real-looking but months-stale data, so a tester may conclude the feature works. **Any expectation of *new* entries is a fail.** Decide before demos: backfill a writer, or hide the tab. |
| **F** | **Mobile push cannot work in the current build.** `extra.eas.projectId` is missing from `app.json`, so registration returns `no-eas-project` and the Settings toggle flips itself back off. | `lib/push.tsx` | Run `eas init` before §19, or cut push testing. |
| **G** | **Rate limiting is fail-open.** `lib/rateLimit.ts` returns `{allowed:true}` on any RPC error or exception. | `lib/rateLimit.ts` | Rate limits are a UX nicety, **not a security boundary**. Don't record their absence under load as a pass. |

### 2.1 Decisions required before Day 1
- [ ] **Mobile in scope?** If not, §13 stops at `in_progress` and Returns is cut entirely.
- [ ] **Which environment?** Production (real data) or a **clone** of the live Supabase project. A rebuild from migrations will not work.
- [ ] **Who has `is_staff`?** `/admin` is unreachable until someone runs `update app.profiles set is_staff = true where email = '…'`. There is **no UI** for this.
- [ ] **Is `RESEND_API_KEY` + `SYSTEM_EMAIL_FROM` set?** If not, use the onboarding/bulk-invite paths, which show copyable links regardless.
- [ ] **Is `NEXT_PUBLIC_APP_URL` set?** If not, every email link points at `http://localhost:3000`.
- [ ] **Stripe / Shopify keys present?** If not, §15.5 and §15.6 become short "degrades correctly" checks.
- [ ] **Seed a second workspace** with `scripts/seed-demo.mjs` for §14 — those reports need 90 days of history no tester can click into existence.

---

## 3. Route coverage index

Every addressable surface in the app. **80 pages + 22 route handlers.** If a route isn't in a section you ran, it wasn't tested.

### Authenticated pages

| Route | Section | Route | Section |
|---|---|---|---|
| `/` | §6 | `/inventory` | §7.1 |
| `/login` | §4.1 | `/inventory/[id]` | §7.2 |
| `/signup` | §4.2 | `/inventory/[id]/labels` | §7.3 |
| `/forgot` | §4.3 | `/inventory/import` | §7.4 |
| `/magic-link` | §4.4 | `/facilities` | §8.1 |
| `/auth/callback` · `/auth/signout` | §4.5 | `/facilities/[id]` | §8.2 |
| `/invite/[token]` | §4.6 | `/facilities/[id]/builder` | §8.3 |
| `/onboarding` | §4.7 | `/facilities/[id]/labels` | §8.4 |
| `/workspaces/new` | §4.8 | `/facilities/[id]/sections/[sectionId]` | §8.5 |
| `/notifications` | §5.5 | `/scan` | §9.1 |
| `/kiosk` | §9.2 | `/cycle-counts` | §9.3 |
| `/lots` | §10.1 | `/serials` | §10.2 |
| `/kits` | §10.3 | `/work-orders` · `/work-orders/[id]` | §10.4 |
| `/suppliers` | §11.1 | `/suppliers/new` · `/suppliers/[id]` · `/suppliers/[id]/edit` | §11.2 |
| `/suppliers/import` | §11.5 | `/customers` | §11.3 |
| `/customers/new` · `/customers/[id]` · `/customers/[id]/edit` | §11.4 | `/customers/import` | §11.5 |
| `/purchase-orders` | §12.1 | `/purchase-orders/new` | §12.2 |
| `/purchase-orders/[id]` | §12.3 | `/purchase-orders/[id]/print` | §12.4 |
| `/inbound` | §12.5 | `/inbound/new` | §12.6 |
| `/inbound/[id]` | §12.7 | `/receiving` | §12.8 |
| `/orders` | §13.1 | `/orders/new` | §13.2 |
| `/orders/[id]` | §13.3 | `/orders/[id]/packing-slip` | §13.4 |
| `/orders/backorders` | §13.5 | `/picking` | §13.6 |
| `/picking/[id]` | §13.7 | `/picking/[id]/pick-list` | §13.8 |
| `/transfers` | §13.9 | `/returns` | §13.10 |
| `/analytics` | §14.1 | `/analytics/dead-stock` | §14.2 |
| `/analytics/forecast` | §14.3 | `/analytics/slotting` | §14.4 |
| `/analytics/valuation` | §14.5 | `/reports` · `/reports/[id]` | §14.6 |
| `/integrations` | §15.1 | `/integrations/[provider]` | §15.2 |
| `/integrations/resend` | §15.3 | `/integrations/shopify` · `/integrations/shopify/mapping` | §15.4 |
| `/integrations/webhooks` | §15.5 | `/settings` | §16.1 |
| `/settings/navigation` | §16.2 | `/settings/security` | §16.3 |
| `/settings/members` | §16.4 | `/settings/devices` | §16.5 |
| `/settings/billing` | §16.6 | `/settings/api-keys` | §16.7 |
| `/settings/audit` | §16.8 | `/settings/adjustments` | §16.9 |
| `/admin` | §16.10 | `/admin/onboard` | §16.11 |
| `/admin/workspace/[id]` | §16.12 | `/trial-ended` | §15.9 |

### Route handlers

| Route | Auth | Section |
|---|---|---|
| `GET /api/v1/products` | API key + `product:read` | §15.7 |
| `GET /api/v1/inventory` | API key + `location:read` | §15.7 |
| `POST /api/v1/scans` | API key + `scan:write` + `inventory.adjust` | §15.7 |
| `POST /api/cron/stockout-alerts` | `CRON_SECRET` | §15.8 |
| `POST /api/cron/auto-draft-pos` | `CRON_SECRET` | §15.8 |
| `POST /api/cron/cycle-count-queue` | `CRON_SECRET` | §15.8 |
| `POST /api/cron/lot-expiry-alerts` | `CRON_SECRET` | §15.8 |
| `POST /api/cron/email-digests` | `CRON_SECRET` | §15.8 |
| `POST /api/cron/webhook-retries` | `CRON_SECRET` | §15.8 |
| `POST /api/webhooks/shopify` | HMAC | §15.4 |
| `POST /api/webhooks/stripe` | Stripe signature | §16.6 |
| `GET /api/integrations/shopify/connect` | session + role | §15.4 |
| `GET /api/integrations/shopify/callback` | signed state + HMAC | §15.4 |
| `GET /api/import-template/[entity]` | session | §7.4 |
| `GET /api/inventory/import-template` | session | §7.4 |
| `GET /api/team/import-template` | session | §16.4 |
| `GET /(app)/inventory/export` | session | §17.4 |
| `GET /(app)/api/orders/export` | **RLS only** | §17.4 |
| `GET /(app)/analytics/valuation/export` | session | §17.4 |
| `GET /(app)/reports/[id]/export` | session | §17.4 |

For a workspace whose free trial has ended, `/api/v1/*` and the four `(app)` exports answer **402** (§15.9). Cron routes, webhooks and `/admin` are never gated.

---

## 4. Auth & account lifecycle

**Do not coach Tester A.** Every hesitation is a demo failure point. Record them.

**Rate limits in force** (all fail-open per finding G; all keyed on `x-nf-client-connection-ip` → first `x-forwarded-for` hop → literal `"unknown"`, so **every localhost tester shares one bucket**):

| Surface | Max | Window | Extra |
|---|---|---|---|
| Sign in | 10 | 300s | per IP only |
| Sign up | 5 | 600s | per IP only |
| Password reset | 10 | 900s | **+ 3 per 900s per email** |
| Magic link | 10 | 900s | **+ 3 per 900s per email** |
| Public API | 120 | 60s | per API key id |

Google OAuth and sign-out are **not** rate-limited.

### 4.1 `/login`
| # | Case | Expected | Result |
|---|---|---|---|
| 4.1.1 | Page renders | Eyebrow "Operator manifest", numbered rows `01 Email address`, `02 Passcode` (with show/hide + "Reset →"), `03` **"Submit credentials →"**, plus "Continue with Google" | ☐ |
| 4.1.2 | Empty fields | "Email is required" / "Password is required" | ☐ |
| 4.1.3 | Wrong password | "That email and passcode don't match our records." | ☐ |
| 4.1.4 | Unconfirmed email | "Confirm your email first — check your inbox for the link we sent." | ☐ |
| 4.1.5 | Rate limit (11 tries) | Blocked after 10 with "Too many attempts. Wait a minute and try again." | ☐ |
| 4.1.6 | Protected route while logged out | `/inventory` → `/login?next=/inventory`; after login lands on **/inventory** | ☐ |
| 4.1.7 | Query string survives the redirect *(regression)* | `/orders?status=open` while logged out → `next=/orders%3Fstatus%3Dopen`. After login you land back on the filtered list, not a bare one | ☐ |
| 4.1.8 | **Open-redirect defence** | `?next=//evil.com`, `?next=https://evil.com`, `?next=/\evil.com` → all land on `/`, never off-site | ☐ |
| 4.1.9 | Logged in on `/login` | Redirects to `/` | ☐ |
| 4.1.10 | Google sign-in | Completes and lands in the app | ☐ |
| 4.1.11 | `?error=` rendering | `/login?error=<text>` renders the text verbatim. Try a long string and an HTML payload — must render as text, never as markup | ☐ |
| 4.1.12 | **Remote-revocation message** *(regression)* | Revoke this device from another browser (§16.3), navigate → `/login?revoked=1` explains it: "You were signed out because this device's access was revoked." | ☐ |
| 4.1.13 | Path-prefix quirk | `/loginfoo`, `/signup-extra`, `/magic-linkX` are all treated as auth paths by `startsWith`. Confirm none 500s | ☐ |

### 4.2 `/signup`
| # | Case | Expected | Result |
|---|---|---|---|
| 4.2.1 | Find signup | From the marketing site, Tester A reaches `/signup` unaided | ☐ |
| 4.2.2 | Short password | 5 characters → "Password must be at least 8 characters" (**server-enforced** — retry with JS disabled) | ☐ |
| 4.2.3 | Strength meter | Appears after the first keystroke; responds to length/case/digit/special | ☐ |
| 4.2.4 | Common-password floor | `password123456789` → still reads **Weak** despite length | ☐ |
| 4.2.5 | Duplicate email | "That email is already registered. Try signing in instead." | ☐ |
| 4.2.6 | Rate limit (6 rapid signups) | Blocked after 5 | ☐ |
| 4.2.7 | Happy path | **Either** a "Check your email" banner **or** straight to `/onboarding`, depending on the Supabase confirmation setting. **Record which your environment does.** | ☐ |
| 4.2.8 | Confirmation email | Click the link → authenticated, then `/onboarding` | ☐ |
| 4.2.9 | Signup from an invite | `/signup?next=/invite/<token>` → after signup you land on the **invite**, not the onboarding wizard | ☐ |

### 4.3 `/forgot`
| # | Case | Expected | Result |
|---|---|---|---|
| 4.3.1 | Unknown email | Same success text as a known one: "If <email> is registered, we've sent a reset link." — **deliberate** | ☐ |
| 4.3.2 | Known email | Email arrives; link resets; new password works | ☐ |
| 4.3.3 | Uniform response under throttling *(regression)* | Request 4× for the same address inside 15 min. Every attempt returns the **same** generic success; the 4th simply sends no email. No reply distinguishes throttled from delivered | ☐ |
| 4.3.4 | Reset link host | Built from the raw `origin` header here (not `appUrl()`, unlike signup). Confirm it points at your environment | ☐ |

### 4.4 `/magic-link`
| # | Case | Expected | Result |
|---|---|---|---|
| 4.4.1 | Send link | "Check <email> for your sign-in link." | ☐ |
| 4.4.2 | Link signs in | Lands in the app | ☐ |
| 4.4.3 | Superseded link | Request two links, use the **first** → rejected (Supabase invalidates prior OTPs) | ☐ |
| 4.4.4 | Re-use / expiry | Using a link twice, and using an expired link, are both rejected cleanly | ☐ |

### 4.5 `/auth/callback` and `/auth/signout`
| # | Case | Expected | Result |
|---|---|---|---|
| 4.5.1 | No `code` | Redirects to `/login` | ☐ |
| 4.5.2 | Garbage `code` | `/login?error=<supabase message>` | ☐ |
| 4.5.3 | Replayed `code` | Rejected, no session granted | ☐ |
| 4.5.4 | `?next=` sanitised | `/auth/callback?code=…&next=https://evil.com` → lands on `/` | ☐ |
| 4.5.5 | Sign out | Back to `/login`; browser Back does not restore the session | ☐ |
| 4.5.6 | **CSRF on sign-out** *(regression)* | Put `<img src="https://app.../auth/signout">` on a page and load it while signed in → **you stay signed in** (sub-resource fetches are refused). Clicking a real sign-out link still works | ☐ |

### 4.6 `/invite/[token]`
Tokens are 32 hex chars, **7-day expiry**.

| # | Case | Expected | Result |
|---|---|---|---|
| 4.6.1 | Signed-out invitee | `/login?next=/invite/<token>` → sign in → land on the invite | ☐ |
| 4.6.2 | **Brand-new person** (regression) | Invite someone with no account; follow the emailed link. They reach signup with `next` preserved and **join your workspace** — they are **not** dropped into the onboarding wizard | ☐ |
| 4.6.3 | Existing user accepts | "Join <org>" → membership created with the **invite's** role | ☐ |
| 4.6.4 | Wrong account *(regression)* | Open B's invite while signed in as A → "Email mismatch" naming both addresses, **plus a "Sign out and switch accounts →" button** that returns you to this same invite after signing in | ☐ |
| 4.6.5 | Re-use accepted invite | "Already accepted" + "Go to overview →" | ☐ |
| 4.6.6 | Expired invite | Backdate `expires_at` via SQL → "Invite expired" | ☐ |
| 4.6.7 | Bogus / tampered token | `/invite/garbage`, truncated token, case-flipped token → "Invite not found" | ☐ |
| 4.6.8 | Revoked mid-flight | Admin revokes in another tab between render and click → "Invite not found or already revoked" | ☐ |
| 4.6.9 | Double-click Accept | Exactly one membership row; no unique-violation error surfaced | ☐ |
| 4.6.10 | Already a member | Accepting an invite for an org you're in → idempotent, no duplicate row | ☐ |

### 4.7 `/onboarding` — the 4-step wizard
Steps: **Workspace · How you work · Team · Review**.

| # | Case | Expected | Result |
|---|---|---|---|
| 4.7.1 | Step 1 contents | Workspace name, **first facility** (pre-filled "Main warehouse", address in a collapsed `<details>`), and the industry cards — all on one step | ☐ |
| 4.7.2 | Workspace name validation | Blank or 1 char → inline "at least 2 characters"; the button is never disabled; focus stays on the field | ☐ |
| 4.7.3 | Facility name validation | Clear the facility name → inline "Give your facility a name — 'Main warehouse' works fine." on the **facility** field, not the workspace one | ☐ |
| 4.7.4 | Industry cards | Nothing pre-selected on load; clicking highlights; clicking again deselects | ☐ |
| 4.7.5 | Step 2 tailoring | Activity chips arrive **pre-checked from the chosen industry**; toggling updates the "Your Nimbus, so far" preview live (sidebar list + "dashboard leads with") | ☐ |
| 4.7.6 | Hand-edit sticks | Toggle a chip, go back to step 1, change industry → your hand-edited chips are **not** overwritten | ☐ |
| 4.7.7 | Priorities | Pick 1–3; chips number in click order; capped at 3 | ☐ |
| 4.7.8 | Operation size | `single_room` produces a leaner dashboard later (§6.2.5) | ☐ |
| 4.7.9 | Draft resume | Refresh mid-wizard → answers survive (localStorage). Completed steps in the rail are clickable | ☐ |
| 4.7.10 | Invite chips | Add 2 good + 1 bad address → bad one turns red inline; over 20 shows the overflow notice | ☐ |
| 4.7.11 | Review read-back | Every row matches what you entered; each **Edit** jumps to the right step | ☐ |
| 4.7.12 | Create (no invites) | Lands on `/` | ☐ |
| 4.7.13 | Create (with invites) | Success screen with per-invite **email sent / email failed** status + copyable `/invite/<token>` links | ☐ |
| 4.7.14 | Idempotence / double-submit | Return to `/onboarding` afterwards, or submit from two tabs → redirects to `/`; exactly **one** workspace (advisory-locked in `provision_workspace`) | ☐ |
| 4.7.15 | Long name | 200-char workspace name → "keep it under 120 characters", not a raw Postgres error | ☐ |

### 4.8 `/workspaces/new` — second workspace
| # | Case | Expected | Result |
|---|---|---|---|
| 4.8.1 | Same wizard | Opens the **identical 4-step wizard** with "New workspace" copy, inside the app chrome | ☐ |
| 4.8.2 | Separate draft | A draft here does not clobber an `/onboarding` draft (different localStorage key) | ☐ |
| 4.8.3 | Create | You **switch into** the new workspace immediately; its sidebar and dashboard reflect *its* answers, not the old workspace's | ☐ |
| 4.8.4 | Old workspace intact | Switch back via the workspace switcher → the original layout and data are unchanged | ☐ |
| 4.8.5 | Facility cookie | The previously-selected facility does not leak into the new workspace (scope resets) | ☐ |

---

## 5. App shell & navigation

### 5.1 Sidebar and module resolution
| # | Case | Expected | Result |
|---|---|---|---|
| 5.1.1 | Nav reflects wizard answers | Deselected modules sit under **"More"**; selected ones are primary | ☐ |
| 5.1.2 | Customise | `/settings/navigation` → hide/reorder; **Overview and Settings can never be hidden** (try the toggle and a crafted POST) | ☐ |
| 5.1.3 | Hidden ≠ unreachable | Hide `/lots`, then open it by URL and via ⌘K → still works. Module gating hides nav items only | ☐ |
| 5.1.4 | Per-user prefs | A second member in the same workspace has their own sidebar; your changes don't affect them | ☐ |
| 5.1.5 | Collapse | Collapse the rail → state survives reload (cookie) | ☐ |
| 5.1.6 | Mobile nav | At phone width the rail becomes the mobile nav + top bar; every destination reachable | ☐ |

### 5.2 Workspace switcher
| # | Case | Expected | Result |
|---|---|---|---|
| 5.2.1 | Switch | Data, sidebar and dashboard all re-resolve to the new org | ☐ |
| 5.2.2 | Forged cookie | Hand-edit the workspace cookie to an org you don't belong to → you are not granted access | ☐ |
| 5.2.3 | Single-workspace user | Switcher degrades gracefully (no empty dropdown) | ☐ |

### 5.3 Facility scope
| # | Case | Expected | Result |
|---|---|---|---|
| 5.3.1 | Switch facility | KPIs, inventory on-hand and lists re-scope. **Product count stays workspace-wide by design** | ☐ |
| 5.3.2 | "All facilities" | Picking cannot build waves (banner explains why); other pages show cross-facility data | ☐ |
| 5.3.3 | Archived facility selected | Archive the facility you're scoped to → next request silently falls back to another facility (not to "All"). Confirm no crash | ☐ |
| 5.3.4 | Facility scope everywhere *(regression)* | `/cycle-counts` now offers only slots in the active facility, and `/transfers` lists only transfers with **either end** at it. Switch facilities and confirm both follow | ☐ |

### 5.4 Command palette & shortcuts
| # | Case | Expected | Result |
|---|---|---|---|
| 5.4.1 | ⌘K opens | Every listed destination resolves (no 404) | ☐ |
| 5.4.2 | `?` or ⌘/ | Keyboard-shortcut help opens; Esc closes | ☐ |
| 5.4.3 | Palette reaches hidden pages | Modules you turned off are still findable here | ☐ |

### 5.5 `/notifications`
| # | Case | Expected | Result |
|---|---|---|---|
| 5.5.1 | List + counts | Meta "Total" and "Unread" (live dot when >0) | ☐ |
| 5.5.2 | Filter chips | All / Unread / Stock alerts / System / Team / Scan summaries, each with a count | ☐ |
| 5.5.3 | Chips cover every kind *(regression)* | Run the lot-expiry and cycle-count-queue crons (§15.8) → their notifications appear under their own **Lot expiry** and **Cycle counts** chips, with distinct tones | ☐ |
| 5.5.4 | Mark all read | Appears only when unread > 0; clears the badge in the sidebar | ☐ |
| 5.5.5 | Row click | A row with a link navigates. ⚠️ It does **not** mark itself read — confirm expected | ☐ |
| 5.5.6 | Email digest toggle | Flips `Email digest · On/Off`; drives the digest cron | ☐ |
| 5.5.7 | Pagination | `?page=0`, `?page=abc` → page 1. `?page=999` → empty list, no redirect | ☐ |
| 5.5.8 | Realtime | Trigger a notification from another session → appears without refresh | ☐ |
| 5.5.9 | Volume *(regression)* | Rows are paged in the query and chip counts come from head counts, so a user with 2 000+ notifications loads as fast as one with 20. Verify the counts still match the list | ☐ |

### 5.6 Theme
| # | Case | Expected | Result |
|---|---|---|---|
| 5.6.1 | Toggle on every surface | Auth pages, onboarding, app, kiosk and `/admin` all have a theme toggle | ☐ |
| 5.6.2 | No flash | Reload in light mode → **no dark flash** before paint (pre-hydration script) | ☐ |
| 5.6.3 | Persistence | Choice survives reload and navigation | ☐ |
| 5.6.4 | Both themes legible | Spot-check 5 dense screens in light mode: tables, badges, charts, the facility 2D view, the import result panel | ☐ |

### 5.7 Kiosk gate
| # | Case | Expected | Result |
|---|---|---|---|
| 5.7.1 | `?kiosk=1` on any page | Chrome hides, "Exit kiosk" pill appears top-right | ☐ |
| 5.7.2 | Esc exits | Returns to normal chrome, **preserving other query params** | ☐ |
| 5.7.3 | Kiosk on a form page | `?kiosk=1` on `/orders/new` — confirm it's usable or deliberately unusable, not broken | ☐ |

---

## 6. Overview dashboard (`/`) & sample data

> Most numbers here need **history**, not just data. On a fresh workspace, flat sparklines and empty panels are **expected**. Sparklines need ≥2 nights of `kpi_snapshots`.

### 6.1 First impression (Tester A, uncoached)
| # | Case | Expected | Result |
|---|---|---|---|
| 6.1.1 | Brand-new owner lands on `/` | A **"Getting started" checklist** whose items match the modules enabled and the viewer's role, KPI tiles, and a CTA in each empty panel. A customer should know exactly what to do next | ☐ |
| 6.1.2 | Checklist items | `{done} of {total} done` header; each row links somewhere real | ☐ |
| 6.1.3 | Permission-aware | As a plain member, items they can't action (import, layout, team, integrations) are **absent**, not disabled | ☐ |
| 6.1.4 | **Supplier-first PO step** | With zero suppliers, the checklist shows **"Add your first supplier"** → `/suppliers/new`, not a PO form that can only say "add a supplier first". After adding one, it becomes "Receive your first purchase order" | ☐ |
| 6.1.5 | Scan step copy | Reads **"Count what you have"**, not "Do your first scan" | ☐ |
| 6.1.6 | Integrations item survives | A fully-enabled workspace shows all 8 applicable items including **"Connect your store"** (regression: it used to be sliced off) | ☐ |
| 6.1.7 | Dismiss | Hides the card for **you only**; a teammate still sees it | ☐ |
| 6.1.8 | Retires itself | Add one product of your own → the checklist stops rendering | ☐ |

### 6.2 Role-driven layout
| # | Case | Expected | Result |
|---|---|---|---|
| 6.2.1 | As **owner** | 6 KPIs including **Inventory value** and **Capital in dead stock** | ☐ |
| 6.2.2 | As **admin** | Two titled grids — "Order flow · In motion" and "Inventory · On hand" — and no money figures | ☐ |
| 6.2.3 | As **member** | Scans / Open orders / Pick queue / Low stock only — **no financials at all** | ☐ |
| 6.2.4 | **Orphaned heading** | As an admin, disable the `orders` module → the "Order flow · In motion" heading must **not** appear over a lone Low-stock tile (survivors fold into the next grid) | ☐ |
| 6.2.5 | Compact layout | A `single_room` workspace drops Products/Sections tiles and Top movers, and gains Recent activity | ☐ |
| 6.2.6 | Priorities reorder | Set "Never run out" first → reorder alerts lead the board | ☐ |
| 6.2.7 | Numerals are gapless | On a workspace where reorder alerts self-hide (nothing low), section numerals still read 01, 02, 03… with no gap | ☐ |

### 6.3 KPI correctness
| # | Case | Expected | Result |
|---|---|---|---|
| 6.3.1 | Pick queue / POs in transit | Tiles show the **true total**, not the capped list length (lists show 8 max). Create 10 pickable orders and compare | ☐ |
| 6.3.2 | Units on hand | Matches a manual sum of active locations in scope | ☐ |
| 6.3.3 | Products tile | Workspace-wide even when scoped to one facility (by design) | ☐ |
| 6.3.4 | Inventory value = 0 | Delta chip reads "Set unit costs" | ☐ |
| 6.3.5 | Currency formatting | <$10k → `$1,234`; <$1M → `$12.5k`; ≥$1M → `$1.24m` | ☐ |
| 6.3.6 | Sparkline scoping | Switch facility → the sparkline changes. A facility with no snapshot rows falls back to **flat**, never to the org series | ☐ |
| 6.3.7 | Realtime | Record a scan in a second browser → the overview updates without a manual refresh | ☐ |
| 6.3.8 | 60s cache | Edit a product in another tab → the overview reflects it within the cache window or on a realtime event, not minutes later | ☐ |

### 6.4 Sample data — **new feature**
| # | Case | Expected | Result |
|---|---|---|---|
| 6.4.1 | Offer visibility | The **Explore with sample data** button appears in the checklist footer only when: no sample loaded, you are owner/admin with `inventory.manage`, and the workspace has ≥1 facility | ☐ |
| 6.4.2 | Load it | Banner "You're exploring with **sample data**" appears. Inventory shows ~10 industry-matched products with stock in bays A/B/C, reorder alerts fire, a PO is in transit, 2 orders are open, the 14-day sparkline has shape | ☐ |
| 6.4.3 | Industry match | Load it in a flooring workspace and a food workspace → different catalogs (hardwood/tile vs oats/espresso) | ☐ |
| 6.4.4 | Checklist still judges **your** data | With sample data loaded, the getting-started checklist **stays** and its counts ignore the sample rows | ☐ |
| 6.4.5 | No facility | Try it on a workspace with no facility → "Add a facility first (Facilities → New facility)…" | ☐ |
| 6.4.6 | Double-load | Click it again → "Sample data is already loaded — clear it before loading again." | ☐ |
| 6.4.7 | As a member | Not offered; a crafted POST returns "Only owners and admins can load or clear sample data." | ☐ |
| 6.4.8 | **Clear it** | Confirm dialog, then every sample row disappears: products, stock, suppliers, customers, sections, PO, orders, scans | ☐ |
| 6.4.9 | **Your data survives** | Before clearing, add your own product, supplier and customer. After clearing, all three remain | ☐ |
| 6.4.10 | Reused rows are never deleted | Create a supplier named exactly like a sample one *first*, then load and clear → your supplier survives (it was reused, not recorded) | ☐ |
| 6.4.11 | **Blocked clear** | Add a line to one of *your* orders using a sample product, then clear → refused with "N lines on your own orders use sample products — remove those lines (or those orders) first." | ☐ |
| 6.4.12 | Stale sample | Backdate `sample_data.seeded_at` >14 days via SQL → sample scans stop being subtracted and the "Count what you have" item flips to done. Record whether that's acceptable | ☐ |
| 6.4.13 | Partial failure | If a seed step fails, the banner still appears and **Clear sample data** removes the partial set | ☐ |

---

## 7. Inventory & catalog

### 7.1 `/inventory` (list)
| # | Case | Expected | Result |
|---|---|---|---|
| 7.1.1 | Header | Meta `Total` (exact count), plus `Facility` when scoped. Actions: Print labels (only when rows exist), **Import** (only with `inventory.manage`), **Export CSV**, **Register product** | ☐ |
| 7.1.2 | Search | Placeholder "Search by name, SKU, or barcode"; 300 ms debounce; matches all three fields | ☐ |
| 7.1.3 | Filter chips | Search/Category/Low-stock chips appear and are individually removable; **Clear filters** resets all | ☐ |
| 7.1.4 | Sorting | `SKU · Product`, `On hand`, `Reorder pt`, `Updated` sort both ways; Barcode/Category/Location are not sortable | ☐ |
| 7.1.5 | Bad params | `?category=not-a-uuid`, `?sort=onhand&order=garbage`, `?pageSize=7` → all fall back silently, no error | ☐ |
| 7.1.6 | Page overshoot | `?page=9999` → serves the last valid page, not a blank table | ☐ |
| 7.1.7 | **Export CSV** (regression — was a 404) | Downloads `Nautilus-inventory…-YYYY-MM-DD.csv`. **The file must match the on-screen filters exactly** — set a search + category + low-stock, export, compare row counts | ☐ |
| 7.1.8 | **Import link** | Visible in the header with `inventory.manage`, hidden without it | ☐ |
| 7.1.9 | Empty state (no filters) | "No products yet" with **Import a spreadsheet**, **Template**, and (owner/admin only) **Explore with sample data** | ☐ |
| 7.1.10 | Empty state (filtered) | "No products match those filters" / "Try widening the filters." — and **no** import CTA | ☐ |
| 7.1.11 | **Low-stock parity** | A SKU with 30 on hand, 20 of them quarantined, reorder point 10 shows **"30"** *and* flags low. Intended (on-hand is physical, low-stock is available) — confirm it's explained, not just surprising | ☐ |
| 7.1.12 | Facility scope | Switching facility changes on-hand sums and primary location | ☐ |
| 7.1.13 | Cache staleness | Register a product in a second tab → the list reflects it (tag-busted), not after 5 minutes | ☐ |

### 7.2 Register product — **three-field quick add**
| # | Case | Expected | Result |
|---|---|---|---|
| 7.2.1 | Modal opens lean | Only **Barcode**, **On hand**, **Name** are visible; everything else is behind a collapsed "More details — SKU, category, cost, reorder point, supplier" | ☐ |
| 7.2.2 | Minimum viable create | Barcode + Name only → product created, lands on its detail page | ☐ |
| 7.2.3 | **On hand writes stock** | Register with On hand = 12 → detail shows **12 units on hand** in the holding area, and a **REG** entry appears in recent activity | ☐ |
| 7.2.4 | On hand validation | `-1`, `1.5`, `abc` → "On hand must be a whole number, 0 or more" | ☐ |
| 7.2.5 | No facility *(regression)* | On a workspace with zero facilities, registering with a quantity says so: "Product registered, but the on-hand count wasn't saved — add a facility first." It is no longer dropped silently | ☐ |
| 7.2.6 | Duplicate barcode | "Barcode X is already registered" | ☐ |
| 7.2.7 | Duplicate SKU | Rejected (unique per org) with a legible message, not a raw Postgres error | ☐ |
| 7.2.8 | Unit cost parsing | `$1,234.56` accepted and stored as `1234.56`; `abc` → "Unit cost must be a non-negative number" | ☐ |
| 7.2.9 | Supplier picker | Disabled with "No suppliers yet" when the org has none; populated when it does | ☐ |
| 7.2.10 | Deep link | `/inventory?register=012345` opens the modal pre-filled with that barcode | ☐ |
| 7.2.11 | Esc / backdrop | Closes and **discards typed data** — confirm that's acceptable | ☐ |
| 7.2.12 | As a **member** | The button still renders; submitting returns "You don't have permission to manage the catalog" | ☐ |

### 7.3 `/inventory/[id]` (detail) and `/inventory/[id]/labels`
| # | Case | Expected | Result |
|---|---|---|---|
| 7.3.1 | KPIs | Units on hand (+"N allocated"), **Available (ATP)** = max(0, onHand − allocated), Inventory value ("—" without a cost), Reorder point | ☐ |
| 7.3.2 | Over-allocated | Allocate more than on hand → ATP clamps to 0, never negative | ☐ |
| 7.3.3 | Replenishment panel | Lead time falls back to the supplier default and is suffixed " (supplier default)" | ☐ |
| 7.3.4 | Demand forecast | With 90 days of history: avg/day, trend (Rising/Falling/Flat), seasonality, suggested ROP + safety stock as `N (now M)` | ☐ |
| 7.3.5 | **Apply suggested settings** (regression) | Renders **only** with `inventory.manage`. As a member it is absent, and a crafted POST changes nothing | ☐ |
| 7.3.6 | Locations card | Lists every slot with facility and qty; "Not placed in any location yet." when empty | ☐ |
| 7.3.7 | **Soft-deleted locations** *(regression)* | Remove a location (§8.5), then reload this page. The removed row is **gone** and no longer counts toward on-hand / ATP / inventory value. Cross-check the same SKU on the inventory list, `/scan` and the section grid — all four must agree | ☐ |
| 7.3.8 | Lots table | FEFO-sorted (earliest expiry first, nulls last); first non-expired lot with stock gets the **"Pick first"** chip | ☐ |
| 7.3.9 | Lot edge cases | A lot with no expiry sorts last and is never "Pick first"; an expired lot with stock is never "Pick first" | ☐ |
| 7.3.10 | Cycle counts + scans | Last 5 counts with signed variance; last 20 scans with readable action labels | ☐ |
| 7.3.11 | Cross-org id | Paste another workspace's product id → 404, never data | ☐ |
| 7.3.12 | Label sheet | `/inventory/[id]/labels` renders 12 by default; `?count=0` → 1, `?count=1e9` → 120 | ☐ |
| 7.3.13 | Label edge cases | `?format=gs1` on a non-GTIN barcode silently falls back to Code 128 and says so; a product with no barcode shows "This product has no barcode to print." | ☐ |

### 7.4 `/inventory/import` — **the spreadsheet importer**
Shared engine; the same workbench serves suppliers and customers (§11.5).

| # | Case | Expected | Result |
|---|---|---|---|
| 7.4.1 | Two-phase flow | **Check first** writes nothing. The result shows rows ready, every problem by **spreadsheet row number**, and a "How your columns matched" panel. Only then does **Import N products** appear | ☐ |
| 7.4.2 | Source invalidation | After a check, change the file / text / "Update existing" checkbox → the Import button disappears and an info notice says to check again | ☐ |
| 7.4.3 | Template round-trip | Download **Template**, upload it unchanged → checks clean with 1 valid row and zero ignored columns | ☐ |
| 7.4.4 | **Paste from a spreadsheet** | Copy cells (header row included) from Excel/Sheets, switch to the Paste tab, paste, Check → tab-separated input parses correctly | ☐ |
| 7.4.5 | **Header aliases** | A file with `UPC`, `Product Name`, `Qty on hand`, `Vendor`, `Cost`, `Min` matches without renaming anything. Unmatched columns are listed as "Ignored columns" | ☐ |
| 7.4.6 | SKU-as-barcode fallback | A file with `SKU` and `Name` but no barcode column → SKU becomes the barcode, with the note "No barcode column — using 'SKU' as the barcode" | ☐ |
| 7.4.7 | Delimiters | Comma, tab and semicolon files all parse; the result panel names the detected delimiter | ☐ |
| 7.4.8 | Excel quirks | A UTF-8 BOM file, a CRLF file, and a file with a **multi-line quoted cell** in Notes all parse correctly | ☐ |
| 7.4.9 | Row problems | 1 missing barcode + 1 missing name + 1 in-file duplicate + 1 bad number → each reported specifically with its row number; the good rows still import | ☐ |
| 7.4.10 | Existing rows | A barcode already in the catalog is **skipped** and reported: "Already in catalog — skipped (turn on 'Update existing' to overwrite)" | ☐ |
| 7.4.11 | **Update mode** | Re-import with "Update products that already exist" on, one cell changed and one cell blank → the changed cell applies, the **blank cell does not erase** the existing value | ☐ |
| 7.4.12 | **Quantity is never re-applied** | The update-mode row carries a quantity → on-hand does **not** double. Confirm | ☐ |
| 7.4.13 | **Quantity + location** | A row with `quantity` and `location = A-3-2` (an existing section) lands in that slot with a **REG** scan. `A` alone → bay 1 / level 1. Blank → holding area | ☐ |
| 7.4.14 | Bad locations | `Z-1-1` (no such section) → "no section 'Z' in this facility…"; `A-99-1` → "section A has bays 1–N". Both rows are skipped, the rest import | ☐ |
| 7.4.15 | Quantity with no facility | Row has a quantity but the workspace has no facility → reported, not silently dropped | ☐ |
| 7.4.16 | Categories auto-create | A new category name is created and **announced** in the result notes ("Created 1 category: Widgest"). Record whether silent creation of typos is acceptable | ☐ |
| 7.4.17 | Suppliers auto-create | With `suppliers.manage`, unknown supplier names are created and announced. **Without it**, the note says the field was left blank and names them | ☐ |
| 7.4.18 | SKU conflicts | A SKU already owned by a different barcode → `SKU "X" already belongs to barcode Y`; two rows sharing a SKU → "Duplicate SKU 'X' within this file" | ☐ |
| 7.4.19 | Caps | 1 000 rows passes; **1 001 rows** is refused at Check with the limit message; a >5 MB file is refused | ☐ |
| 7.4.20 | Field caps | A 300-char product name → "Name is too long (max 255 characters)" | ☐ |
| 7.4.21 | Error display cap | A file with 250 bad rows shows the first 200 then "+ 50 more — fix these first and check again." | ☐ |
| 7.4.22 | Scope warning | While scoped to "All facilities", import with quantities → the notes say which facility the stock landed in | ☐ |
| 7.4.23 | As a **member** | "Only admins can import products." | ☐ |
| 7.4.24 | Template routes | `/api/import-template/products` and the legacy `/api/inventory/import-template` return **byte-identical** CSVs | ☐ |

---

## 8. Facilities & layout

### 8.1 `/facilities`
| # | Case | Expected | Result |
|---|---|---|---|
| 8.1.1 | Create facility | Name required; created; a **"Receiving" door element auto-seeds** (drives slotting distance) | ☐ |
| 8.1.2 | Address fields | City / State (dropdown) / ZIP. ZIP accepts digits only, max 5. **No ZIP→city lookup** (the old one was dead code blocked by CSP and has been removed) | ☐ |
| 8.1.3 | Archive / restore | Toggles `is_active`; the archived list appears. ⚠️ **No confirmation dialog** | ☐ |
| 8.1.4 | Archive the active facility | Archive the one you're scoped to → next request falls back silently; no crash | ☐ |
| 8.1.5 | Stats accuracy | "Locations" counts include **soft-deleted** rows (no `is_active` filter) — compare with the section grid. Record | ☐ |
| 8.1.6 | As a **member** | Archive/restore silently do nothing, with no message | ☐ |

### 8.2 `/facilities/[id]` (viewer)
| # | Case | Expected | Result |
|---|---|---|---|
| 8.2.1 | 2D view | Floor plan renders; sections tinted by occupancy; fit-to-canvas on first paint | ☐ |
| 8.2.2 | 3D view | Toggle loads ("Loading 3D view…", labelled beta); choice persists in localStorage | ☐ |
| 8.2.3 | Section click | Navigates to the section detail page | ☐ |
| 8.2.4 | Occupancy maths | Two SKUs in one slot count as **one** occupied slot | ☐ |
| 8.2.5 | Empty layout *(regression)* | A facility with no sections or elements shows an empty state pointing at the builder, not a blank canvas. Without `facilities.manage` the copy says who can draw it | ☐ |
| 8.2.6 | Edit-layout gate | The link renders only with `facilities.manage` | ☐ |
| 8.2.7 | Cross-org id | 404 | ☐ |

### 8.3 `/facilities/[id]/builder`
| # | Case | Expected | Result |
|---|---|---|---|
| 8.3.1 | **Only way to add a section** | There is no simple add-section form on the viewer — confirm the builder is the sole path and rate the friction | ☐ |
| 8.3.2 | Add section | Set Code / Bays / Levels → **Save layout** → persists | ☐ |
| 8.3.3 | Overlap guard | Drag two sections to overlap → red banner "N sections overlap", **Save blocked** with "Resolve overlapping sections before saving" | ☐ |
| 8.3.4 | Elements may overlap | Doors/walkways/notes are deliberately allowed to overlap — confirm they don't trip the guard | ☐ |
| 8.3.5 | Keyboard | ⌘Z / ⌘⇧Z / ⌘S / ⌘A / ⌘D / arrows (1 unit) / Shift+arrows (10) / zoom. None fire while focus is in a text field | ☐ |
| 8.3.6 | Unsaved-work guard | Change something, close the tab → the browser warns | ☐ |
| 8.3.7 | Draft restore | Change something, reload → unsaved edits are restored from sessionStorage | ☐ |
| 8.3.8 | Inspector clamps | Bays/Levels typed as `0` or letters snap to 1; Width/Height clamp to ≥40; Code caps at 4 chars | ☐ |
| 8.3.9 | **Server-side validation** *(regression)* | Craft a save payload with `total_bays: 0`, a 10-char code, or two sections sharing a code → each is refused with its own message, naming the section | ☐ |
| 8.3.10 | No-door nudge | A facility with no `door` element shows a non-blocking warning (slotting needs it) | ☐ |
| 8.3.11 | Section code reuse | Add A, B, C → delete A → add another → it is also `C`. Record | ☐ |
| 8.3.12 | Delete a section with stock | Silently refused with **no message at all**. Record | ☐ |
| 8.3.13 | **Blueprint scan** *(regression)* | Upload a floor plan into a facility that already has sections → a confirm names how many will be removed and warns that stock in them is unlinked. Cancelling leaves the layout untouched | ☐ |
| 8.3.14 | Blueprint limits | >4 MB → "File too large (max 4MB)."; a non-image → clean error | ☐ |
| 8.3.15 | Snapshots | Create, change, restore. A restore that would orphan locations returns a **confirm step** naming the count, then reports "Layout restored · N locations unlinked" | ☐ |
| 8.3.16 | Snapshot cross-facility | Restoring facility A's snapshot while viewing B is refused | ☐ |
| 8.3.17 | Unit toggle | ft ↔ m **relabels only** — geometry is not rescaled. Confirm that's intended | ☐ |
| 8.3.18 | As a **member** *(regression)* | `/facilities/{id}/builder` redirects straight back to the viewer — no editor opens, so no work can be lost at Save | ☐ |
| 8.3.19 | Two tabs | Edit the same facility in two tabs → last write wins, no corruption | ☐ |

### 8.4 `/facilities/[id]/labels`
| # | Case | Expected | Result |
|---|---|---|---|
| 8.4.1 | All bays | Expands every section into bays × levels | ☐ |
| 8.4.2 | Scope to one section | `?section=<id>` limits the sheet | ☐ |
| 8.4.3 | **1 000-label cap** | A facility exceeding it shows "Capped at 1000 labels — print one section at a time for the rest." | ☐ |
| 8.4.4 | Duplicate section codes | Two sections with the same code produce colliding label codes. Confirm and rate | ☐ |
| 8.4.5 | Foreign section id | `?section=<another facility's section>` → empty state, not data | ☐ |

### 8.5 `/facilities/[id]/sections/[sectionId]`
| # | Case | Expected | Result |
|---|---|---|---|
| 8.5.1 | Grid | Bay × level grid, levels descending; cells are buttons with accessible labels; stat cards Occupancy / Distinct SKUs / Total units | ☐ |
| 8.5.2 | **Place stock** | Slot → Add product + qty → **this is the main way on-hand is created.** `/inventory` reflects it | ☐ |
| 8.5.3 | Product search | Needs ≥2 characters; matches name/barcode/SKU; caps at 10 results | ☐ |
| 8.5.4 | Place into an occupied slot | Placing the same product again **adds** to the quantity rather than creating a second row | ☐ |
| 8.5.5 | **Out-of-range bay on place** *(regression)* | Placing at bay 9999 is refused with "Bay exceeds section maximum of N", matching Move | ☐ |
| 8.5.6 | Slot capacity | Exceeding `slot_capacity` shows "Over" but is **deliberately not blocked** — a manual placement records what is physically on the shelf. The slotting optimiser (§14.4.5) does refuse to *suggest* an over-capacity move. Confirm both halves | ☐ |
| 8.5.7 | Adjust quantity | Inline edit applies immediately when under the threshold | ☐ |
| 8.5.8 | **Adjustment approval** | Set a threshold (§16.9), then make an adjustment at exactly the threshold → **queued** (the rule is `>=`). On-hand unchanged; it appears in `/settings/adjustments` | ☐ |
| 8.5.9 | Reason-gated approval | Pick reason `shrinkage` or `theft` → queued regardless of size | ☐ |
| 8.5.10 | Threshold 0 | Set the threshold to 0 → **every** non-zero adjustment queues | ☐ |
| 8.5.11 | Queued message styling *(regression)* | "Adjustment sent for approval" renders in an **info** tone, not danger red — it is a successful outcome | ☐ |
| 8.5.12 | Drift guard | Two operators edit the same slot → the loser gets "Stock changed to N since you loaded this — refresh and retry." | ☐ |
| 8.5.13 | Zero delta | Submitting the same quantity writes no row and no audit entry | ☐ |
| 8.5.14 | Move stock | Bounds **are** enforced: "Bay exceeds section maximum of N" / "Level exceeds…" | ☐ |
| 8.5.15 | Move onto the same product | Quantities **merge** and the source row deactivates | ☐ |
| 8.5.16 | **Remove clears the same bar** *(regression)* | With a threshold set, remove a location holding 10 000 units → it is **queued for approval** and the slot stays until approved, exactly as editing it to 0 would be. An empty slot still removes immediately | ☐ |
| 8.5.17 | Quarantined rows | Quarantined stock **is** shown in this grid and its "Total units" — the grid reports physical stock. The kit builder and picking exclude it because it can't be consumed. Confirm both, and that the split is explained | ☐ |
| 8.5.18 | Large grid | 100 bays × 10 levels = 1 000 cells — check render performance | ☐ |
| 8.5.19 | As a **member** | `inventory.adjust` is a member default, so place/adjust/move **should work**. Confirm | ☐ |

---

## 9. Floor operations

### 9.1 `/scan`
| # | Case | Expected | Result |
|---|---|---|---|
| 9.1.1 | **Scan without hardware** | Type a barcode into the manual field → Look up. A plain keyboard works | ☐ |
| 9.1.2 | Found result | Category, name, barcode/SKU/manufacturer, stock blocks (Here / Workspace / Reorder point), location chips, and Locate / Pick / Count actions | ☐ |
| 9.1.3 | Reorder action | Appears only when on-hand ≤ reorder point (**equal counts as low**) | ☐ |
| 9.1.4 | Unknown barcode | "Not in catalog" + **Register product →** which deep-links `/inventory?register=<barcode>` | ☐ |
| 9.1.5 | Session history | Up to 25 entries with green/red dots; "Scans this session will appear here." when empty | ☐ |
| 9.1.6 | Rapid fire | Fire 5 lookups fast → the **last** one wins; no stale result renders | ☐ |
| 9.1.7 | Exact match only | A barcode with a leading zero, different case, or a **SKU** instead of a barcode does **not** match. Confirm and rate | ☐ |
| 9.1.8 | Pause / resume | Pausing hardware capture leaves the manual field working | ☐ |
| 9.1.9 | Soft-deleted stock | Same omission as §7.3.7 — removed locations still contribute to "on hand here". Confirm | ☐ |
| 9.1.10 | Cross-org barcode | A barcode that exists only in workspace B is **not found** from A | ☐ |

### 9.2 `/kiosk`
| # | Case | Expected | Result |
|---|---|---|---|
| 9.2.1 | Wallboard renders | Readable across a room; header names the facility or "All facilities" | ☐ |
| 9.2.2 | Auto refresh | Refreshes every 60 s without interaction | ☐ |
| 9.2.3 | Wake lock | Screen stays awake where supported; silently skipped where not (Safari/Firefox desktop) | ☐ |
| 9.2.4 | Realtime | A scan elsewhere updates the board | ☐ |
| 9.2.5 | Empty workspace | All zeros, no crash — note there is **no empty-state copy** | ☐ |
| 9.2.6 | Facility switch mid-view | Change scope in another tab → the board follows on its next refresh | ☐ |

### 9.3 `/cycle-counts`
| # | Case | Expected | Result |
|---|---|---|---|
| 9.3.1 | Record a count, no variance | "Count recorded — no variance" | ☐ |
| 9.3.2 | Small variance | Commits; on-hand corrected; "Count recorded — adjusted by +N" | ☐ |
| 9.3.3 | Large variance | **Queued**; on-hand unchanged; "adjustment of -N queued for approval"; appears in `/settings/adjustments` | ☐ |
| 9.3.4 | Form gating | Location is disabled until a product is picked; qty until a location is; Record is disabled until all three are set | ☐ |
| 9.3.5 | Product mismatch | Change the slot's product in another tab, then submit → "Selected location holds a different product. Refresh and try again." | ☐ |
| 9.3.6 | Concurrent counts | Two operators counting the same slot are serialised under a row lock — no lost update | ☐ |
| 9.3.7 | Health KPIs | Counts on record, **Required adjustments** with "N% had variance" (or "Perfect accuracy"), Net units adjusted labelled Surplus/Shrinkage | ☐ |
| 9.3.8 | History | Capped at 100 with the footer note; **Variance only** tab filters correctly | ☐ |
| 9.3.9 | Weekly queue toggle | Requires `settings.manage`; as a member it **silently does nothing** | ☐ |
| 9.3.10 | Queue auto-complete | Counting a product that has a pending queue task marks that task complete | ☐ |
| 9.3.11 | **Not facility-scoped** | The location dropdown lists slots from **every** facility regardless of the active scope. Confirm and rate | ☐ |
| 9.3.12 | **Void a count** *(regression)* | With `cycle_counts.void`, each non-voided history row has a void control. It confirms first, flips the badge to `voided`, removes the count from accuracy stats, and **deliberately does not reverse the stock adjustment** (record a new count to correct quantity). Without the permission the control is absent | ☐ |
| 9.3.13 | Blind counts | The desk always shows the expected quantity. **Mobile does blind counts** — verify there (§19) | ☐ |

---

## 10. Lots, serials, kits & work orders

### 10.1 `/lots`
| # | Case | Expected | Result |
|---|---|---|---|
| 10.1.1 | Opt-in | A product only appears in the register picker once **lot tracking** is on for it | ☐ |
| 10.1.2 | Register a lot | Product + lot number required; optional expiry, supplier, notes. Flips `track_lots` on | ☐ |
| 10.1.3 | Expiry labels | "No expiry" / "Expired 3d ago" / "Expires today" / "Expires tomorrow" / "Expires in 12d"; ≤30 days is amber, past is red | ☐ |
| 10.1.4 | Ordering | Expiry ascending, **nulls last** | ☐ |
| 10.1.5 | Header counts | `Expiring ≤30d` and `Expired` are org-wide and alert-styled when >0 | ☐ |
| 10.1.6 | On-hand per lot | Σ received − Σ picked, floored at 0 | ☐ |
| 10.1.7 | **No uniqueness** | Register the same lot number twice for the same product → both are created. Confirm and rate | ☐ |
| 10.1.8 | Delete a lot with stock | Hard delete, **no confirmation**, no check for referencing PO/order lines. Record severity | ☐ |
| 10.1.9 | Turn tracking off | Existing lots persist in the table but vanish from the picker | ☐ |
| 10.1.10 | Boundary dates | Expiry exactly today and exactly +30 days both count as "soon" and match the header count | ☐ |

### 10.2 `/serials`
| # | Case | Expected | Result |
|---|---|---|---|
| 10.2.1 | Register in bulk | Paste serials separated by spaces/commas/newlines → deduplicated, registered | ☐ |
| 10.2.2 | Partial duplicates | "Registered N serials · M already existed" | ☐ |
| 10.2.3 | All duplicates | "All of those serials are already registered" | ☐ |
| 10.2.4 | **1 000 cap** *(regression)* | Paste 1 001 → 1 000 land and the result says so: "…· 1 not processed (1000 per submission — paste the rest separately)" | ☐ |
| 10.2.5 | Status changes | in_stock / shipped / returned / scrapped save and re-badge; `shipped` stamps a timestamp | ☐ |
| 10.2.6 | **Header counts past 500** *(regression)* | With >500 serials the `Serials / In stock / Shipped` counts are exact (head counts), while the table still shows the 500 most recent and says so | ☐ |
| 10.2.7 | Same serial, two products | Allowed (uniqueness is per product). Confirm intended | ☐ |
| 10.2.8 | No stock effect | Serial status changes do **not** alter `locations` on-hand. Confirm intended | ☐ |
| 10.2.9 | Delete | Hard delete, no confirmation | ☐ |

### 10.3 `/kits`
| # | Case | Expected | Result |
|---|---|---|---|
| 10.3.1 | Mark as kit | Toggle in the opt-in list; the card appears with "no recipe" until components are added | ☐ |
| 10.3.2 | Add components | Quantity per kit must be a positive integer | ☐ |
| 10.3.3 | Self-reference | Adding the kit to itself → "A kit can't contain itself" | ☐ |
| 10.3.4 | **Circular BOM** | A → B → A → "That would create a circular BOM (the component already contains this kit)" | ☐ |
| 10.3.5 | Duplicate component | "That component is already in this kit" | ☐ |
| 10.3.6 | Buildable maths | `min(floor(onHand / qtyPerKit))`; the limiting component is amber with a "Limiting component" tooltip | ☐ |
| 10.3.7 | Quarantined stock | Component stock that is quarantined counts as **zero** here | ☐ |
| 10.3.8 | Build | Consumes components, produces the finished good, writes scan history per leg | ☐ |
| 10.3.9 | Over-build | Build more than "Buildable now" → the whole build **rolls back** with a legible message | ☐ |
| 10.3.10 | Sub-assembly | A kit containing another kit: in stock → consumed as-is; not in stock → built recursively | ☐ |
| 10.3.11 | Concurrent builds | Two builds of the same kit at one facility are serialised by an advisory lock | ☐ |
| 10.3.12 | Remove component | Hard delete, no confirmation, no check for in-flight work orders | ☐ |

### 10.4 `/work-orders` and `/work-orders/[id]`
| # | Case | Expected | Result |
|---|---|---|---|
| 10.4.1 | Create | Kit + facility + qty ≥1. Non-kit → "That product isn't a kit"; kit with no BOM → "Define the kit's bill of materials first" | ☐ |
| 10.4.2 | No kits at all | The form is replaced by guidance pointing at the Kits page | ☐ |
| 10.4.3 | BOM snapshot | Change the kit's BOM after creating a WO → the existing WO's lines are **unchanged** | ☐ |
| 10.4.4 | Status flow | Draft → **Release** → Released → **Complete & build**; Cancel available while open | ☐ |
| 10.4.5 | Shortage banner | "Short on components at {facility}…" and the Complete button is disabled with a tooltip | ☐ |
| 10.4.6 | Shared-component netting | A component on two lines draws from one running pool — "On hand" shows true stock while "Short" reflects the netted draw | ☐ |
| 10.4.7 | Complete | Components consumed, finished good produced, "Built N units" | ☐ |
| 10.4.8 | Race | Complete from two tabs → the loser gets "This work order is already closed" | ☐ |
| 10.4.9 | Stock drained mid-flight | Drain component stock between load and submit → server re-validates and surfaces the error inline | ☐ |
| 10.4.10 | Multi-level tree | The BOM tree shows sub-assembly chips and marks cycles with "⚠ circular" | ☐ |
| 10.4.11 | Claim / release *(regression)* | A work order already claimed by someone else **cannot** be taken — only the holder can release it. Unassigned ones claim normally | ☐ |
| 10.4.12 | Quarantine is excluded end to end | For a WO whose only component stock is quarantined, the UI says "Short" **and** a crafted complete POST is refused — `app.consume_for_build` filters `is_active` and `quarantined` at every step. Verify the POST too, not just the button | ☐ |

---

## 11. Directory — suppliers & customers

### 11.1 `/suppliers` (list)
| # | Case | Expected | Result |
|---|---|---|---|
| 11.1.1 | Header | Meta `Total`; actions **Import** and **New supplier** | ☐ |
| 11.1.2 | Search | "Search by name, contact, email, phone…" with 300 ms debounce | ☐ |
| 11.1.3 | Search escaping | Query `50%`, `a_b`, `foo,bar`, `O"Brien` → no crash, sane results | ☐ |
| 11.1.4 | Inactive toggle | "Active only / Showing inactive" flips the list; archived rows carry an **Archived** chip | ☐ |
| 11.1.5 | Scorecard chips | `N POs`, `N products`, `N% on-time` (green ≥90, amber ≥70, red below), `Nd avg` | ☐ |
| 11.1.6 | Empty states | "No suppliers match your search." vs "No suppliers yet. Add your first to start tracking POs." | ☐ |

### 11.2 `/suppliers/new`, `/[id]`, `/[id]/edit`
| # | Case | Expected | Result |
|---|---|---|---|
| 11.2.1 | Create | Name required; redirects to the detail page | ☐ |
| 11.2.2 | Validation | 201-char name → "Name is too long (max 200)"; bad terms → "Invalid payment terms"; negative lead time → "Lead time must be 0 or greater" | ☐ |
| 11.2.3 | Weak email check | The server only checks for `@` — `a@b` passes. The browser's `type=email` is the stricter gate. Confirm | ☐ |
| 11.2.4 | Country field | Caps at 2 chars and force-uppercases | ☐ |
| 11.2.5 | Detail page | Contact / Address / Commercial / Notes cards, last 10 POs, total PO count | ☐ |
| 11.2.6 | Deactivate | Confirm dialog, then the supplier stops appearing in PO pickers while existing POs are preserved | ☐ |
| 11.2.7 | **Member deactivate** | As a member without `suppliers.manage`, click OK on the confirm → the spinner runs and **nothing happens, with no message**. Record | ☐ |
| 11.2.8 | Ungated form | `/suppliers/new` renders fully for a member and only fails on submit | ☐ |
| 11.2.9 | Cross-org id | 404 | ☐ |

### 11.3 `/customers` (list)
| # | Case | Expected | Result |
|---|---|---|---|
| 11.3.1 | Header + search | Meta `Total`; **Import** and **New customer**; "Search by name, company, email, phone…" | ☐ |
| 11.3.2 | Individual vs business | Rows distinguish the two | ☐ |
| 11.3.3 | Inactive toggle | Works as on suppliers | ☐ |

### 11.4 `/customers/new`, `/[id]`, `/[id]/edit`
| # | Case | Expected | Result |
|---|---|---|---|
| 11.4.1 | Type switch | Individual ↔ Business relabels "Full name"/"Contact name" and shows Company only for Business | ☐ |
| 11.4.2 | Business validation | Business with no company name → "Company name is required for business customers" | ☐ |
| 11.4.3 | Numeric validation | Discount 120 → "Discount must be 0–100"; negative credit limit → "Credit limit must be 0 or greater". Note garbage in Discount becomes **0** silently client-side | ☐ |
| 11.4.4 | **Orders panel** | Empty for hand-created orders (finding C). **Load sample data** (§6.4) → the sample customers' Orders panel is populated. Confirm both halves | ☐ |
| 11.4.5 | Deactivate | Same silent-failure pattern as suppliers (11.2.7) | ☐ |

### 11.5 `/suppliers/import` and `/customers/import`
| # | Case | Expected | Result |
|---|---|---|---|
| 11.5.1 | Same workbench | Check → Import, file or paste, "Update existing" toggle, 1 000-row / 5 MB caps — identical to §7.4 | ☐ |
| 11.5.2 | Keyed by name | Matching is **case-insensitive**: "Acme" and "ACME" collide within a file ("Duplicate name within this file") | ☐ |
| 11.5.3 | Existing names | Skipped with "Already in your directory — skipped…", or updated with the toggle on | ☐ |
| 11.5.4 | Payment-terms aliases | `Net 30`, `NET30`, `n30`, `30`, `due on receipt`, `COD` all map correctly; `Net 45` → "must be one of: COD, Due on receipt, Net 15, Net 30, Net 60, Net 90" | ☐ |
| 11.5.5 | Email validation | Supplier/customer imports use a **real email regex** (unlike the form) → `not-an-email` is rejected with its row number | ☐ |
| 11.5.6 | Customer type inference | A row with a Company but no Type is imported as **business** | ☐ |
| 11.5.7 | Discount bounds | `120` → "Discount % must be between 0 and 100" | ☐ |
| 11.5.8 | Archived match | A name that exists but is archived is updated/skipped **without reactivating**. Confirm intended | ☐ |
| 11.5.9 | Permissions | Members without `suppliers.manage` / `customers.manage` get a clear refusal | ☐ |
| 11.5.10 | Templates | `/api/import-template/suppliers` and `/customers` round-trip cleanly (upload the template unchanged) | ☐ |

---

## 12. Purchasing & inbound

### 12.1 `/purchase-orders` (list)
| # | Case | Expected | Result |
|---|---|---|---|
| 12.1.1 | Status chips | All / Draft / Sent / **Partial** / **Received** / Cancelled with counts; meta `Total` and `Open` | ☐ |
| 12.1.2 | Expected-date labels | Today / Tomorrow / Yesterday / `In Nd` / **`Nd overdue`** / date | ☐ |
| 12.1.3 | Auto-draft toggle | Flips `Auto-draft · On/Off` with a live dot; drives the cron | ☐ |
| 12.1.4 | **Draft from low-stock** | Groups by preferred supplier → one PO per supplier, with AI "why" reasoning per line. One supplier → redirects straight to that PO | ☐ |
| 12.1.5 | Nothing low | Banner: "All SKUs are at or above their reorder points — no PO drafted." | ☐ |
| 12.1.6 | As a **member** | Both the toggle and Draft-from-low-stock **silently do nothing** | ☐ |

### 12.2 `/purchase-orders/new`
| # | Case | Expected | Result |
|---|---|---|---|
| 12.2.1 | No suppliers | The form is replaced by "Add a supplier first" + a link to Suppliers | ☐ |
| 12.2.2 | Create draft | Status `draft`, number `PO-2049`+ | ☐ |
| 12.2.3 | Validation | Missing supplier/facility/lines each get their own message; a product id from another org → "One or more line items reference an unknown product" | ☐ |
| 12.2.4 | **Cost snapshot** | Create a PO, then change the product's unit cost → the PO line keeps the **original** cost | ☐ |
| 12.2.5 | Line-insert failure | No orphan PO is left behind | ☐ |

### 12.3 `/purchase-orders/[id]`
| # | Case | Expected | Result |
|---|---|---|---|
| 12.3.1 | Draft state | Receive controls are **hidden**; "Mark as sent" is available | ☐ |
| 12.3.2 | Mark as sent | Status `sent`; receive controls appear. A second click is idempotent (no re-stamp, no error) | ☐ |
| 12.3.3 | Partial receipt | Status `partially_received`; remaining recalculated; stats update | ☐ |
| 12.3.4 | **Over-receipt rejected** | "Can't receive X — only Y remaining on this line" | ☐ |
| 12.3.5 | Concurrent receipt | Second browser gets "This line was just received by someone else — refresh and retry so the counts don't collide." | ☐ |
| 12.3.6 | **Receipt ≠ stock** (finding B) | After a plain receipt, `/inventory` still shows **0 on hand** — confirm the on-page notice explains it well enough that a customer wouldn't file a bug. The receipt **does** now write a `receive` entry to activity (regression: only QC-held receipts used to) | ☐ |
| 12.3.7 | Lot capture | Entering a lot number creates the `lots` row, backfills expiry, and flips the product to `track_lots` | ☐ |
| 12.3.8 | **QC hold** | Creates a **quarantined** pseudo-slot (bay 1 / level 1, no section) and the line appears in `/receiving`. On-hand **does** rise | ☐ |
| 12.3.9 | Landed cost | `$1,234.56` parses; `abc` → "Landed cost must be a non-negative number" | ☐ |
| 12.3.10 | Slotting hints | Open lines show "Suggested slot {label} · {reason}" when a layout exists | ☐ |
| 12.3.11 | Fill backorders | Panel shows "Fill X of Y backordered units across Z orders (oldest first)"; the button requires **`orders.allocate`**, not a purchasing permission | ☐ |
| 12.3.12 | Cancel PO | Receive controls disappear | ☐ |
| 12.3.13 | **Cancel a received PO** *(regression)* | A crafted POST against a `fully_received` PO changes nothing — only draft / sent / partially_received can be cancelled | ☐ |
| 12.3.14 | Zero-line PO | A PO whose lines were all deleted flips to `fully_received` with 0 units. Record | ☐ |

### 12.4 `/purchase-orders/[id]/print`
| # | Case | Expected | Result |
|---|---|---|---|
| 12.4.1 | Clean paper doc | Meta, parties, line table with unit cost and line totals, signature block; Save-as-PDF works | ☐ |
| 12.4.2 | Quoted vs landed | Uses **quoted `unit_cost` only** — a PO received at a different landed cost still prints the quote | ☐ |
| 12.4.3 | Line order | Lines print in a stable order (regression: ordering on a non-existent column once emptied the table) | ☐ |
| 12.4.4 | Cross-org id | 404 | ☐ |

### 12.5–12.7 Inbound / ASNs
| # | Case | Expected | Result |
|---|---|---|---|
| 12.5.1 | KPIs | Open ASNs, **Units inbound** (open only), Received all-time | ☐ |
| 12.5.2 | ASN from PO | Copies **only outstanding** lines at their remaining quantity | ☐ |
| 12.5.3 | Fully-received PO | Clicking "ASN from PO" on a PO that was completed in another tab **silently does nothing**. Record | ☐ |
| 12.5.4 | PO list cap | More than 50 open POs → "Showing the 50 most recent open POs" | ☐ |
| 12.6.1 | Create manually | At least one line with a product **or** a name and qty > 0; supplier and facility are optional | ☐ |
| 12.6.2 | Unknown product id | **Silently dropped to null** (the free-text name carries the line) — unlike POs, which reject. Record | ☐ |
| 12.7.1 | Pallet grouping | Lines group into "Pallet {lpn}" sections plus a loose group | ☐ |
| 12.7.2 | Receive a line | Quantity defaults to remaining; the parent PO's counts and status update | ☐ |
| 12.7.3 | **Over-receipt is rejected** *(regression)* | Typing more than remaining now errors like the PO path: "Can't receive X — only Y remaining on this line". Whole-pallet receive still takes all remaining per line (it has no quantity to get wrong) | ☐ |
| 12.7.4 | Receive a pallet | Every line on that LPN is received at full remaining | ☐ |
| 12.7.5 | Line then pallet | Receive one line, then the pallet → only the remainder is taken | ☐ |
| 12.7.6 | **Atomic receipt** *(regression)* | Two concurrent receives of the same ASN line → the loser is told to refresh, and no double count lands. Then the harder case: receive the **same PO line** from `/inbound/{id}` and `/purchase-orders/{id}` at the same moment → both increments must survive (the PO-side write used to be lost). Compare the PO line total against the sum of what was received | ☐ |
| 12.7.7 | **Receive against a cancelled ASN** *(regression)* | A crafted POST against a cancelled (or already fully received) ASN is refused before any write, and its status is unchanged | ☐ |
| 12.7.8 | ASN lot number *(regression)* | Receiving an ASN line carrying a lot number find-or-creates the `lots` row and flips the product to `track_lots`, like the PO path. The `lot_id` is stored on the ASN line **and** on the PO line when there is one — so it works for a **standalone** ASN too. Verify the lot then appears in `/lots` and carries a FEFO badge on a wave. Receiving the same line again without a lot must not clear the linkage | ☐ |

### 12.8 `/receiving` (QC queue)
| # | Case | Expected | Result |
|---|---|---|---|
| 12.8.1 | Queue | Held lines with units, lot, PO and supplier; KPIs Lines on hold / Units quarantined / Recent failures | ☐ |
| 12.8.2 | **QC pass** | Quarantine cleared; the stock enters ATP and becomes pickable | ☐ |
| 12.8.3 | **QC fail** | The location is deactivated (soft-deleted); flagged for vendor return | ☐ |
| 12.8.4 | Error surfacing (regression) | Force a failure → `/receiving?error=…` renders a visible banner (it used to swallow errors silently) | ☐ |
| 12.8.5 | Double review | A second pass/fail on the same line **silently no-ops** (guarded on `qc_status = hold`) | ☐ |
| 12.8.6 | No decision | Submitting without clicking PASS or FAIL does nothing | ☐ |
| 12.8.7 | Held line with no stock | QC-hold on a PO with no facility creates no quarantined location → "pass" does nothing. Confirm the edge case | ☐ |
| 12.8.8 | Quarantine exclusions | While held, the units must be excluded from ATP, pick slots, work-order buildable, restock destinations — but **included** in valuation and on-hand | ☐ |
| 12.8.9 | Facility scope | Scoped through the parent PO's warehouse when a single facility is selected | ☐ |

---

## 13. Outbound & floor fulfilment

> ⚠️ **Finding A governs this section.** Without the mobile app you can reach `in_progress` and no further. **[MOBILE]** marks cases needing §19.

### 13.1–13.2 Orders list and creation
| # | Case | Expected | Result |
|---|---|---|---|
| 13.1.1 | Status chips | All / Created / Picking / Staged / Ready / In transit / Complete / Cancelled with counts | ☐ |
| 13.1.2 | Label mapping | `pick_list_assigned` → **"Assigned"**, `in_progress` → **"Picking"**, `out_for_delivery` → **"In transit"** | ☐ |
| 13.1.3 | Bad filter | `?status=bogus` falls back to "All" silently | ☐ |
| 13.2.1 | Empty catalog | The form is replaced by "Add a product first" | ☐ |
| 13.2.2 | Create order | Number `ORD-1049`+, auto-allocated | ☐ |
| 13.2.3 | Validation | Missing customer name on `installer_job`/`customer_pickup`; transfer with identical source and destination — both rejected with specific messages | ☐ |
| 13.2.4 | **Kit explosion** | Ordering a kit writes **component** lines, not the kit line, at `component qty × ordered qty`; duplicate components across lines are **merged** | ☐ |
| 13.2.5 | Kit with empty BOM | Passes through as the kit product itself | ☐ |
| 13.2.6 | One level only | A component that is itself a kit is **not** recursed | ☐ |
| 13.2.7 | Allocation failure is swallowed | If allocation fails, the order is still created (console-only error). Confirm the UI isn't misleading | ☐ |
| 13.2.8 | Cross-org product | A product id from another workspace is **not** validated here (unlike POs). Test and record | ☐ |

### 13.3 `/orders/[id]`
| # | Case | Expected | Result |
|---|---|---|---|
| 13.3.1 | Timeline | 7 steps Created → Assigned → Picking → Staged → Ready → In transit → Complete | ☐ |
| 13.3.2 | Advance | Button label matches the next step ("Assign pick list", "Start picking", …) | ☐ |
| 13.3.3 | **No step skipping** | Status is re-read server-side, so a stale tab or a double-click cannot skip a step | ☐ |
| 13.3.4 | **Staging gate** | "Mark staged" is blocked until `picked ≥ allocated`, with the exact counts in the message | ☐ |
| 13.3.5 | Nothing allocated | Advancing from `in_progress` with zero allocated → "Nothing is allocated to pick yet — allocate stock before staging." | ☐ |
| 13.3.6 | **Oversell prevention** | Allocation caps at available; the remainder becomes a **backorder** | ☐ |
| 13.3.7 | **Concurrent allocation** | Two simultaneous orders for one SKU — combined allocation **never exceeds on-hand** (advisory lock) | ☐ |
| 13.3.8 | Quarantined-only SKU | Allocates 0 and shows a full backorder | ☐ |
| 13.3.9 | Re-allocate | Appears only when backordered > 0; requires **`orders.allocate`** | ☐ |
| 13.3.10 | Cancel order | Allocation released to ATP | ☐ |
| 13.3.11 | Cancel after pick **[MOBILE]** | Allocation clamps **down to picked**, not to zero; picked units stay reserved | ☐ |
| 13.3.12 | Cancel a completed order | Refused with "This order can no longer be cancelled." | ☐ |
| 13.3.13 | Transfer banner | Transfers show the "picking removes stock from source; place it at the destination manually" notice | ☐ |
| 13.3.14 | Cross-org id | This page has **no explicit org filter** (RLS only) — paste another workspace's order id and confirm it is denied | ☐ |

### 13.4–13.5 Packing slip and backorders
| # | Case | Expected | Result |
|---|---|---|---|
| 13.4.1 | Packing slip | Shows Qty ordered and Qty picked, parties, signature lines — and **no prices anywhere** | ☐ |
| 13.4.2 | SKU fallback | `internal_sku → barcode → "—"` | ☐ |
| 13.5.1 | Backorders | Three KPIs; table lists shorted lines **oldest order first** with an Age column | ☐ |
| 13.5.2 | No fill button here | Filling lives on PO detail (§12.3.11) — confirm the page explains that | ☐ |
| 13.5.3 | RPC failure | Forcing an error renders the Next error boundary, not an inline message. Record | ☐ |

### 13.6–13.8 Picking
| # | Case | Expected | Result |
|---|---|---|---|
| 13.6.1 | **Scope requirement** | Under "All facilities" the build section is replaced by an explanatory banner; existing waves still list | ☐ |
| 13.6.2 | Eligibility | Only open orders with no wave and `Σ max(0, allocated − picked) > 0` appear | ☐ |
| 13.6.3 | Build wave | From selected, or **Auto-build from all** | ☐ |
| 13.6.4 | Deselect everything | Clicking build with nothing checked does nothing, **with no message**. Record | ☐ |
| 13.6.5 | **No empty waves** *(regression)* | Build a wave, then auto-build again → no wave is created (the empty one is rolled back), and the queue is not littered | ☐ |
| 13.7.1 | Zoning | Grouped by pick zone, ordered by distance from the door; slots read `{SECTION}-{bay}-{level}` | ☐ |
| 13.7.2 | FEFO badge | Lot-tracked lines carry the first-expiring lot chip | ☐ |
| 13.7.3 | Unlocated tasks | Roll into an "Unlocated" zone with the footer warning "{N} tasks have no placed stock — locate them before picking." | ☐ |
| 13.7.4 | Quarantine excluded | Pick slots never include quarantined stock | ☐ |
| 13.7.5 | Claim / release *(regression)* | A wave already claimed by another picker **cannot** be taken; only the holder can release it | ☐ |
| 13.7.6 | Cancel wave | Orders return to the eligible pool (`pick_wave_id` cleared) | ☐ |
| 13.7.7 | Complete wave **[MOBILE]** | Blocked until everything allocated is picked, with the exact counts | ☐ |
| 13.7.8 | Complete keeps orders | Completing does **not** detach orders (only cancelling does) | ☐ |
| 13.7.9 | Empty wave completes freely | A wave whose orders were all removed completes with no gate. Record | ☐ |
| 13.7.10 | No dock element | A facility with no door/staging element collapses zone ordering to insertion order. Confirm it doesn't crash | ☐ |
| 13.8.1 | Pick list print | Clean paper doc with checkboxes, locations, barcodes, lot annotations and signatures | ☐ |

### 13.9 `/transfers`
| # | Case | Expected | Result |
|---|---|---|---|
| 13.9.1 | List | Route column shows `source → destination`; meta `Open` and `In transit` | ☐ |
| 13.9.2 | Relabelled statuses | `created`/`pick_list_assigned` → **Preparing**, `ready` → **Ready to ship**, `out_for_delivery` → **In transit**, `complete` → **Received** | ☐ |
| 13.9.3 | **Stock does not move automatically** | Complete a transfer end-to-end → destination on-hand is **unchanged** until you place it manually. Confirm the UI says so | ☐ |
| 13.9.4 | **Not facility-scoped** | Transfers from every facility always appear here, unlike every other list. Record the inconsistency | ☐ |

### 13.10 `/returns`
| # | Case | Expected | Result |
|---|---|---|---|
| 13.10.1 | Create a return **[MOBILE prereq]** | The panel on `/orders/[id]` appears only when `picked > 0`; qty is capped at picked minus already-returned | ☐ |
| 13.10.2 | Cap enforcement | Two returns summing to exactly `picked`, then a third → "That line has already been fully returned" | ☐ |
| 13.10.3 | Cancelled order | "Cancelled orders can't have returns" | ☐ |
| 13.10.4 | Lands pending | New returns are `hold_for_inspection` with "Pending review" and **move no stock** | ☐ |
| 13.10.5 | Review | Disposition + note (max 500). Reviewable **once**; a second attempt is silently ignored | ☐ |
| 13.10.6 | Restock | Destination options are slots already holding that product, else empty slots. Stock returns to on-hand and the message names the new quantity | ☐ |
| 13.10.7 | Restock guards | Quarantined/inactive destination → "Destination location is inactive or quarantined"; wrong facility → "Destination must be in the facility the return was received at"; a slot holding a different product → refused | ☐ |
| 13.10.8 | **Partial restock** | Restocking fewer than the returned units **closes the return permanently — the remainder can never be restocked**. Record severity | ☐ |
| 13.10.9 | Concurrent restock | Row lock → the loser gets "This return was already restocked" | ☐ |
| 13.10.10 | No eligible location | The select is empty and the submit stays disabled. Confirm it's understandable | ☐ |

---

## 14. Analytics & reports

> Most of this needs **history**. Forecast wants ~90 days of pick/adjust scans; valuation wants unit costs; sparklines want ≥2 nightly snapshots. Use the seed script (§1.6) — sample data's 14 days is not enough.

### 14.1 `/analytics` (index)
| # | Case | Expected | Result |
|---|---|---|---|
| 14.1.1 | KPIs | Products, Units here/on hand, Scans today, Scans 7d | ☐ |
| 14.1.2 | Header meta is true *(regression)* | The fabricated "Last sync: Just now" is gone; the header now names the facility (or "All facilities"), which is a fact | ☐ |
| 14.1.3 | Flat sparklines | Products/Units sparks are deliberate placeholders — **not a bug** | ☐ |
| 14.1.4 | Action mix | Per-action bars with counts and percentages | ☐ |
| 14.1.5 | **>1 000 scans** *(regression)* | On the seeded workspace, the action-mix percentages and the "Where units live" distribution now come from SQL aggregates and **must reconcile exactly** with the KPI totals above them. The 14-day trend shares the Overview RPC, so both pages must draw the same curve | ☐ |
| 14.1.6 | AI summary banner | Renders nothing (no error) if the edge function isn't deployed or `ANTHROPIC_API_KEY` isn't a Supabase secret. **Record which state you're in** | ☐ |
| 14.1.7 | Empty workspace | "No analytics data yet" / "No activity at {facility} yet" | ☐ |

### 14.2 `/analytics/dead-stock`
| # | Case | Expected | Result |
|---|---|---|---|
| 14.2.1 | Definition | Products with on-hand > 0 and **no pick scan** within the threshold | ☐ |
| 14.2.2 | Controls | Threshold 60/90/180/365 (default 90) and sort by value/quantity/days; both are links so the state is **shareable and back-button safe** | ☐ |
| 14.2.3 | Bad params | `?threshold=abc`, `?threshold=45`, `?sort=;drop` all fall back silently | ☐ |
| 14.2.4 | Never picked | Shows "365+ days" and "no recent activity" | ☐ |
| 14.2.5 | Missing costs | Tied value shows `—` and is excluded from the KPI, which carries an "N SKUs missing cost" delta | ☐ |
| 14.2.6 | **Whole-catalog analysis** *(regression)* | With >500 dormant SKUs the three summary KPIs cover the **entire** dormant set, the table shows the top 500 **by the sort you picked** (change the sort and the rows change), and the notice states the real numbers | ☐ |
| 14.2.7 | Warehouse filter | A product with stock only in another facility drops out | ☐ |
| 14.2.8 | Empty state | "No dead stock" / "Every product with on-hand inventory has been picked within the last N days. Healthy." | ☐ |

### 14.3 `/analytics/forecast`
| # | Case | Expected | Result |
|---|---|---|---|
| 14.3.1 | Header | "90-day window · 95% service level" | ☐ |
| 14.3.2 | Drifted SKUs | Listed with current vs suggested reorder point, sorted by impact; the table caps at 50 while the KPIs count all | ☐ |
| 14.3.3 | Seasonality chip | Appears only with ≥28 days of data, all 7 weekdays observed, and enough variation | ☐ |
| 14.3.4 | **Apply RBAC** (regression — was ungated) | The Apply control renders **only** with `inventory.manage`. As a member it is an em-dash, and a **crafted POST changes nothing** | ☐ |
| 14.3.5 | Apply writes | Reorder point and safety stock update; the row disappears on refresh | ☐ |
| 14.3.6 | 30-minute cache | Adding scans does not change the numbers immediately — expected | ☐ |
| 14.3.7 | Empty state | "Reorder points look well-tuned" | ☐ |

### 14.4 `/analytics/slotting`
| # | Case | Expected | Result |
|---|---|---|---|
| 14.4.1 | Suggested moves | Scored with readable reasons ("Fast mover stuck in the back", "Wrong category section", …) | ☐ |
| 14.4.2 | No layout | "No layout to slot against" | ☐ |
| 14.4.3 | No dock door | In-page warning that proximity scoring is skipped | ☐ |
| 14.4.4 | Apply a move | Real stock move + a **MOV** entry in recent activity | ☐ |
| 14.4.5 | Error paths | "Stock has moved — refresh the report and try again", "over its capacity of N", "Bay exceeds section maximum of N", "Target section is in a different facility" | ☐ |
| 14.4.6 | Double apply | Two tabs applying the same suggestion → the second says stock has moved | ☐ |
| 14.4.7 | All-facilities scope | Produces one report per facility with summed KPIs | ☐ |

### 14.5 `/analytics/valuation`
| # | Case | Expected | Result |
|---|---|---|---|
| 14.5.1 | KPIs | Inventory value, FIFO value, Units on hand, Avg unit cost, **Turnover / yr** with a "Nd on hand" delta | ☐ |
| 14.5.2 | Method | Value = **current unit cost × on-hand** (explicitly not weighted average). The notice explains this | ☐ |
| 14.5.3 | Missing costs | "N SKUs with stock have no unit cost and are excluded from value…" and Avg unit cost divides by **valued** units only | ☐ |
| 14.5.4 | FIFO layers | Computed from received PO lines; units beyond receipt history get a "N units w/o receipts" chip | ☐ |
| 14.5.5 | ABC classes | Cumulative-before thresholds: <80% = A, <95% = B, else C. A single SKU worth 90% of value is **A**, and everything after it is B/C | ☐ |
| 14.5.6 | Aging buckets | 0–30 / 31–90 / 91–180 / 180+; never-moved lands in the last bucket | ☐ |
| 14.5.7 | No costs at all | "Nothing to value yet" | ☐ |
| 14.5.8 | CSV export | Downloads; see §17.4 for the injection and numeric checks | ☐ |

### 14.6 `/reports` and `/reports/[id]`
| # | Case | Expected | Result |
|---|---|---|---|
| 14.6.1 | Build a report | Name (max 80) + dataset + ≥1 column. Build one on **each** of the three datasets: Inventory, Stock movements, Orders | ☐ |
| 14.6.2 | Validation | Blank name → "Name your report"; zero columns → "Pick at least one column" | ☐ |
| 14.6.3 | Dataset switch | Changing the dataset re-renders columns and filters without losing the form | ☐ |
| 14.6.4 | Filters | Inventory `low_only` + `category contains`; Movements `action` + `since`/`until`; Orders `status` + `order_type` | ☐ |
| 14.6.5 | Preview cap | 500 rows with "Showing the first 500 rows. Export CSV for the full set." | ☐ |
| 14.6.6 | Facility scope | Comes from the active-facility cookie, not a URL param; the export link carries it | ☐ |
| 14.6.7 | **Date boundaries are UTC** | A `since`/`until` filter uses UTC midnight, so a local-timezone tester sees boundary rows shift. Confirm and record | ☐ |
| 14.6.8 | **Orders export totals** *(regression)* | Export an Orders report covering many orders — line items are now paged, so requested/allocated/picked must match the order detail pages. Verify against the seeded workspace | ☐ |
| 14.6.9 | Members can build | `reports.manage` is a member default — a member can create, export **and delete** reports | ☐ |
| 14.6.10 | **Delete confirms** *(regression)* | Delete asks first; cancelling keeps the report | ☐ |
| 14.6.11 | Cross-org id | 404 | ☐ |

---

## 15. Integrations, public API & automation

### 15.1 `/integrations`
| # | Case | Expected | Result |
|---|---|---|---|
| 15.1.1 | Grid | 14 providers; meta "Connected: N", "Available: 14" | ☐ |
| 15.1.2 | Only 4 are real | Slack, Webhooks, Resend, Shopify are connectable; the other 10 show "Not yet available" | ☐ |
| 15.1.3 | Synthetic webhooks card | Appears as "connected" when ≥1 endpoint is active; pausing every endpoint moves it back to Available | ☐ |
| 15.1.4 | Header copy is true *(regression)* | The copy now says most connections are OAuth and that pasted keys, webhook URLs and signing secrets are stored encrypted at rest and never shown again — which matches what Slack, Resend and Webhooks actually do | ☐ |
| 15.1.5 | As a **member** | Requires `integrations.manage` — configuring should be blocked | ☐ |

### 15.2 `/integrations/[provider]` — Slack
| # | Case | Expected | Result |
|---|---|---|---|
| 15.2.1 | Connect | Paste a real incoming-webhook URL → saves **and fires a live test message** | ☐ |
| 15.2.2 | Bad URL | A non-`hooks.slack.com/services/` URL is rejected with a specific message | ☐ |
| 15.2.3 | Blank URL when connected | Rejected — you cannot accidentally wipe the stored secret | ☐ |
| 15.2.4 | Test failure | "Saved, but test message failed: …" and the status flips to Errored | ☐ |
| 15.2.5 | Re-test | "Send test message" reports success or the error | ☐ |
| 15.2.6 | Disconnect | Confirm dialog, row deleted, back to `/integrations` | ☐ |
| 15.2.7 | Unknown provider | `/integrations/nonsense` → 404 | ☐ |

### 15.3 `/integrations/resend`
| # | Case | Expected | Result |
|---|---|---|---|
| 15.3.1 | Key format | Must start `re_` → otherwise a specific message | ☐ |
| 15.3.2 | From-address | Accepts `name@domain` and `Display Name <name@domain>`; anything else is rejected with the exact format string | ☐ |
| 15.3.3 | Live test | Saving sends a test email **to your own address** | ☐ |
| 15.3.4 | Unverified domain | "Saved, but test send failed: … Check that your from-domain is verified in Resend." | ☐ |
| 15.3.5 | Edit without re-pasting | The stored key is reused | ☐ |
| 15.3.6 | **Re-test is gated** *(regression)* | As a member without `integrations.manage`, re-test returns "Only admins can configure integrations". Same for the Shopify test and the webhook delivery log | ☐ |

### 15.4 Shopify
| # | Case | Expected | Result |
|---|---|---|---|
| 15.4.1 | Connect | Shop domain → OAuth; `?ok=1` on return | ☐ |
| 15.4.2 | Error codes | Exercise `invalid_shop`, `hmac_invalid`, `state_expired`, `token_exchange_failed` — each renders a banner, not a stack trace | ☐ |
| 15.4.3 | Replay the callback | A reused callback URL is rejected (state expiry) | ☐ |
| 15.4.4 | **Config overwrite** | After connecting, confirm `config.scopes`, `shop_domain` and `webhook_ids` are all present — the callback writes `default_facility_id` by re-spreading a stale config object. Record if anything is lost | ☐ |
| 15.4.5 | Webhook receiver | A tampered HMAC → 401; an unknown shop domain → **200 "OK"** (so Shopify stops retrying); a duplicate id → 200 "OK (duplicate)" | ☐ |
| 15.4.6 | Order ingestion | `orders/create` lands an order with `source = shopify` | ☐ |
| 15.4.7 | Unmapped lines | The banner links to `/integrations/shopify/mapping` with a count | ☐ |
| 15.4.8 | Map & merge | Reassigns flagged lines onto the target and deletes the stub **only if nothing else references it** | ☐ |
| 15.4.9 | **Keep as new** *(regression)* | Give the stub a note first, then confirm it — your note survives and the marker is appended, not substituted. Confirming twice does not duplicate the marker | ☐ |
| 15.4.10 | Gate divergence | `/api/integrations/shopify/connect` checks **role**, while the server action checks `integrations.manage`. An admin with that permission stripped gets different answers from the two paths. Record | ☐ |
| 15.4.11 | Disconnect | Confirm dialog; Shopify-side webhooks removed best-effort | ☐ |
| 15.4.12 | No keys | Without `SHOPIFY_API_KEY`/`SECRET`, the page degrades with a clear message | ☐ |

### 15.5 `/integrations/webhooks`
| # | Case | Expected | Result |
|---|---|---|---|
| 15.5.1 | Create endpoint | HTTPS URL + ≥1 event; the signing secret is shown **exactly once** | ☐ |
| 15.5.2 | **SSRF guard** | Reject every one of: `http://…`, `https://localhost/x`, `https://127.0.0.1`, `https://[::1]/`, `https://169.254.169.254/` (cloud metadata), a hostname resolving to `10.x` | ☐ |
| 15.5.3 | DNS rebinding | Delivery pins the socket to the vetted IP — a rebinding host cannot redirect the request | ☐ |
| 15.5.4 | Test delivery | Arrives with `X-Nautilus-Event`, `X-Nautilus-Delivery`, `X-Nautilus-Timestamp`, `X-Nautilus-Signature` | ☐ |
| 15.5.5 | Signature | HMAC-SHA256 of the **raw body** with your secret matches `sha256=<hex>` | ☐ |
| 15.5.6 | Real event | Receive a PO → `po_received` delivered; record a variance → `cycle_count_variance` delivered | ☐ |
| 15.5.7 | **Dead events removed** *(regression)* | `scan_burst` and `daily_summary` are no longer offered in any picker (Slack, Resend, webhooks) — only events that can actually fire. An endpoint that already stored one still renders its label rather than a raw slug | ☐ |
| 15.5.8 | Retry ladder | Point at a 500 → backoff 15m / 1h / 4h / 12h, give up at 5 attempts; the **original delivery id** is reused | ☐ |
| 15.5.9 | Retry drops | Pause an endpoint or unsubscribe the event → pending retries are dropped, not sent | ☐ |
| 15.5.10 | URL is immutable | Editing an endpoint changes name and events only — a URL change needs delete + recreate. Confirm that's clear | ☐ |
| 15.5.11 | Pause / resume / delete | Behave as labelled; delete confirms first | ☐ |

### 15.6 Billing & Stripe (see also §16.6)
| # | Case | Expected | Result |
|---|---|---|---|
| 15.6.1 | Unconfigured | Grey "Billing isn't configured" banner naming the missing env vars; no plan picker | ☐ |
| 15.6.2 | Test mode checkout | `4242 4242 4242 4242` with `stripe listen --forward-to <app>/api/webhooks/stripe` → the subscription appears | ☐ |
| 15.6.3 | Return before the webhook | "Checkout complete — your subscription will update here once Stripe confirms it." | ☐ |
| 15.6.4 | Webhook unconfigured | POST returns **503** | ☐ |
| 15.6.5 | Bad signature | 400 "Signature verification failed" | ☐ |
| 15.6.6 | Missing org metadata | A subscription event without `metadata.org_id` is **silently ignored**. Record | ☐ |
| 15.6.7 | **Subscription updates apply** *(regression)* | Complete a checkout, then change the plan and cancel it in Stripe. Each event must be reflected on `/settings/billing`. ⚠️ Before the fix the handler probed a column that does not exist, so **every event after the first was silently dropped** — a cancelled customer kept their plan. Verify status, seats and period end all track Stripe | ☐ |
| 15.6.8 | **Tier limits are marketing only** | "Up to 2 facilities, 1k SKUs" is **not enforced anywhere**. Confirm before any sales conversation | ☐ |

### 15.7 Public API `/api/v1/*`
Get a key from `/settings/api-keys`. Windows: use **`curl.exe`** (PowerShell aliases `curl`).

```bash
curl.exe -i -H "Authorization: Bearer YOUR_KEY" https://app.nautilusinventory.com/api/v1/products
```

| # | Case | Expected | Result |
|---|---|---|---|
| 15.7.1 | GET `/products` | 200 + JSON | ☐ |
| 15.7.2 | GET `/inventory` | 200; products with no locations are **absent**, not `on_hand: 0`; quarantined units excluded | ☐ |
| 15.7.3 | POST `/scans` | **201** `{data:{id}}` | ☐ |
| 15.7.4 | No / bad / revoked key | Uniform `401 {"error":"Invalid or missing API key"}` | ☐ |
| 15.7.5 | **Scope enforcement** | A `product:read`-only key POSTing a scan → **403** `{"error":"Missing scope: scan:write","required_scope":"scan:write"}` | ☐ |
| 15.7.6 | Scope happy path | The same key against `GET /products` → **200** | ☐ |
| 15.7.7 | Inventory scope | A key without `location:read` against `/inventory` → 403 naming `location:read` | ☐ |
| 15.7.8 | **Two gates are distinguishable** | A `scan:write` key whose **issuer** lacks `inventory.adjust` → 403 naming the *permission*, not the scope | ☐ |
| 15.7.9 | Scan validation | Malformed JSON → 400; missing `product_id` → 400; `action=register` → 400 "Unsupported action" (only locate/pick/receive/return/adjust/putaway/transfer are allowed); `quantity` beyond ±1 000 000 → 400 | ☐ |
| 15.7.10 | Cross-org | A product or warehouse id from another workspace → 404, never a write | ☐ |
| 15.7.11 | **Cross-org isolation** | Workspace A's key must return zero workspace-B rows. **S1 if it leaks** | ☐ |
| 15.7.12 | Key inheritance | Remove the key's creator from the org → the key goes inert (401) | ☐ |
| 15.7.13 | Rate limit | 130 requests in 60 s → `429` + `Retry-After` after 120. ⚠️ No `X-RateLimit-*` headers | ☐ |
| 15.7.14 | Limit clamp | `?limit=9999` → clamped to 500; **no pagination beyond it** | ☐ |
| 15.7.15 | Audit attribution | A scan posted by a key is attributed to the key's **issuer**, not to "system" | ☐ |
| 15.7.16 | `/inventory` totals *(regression)* | On a workspace with >1 000 location rows the per-product totals are now complete (paged server-side). Cross-check one SKU against its detail page. A failed page returns 500 rather than a short 200 | ☐ |
| 15.7.17 | **Expired trial** | A valid key from a workspace whose trial has ended → **402** `{"error":"This workspace's free trial has ended…","code":"trial_ended","trial_ended_at":"…"}` on all three endpoints, **before** any scope check. Back to 200 as soon as the workspace has an `active` subscription | ☐ |

### 15.8 Cron jobs
All are **POST-only** with `Authorization: Bearer $CRON_SECRET`. Verification is constant-time and **fail-closed** (an unset secret 401s everything).

```bash
curl.exe -i -X POST https://app.nautilusinventory.com/api/cron/stockout-alerts -H "Authorization: Bearer YOUR_CRON_SECRET"
```

| # | Case | Expected | Result |
|---|---|---|---|
| 15.8.1 | GET instead of POST | 405 on all six | ☐ |
| 15.8.2 | Missing / wrong secret | 401 `{"error":"unauthorized"}` on all six | ☐ |
| 15.8.3 | `stockout-alerts` | `{ok,orgs,notified}`. Needs pick/adjust scans so velocity is non-zero. Alerts only owners+admins; **3-day cooldown** per user+product; fires `low_stock` to integrations only for **newly** alerted products | ☐ |
| 15.8.4 | `lot-expiry-alerts` | Lots expiring within 30 days (or already expired); **7-day cooldown**; copy distinguishes "expired" from "expiring" | ☐ |
| 15.8.5 | `auto-draft-pos` | Opt-in per org; **not idempotent** — re-running creates more drafts (handy for repeat tests) | ☐ |
| 15.8.6 | `cycle-count-queue` | Opt-in; tops the queue to 10; re-running against a full queue is a no-op | ☐ |
| 15.8.7 | `email-digests` | Without Resend: `{"ok":true,"skipped":"email_not_configured"}`. With it: max 12 items, and a **second run with nothing new sends nothing** | ☐ |
| 15.8.8 | `webhook-retries` | Set `next_retry_at = now()` on a failed delivery and re-run → re-sent with the same delivery id | ☐ |
| 15.8.9 | Notifications land | After a successful run, `/notifications` shows the new rows (see §5.5.3 about missing filter chips) | ☐ |
| 15.8.10 | Vault secrets | Confirm `cron_app_url` + `cron_secret` exist and match `CRON_SECRET`. ⚠️ `net.http_post` is fire-and-forget — a 401 still logs a *successful* job run. **Check `net._http_response` for the real status** | ☐ |

### 15.9 Free trial & the entitlement gate
Every workspace created after `20260913120000_trial_clock.sql` is applied gets a **7-day trial**: exactly 168 hours from creation, no card. Workspaces that existed before it are **grandfathered** (`orgs.trial_started_at IS NULL`) and are never gated, and so is any workspace with a live Stripe subscription (`active`, `trialing`, `past_due`). The rules live in `lib/entitlement.ts`.

Nobody should wait a week. Move a **test** workspace's clock from the SQL editor (a trigger refuses the change from client sessions):

```sql
update app.orgs set trial_started_at = now() - interval '6 days 23 hours 58 minutes' where id = '<test org>'; -- 2 minutes left
update app.orgs set trial_started_at = now() - interval '8 days' where id = '<test org>';                    -- expired
update app.orgs set trial_started_at = null where id = '<test org>';                                         -- grandfathered again
```

| # | Case | Expected | Result |
|---|---|---|---|
| 15.9.1 | New workspace | Sign up → onboarding → the side rail shows **"7 days left in your trial"** (mobile top bar: "7d left"; collapsed rail: "7d"). `trial_started_at` is set on the org | ☐ |
| 15.9.2 | Existing workspace | A workspace created before the migration: no pill, no gate, `trial_started_at` NULL | ☐ |
| 15.9.3 | Pill link | With `billing.manage` the pill links to `/settings/billing`; without it the pill is plain text | ☐ |
| 15.9.4 | Last two days | With 2 days or fewer left the pill switches to the warning tone | ☐ |
| 15.9.5 | Billing page during the trial | "Free trial" panel with days left, the end date and time, and **Talk to us**; the plan picker still renders below | ☐ |
| 15.9.6 | **Expired → one screen** | Expire the clock, then load any `(app)` page (`/`, `/inventory`, `/settings/members`, `/kiosk`…) → `/trial-ended` | ☐ |
| 15.9.7 | Owner view | `/trial-ended`: **Choose a plan →** (to billing; hidden when Stripe isn't configured) and **Talk to us** (nautilusinventory.com/contact) | ☐ |
| 15.9.8 | Member view | "Ask a workspace owner…" listing the owners; no billing button | ☐ |
| 15.9.9 | Still reachable | `/settings/billing` (checkout and portal work), `/workspaces/new`, Sign out, `/invite/[token]`, `/login`, `/signup`, `/auth/*`; staff reach `/admin/*` | ☐ |
| 15.9.10 | **Soft navigation can't escape** | Expired, on `/settings/billing`: click Inventory in the side rail, a Settings tab, and a ⌘K result → each ends on `/trial-ended` behind a brief loader, never the page itself | ☐ |
| 15.9.11 | Tab left open across the end | Load a page with 2 minutes left and leave the tab alone → within about a minute of the end it moves to `/trial-ended` without a reload | ☐ |
| 15.9.12 | Writes refused | From a tab opened before expiry, save something (a product edit) → "This workspace's free trial has ended, so changes can't be saved…" and nothing is written | ☐ |
| 15.9.13 | Exports | `/inventory/export`, `/api/orders/export`, `/analytics/valuation/export`, `/reports/[id]/export` → **402** | ☐ |
| 15.9.14 | Pay to restore | Test-mode checkout from `/settings/billing` → once the webhook lands every page works again, with nothing lost | ☐ |
| 15.9.15 | past_due and canceled | A `past_due` subscription is never gated. `canceled` on an expired clock → gated; `canceled` on a grandfathered workspace → not gated | ☐ |
| 15.9.16 | Two workspaces | A user in two workspaces, one expired: `/trial-ended` offers the switcher; switching to the healthy one lands on `/` | ☐ |
| 15.9.17 | **Clock and payment can't be self-served** | With your own session through PostgREST: PATCH your org's `trial_started_at` to null → refused (42501); insert or update `org_subscriptions` → permission denied. **S1 if either succeeds** | ☐ |
| 15.9.18 | Fails open | Against a clone without the migration, every workspace works normally and the server logs `[entitlement] … failing open` once | ☐ |

---

## 16. Settings & staff admin

### 16.1 `/settings` (Account)
| # | Case | Expected | Result |
|---|---|---|---|
| 16.1.1 | Shows | Email, Full name, Phone, Member since, User ID, and a workspace list with role badges | ☐ |
| 16.1.2 | **Nothing is editable** | There is no way to change your name or phone anywhere in the app. Confirm and record | ☐ |

### 16.2 `/settings/navigation`
| # | Case | Expected | Result |
|---|---|---|---|
| 16.2.1 | Industry | Owner/admin can change it; a member sees a read-only value with an explanation | ☐ |
| 16.2.2 | Work modules | Activity and priority chips save; the sidebar and dashboard follow on the next load | ☐ |
| 16.2.3 | Sidebar customiser | Reorder and hide; the header chip reads "Customized" / "<Industry> defaults" / "Default"; Reset restores | ☐ |
| 16.2.4 | Locked items | Overview and Settings cannot be hidden, client-side or via a crafted POST | ☐ |
| 16.2.5 | **Gate divergence** *(regression)* | Strip `settings.manage` from an admin → the industry and work-module forms render read-only, matching what the actions allow. No silently-dead form | ☐ |

### 16.3 `/settings/security`
| # | Case | Expected | Result |
|---|---|---|---|
| 16.3.1 | Change password *(regression)* | Now asks for the **current** password and re-authenticates before changing it; a wrong one gives "That current password doesn’t match our records". An account created via Google with no password set can still set its first one by leaving that field blank | ☐ |
| 16.3.2 | Enrol 2FA | QR + manual secret → 6-digit verify → the factor is listed | ☐ |
| 16.3.3 | **Does 2FA gate login?** | Sign out and back in → ⚠️ **expected to FAIL — no AAL2 step-up exists.** Must not be claimed as a feature to customers | ☐ |
| 16.3.4 | Abandoned enrollment | Start enrolment then navigate away without cancelling → an orphaned unverified factor. Record | ☐ |
| 16.3.5 | Remove factor | Immediate, **no confirmation dialog** | ☐ |
| 16.3.6 | Devices list | Current device badged "This device" and has no Revoke button | ☐ |
| 16.3.7 | Revoke a device | The other browser is signed out **on its next page load** (eventual, not immediate) | ☐ |
| 16.3.8 | Foreign device id | A crafted revoke for another user's device does nothing | ☐ |
| 16.3.9 | Stale device rows | Delete the `nb_device` cookie and reload → a second row appears, which is unavoidable (the cookie **is** the device identity). Confirm the list stays reviewable: entries silent for 90 days drop off | ☐ |

### 16.4 `/settings/members`
| # | Case | Expected | Result |
|---|---|---|---|
| 16.4.1 | Invite | Email + role (Member/Admin) → "Invite emailed to <email>" | ☐ |
| 16.4.2 | Email-send failure | Falls back to showing a **copyable invite link** (regression: it used to say "share the link manually" without showing one) | ☐ |
| 16.4.3 | Weak email check | The single-invite form only requires an `@`. Confirm | ☐ |
| 16.4.4 | Duplicate invite | "An invite for this email already exists" | ☐ |
| 16.4.5 | Pending invites | Copy link (admins only), Revoke (no confirmation), and an **Expired** chip past 7 days | ☐ |
| 16.4.6 | **Bulk CSV invite** | Template → 5 rows including 1 bad email, 1 duplicate and 1 existing member → the preview flags each with a specific status; only valid rows are invited; magic links are shown | ☐ |
| 16.4.7 | Bulk limits | >200 rows or >2 MB → rejected clearly | ☐ |
| 16.4.8 | Bulk role guard | An **admin** uploading a row with `role=owner` → "Admins can't invite owners (only owners can)" | ☐ |
| 16.4.9 | Bulk facility | An unknown facility name → `Facility "x" not found in this workspace` | ☐ |
| 16.4.10 | Bulk parser limits | A quoted cell containing a literal newline is **not** handled — confirm the failure is legible | ☐ |
| 16.4.11 | Bulk re-parse | The execute step re-parses the file (anti-tamper) — confirm swapping the file mid-flow can't bypass the preview | ☐ |
| 16.4.12 | **Owner protection** (regression) | As an admin, replay the remove form with the owner's `user_id` → **nothing happens; the owner remains** | ☐ |
| 16.4.13 | **Last-owner guard** (regression) | With two owners, one removes the other (allowed). Removing the **last** owner is refused | ☐ |
| 16.4.14 | Self-removal | Blocked | ☐ |
| 16.4.15 | Per-member permissions | Uncheck `orders.manage` for B → B cannot create an order; the chip reads "Permissions · custom" | ☐ |
| 16.4.16 | Reset to default | The chip returns to "· role default" | ☐ |
| 16.4.17 | **Uncheck everything** | Silent no-op by design (anti-lockout) with **zero feedback**. Record as UX | ☐ |
| 16.4.18 | Admin editing an admin | Silently refused — only an owner can. Record | ☐ |
| 16.4.19 | **Multi-workspace correctness** *(regression)* | As a user in two workspaces, open this page in each. The role, the admin controls and the bulk-invite target must all follow the **active** workspace — and the member and invite lists must show **only** that workspace rows (they used to merge both) | ☐ |

### 16.5 `/settings/devices`
| # | Case | Expected | Result |
|---|---|---|---|
| 16.5.1 | Scanner | Status reads active/paused; the test field displays the last captured barcode; Pause/Resume works and is honoured on other pages | ☐ |
| 16.5.2 | Printer, Chromium | Pair → device label shown; **Print test label** emits a 4×2 label; pairing survives a hard refresh | ☐ |
| 16.5.3 | Printer, Safari/Firefox | "WebUSB unavailable" message and **no pair button** — degrades, never crashes | ☐ |
| 16.5.4 | Busy USB interface | "Couldn't claim printer interface" rendered as an error, not a crash | ☐ |
| 16.5.5 | **No permission gate** | Every role can use this page. Confirm that's intended | ☐ |

### 16.6 `/settings/billing`
| # | Case | Expected | Result |
|---|---|---|---|
| 16.6.1 | Plan picker | One card per tier with Annual and Monthly buttons | ☐ |
| 16.6.2 | Active plan | Tier, status badge, "Cancels at period end" when applicable, member count, renewal date, **Manage billing** | ☐ |
| 16.6.3 | Payment method + invoices | Card summary or "No card on file"; invoice rows link to the hosted invoice | ☐ |
| 16.6.4 | Query-param banners | `?checkout=success`, `?checkout=cancelled`, `?error=no_customer`, `?error=unknown_plan` each render their message | ☐ |
| 16.6.5 | **As a member** | Plan buttons render and **silently no-op**. Record | ☐ |
| 16.6.6 | Crafted POST | A member posting `tier=enterprise&period=annual` gets nothing | ☐ |
| 16.6.7 | Multi-workspace | The subscription, member-count and checkout-customer reads are now filtered to the active workspace — after switching workspaces, confirm the right subscription, member count and trial panel show, and that checkout reuses *this* workspace's Stripe customer | ☐ |
| 16.6.8 | past_due | A `past_due` subscription shows the current plan with **Manage billing** (to fix the card), not the plan picker | ☐ |

### 16.7 `/settings/api-keys`
| # | Case | Expected | Result |
|---|---|---|---|
| 16.7.1 | Create | Name + ≥1 scope → the token is shown **exactly once** with a Copy button | ☐ |
| 16.7.2 | Scope validation | Zero scopes → "Select at least one scope"; a payload of only bogus scopes is also rejected | ☐ |
| 16.7.3 | Token is unrecoverable | Navigate away → the full token can never be seen again | ☐ |
| 16.7.4 | Revoke | Moves to the Revoked archive; the key 401s immediately (§15.7.4) | ☐ |
| 16.7.5 | **As a member** | The form and Revoke buttons **render** but silently fail. Record | ☐ |
| 16.7.6 | Endpoints reference | Lists the three endpoints with their scopes and the two-gate explanation | ☐ |

### 16.8 `/settings/audit`
| # | Case | Expected | Result |
|---|---|---|---|
| 16.8.1 | **Stale data, not empty** | The page shows ~30 rows from months ago (finding E). **No new entry ever appears** no matter what you do. Expected to fail — decide whether to backfill a writer or hide the tab | ☐ |
| 16.8.2 | Pagination | `?page=0`, `?page=-5`, `?page=abc` → page 1; `?page=99999` → empty list | ☐ |
| 16.8.3 | **No permission gate** | Any member can read the workspace audit log. Confirm that's intended | ☐ |
| 16.8.4 | Cross-org | No rows from another workspace appear after switching | ☐ |

### 16.9 `/settings/adjustments`
| # | Case | Expected | Result |
|---|---|---|---|
| 16.9.1 | Not in the tab bar | Reachable only by URL or from `/cycle-counts`. Confirm that's intended | ☐ |
| 16.9.2 | Pending approvals | Each row shows `current → requested (±delta)` with slot, facility, reason and notes | ☐ |
| 16.9.3 | Approve | Commits the adjustment; on-hand updates | ☐ |
| 16.9.4 | Drift guard | If stock moved since the request → "Stock changed to N since this was requested — reject and re-submit against current on-hand." | ☐ |
| 16.9.5 | Double approve | The second attempt reports "Already reviewed" and does **not** double-apply | ☐ |
| 16.9.6 | Deleted location | Approving a request whose location is gone → "Location no longer exists" | ☐ |
| 16.9.7 | Threshold *(regression)* | Save a value; blank disables; **0 is now enterable** and the hint explains it means every adjustment needs approval. Non-admins see "Every adjustment" rather than "0 units" | ☐ |
| 16.9.8 | Negative threshold | A crafted `-5` is treated as null (disabled) | ☐ |
| 16.9.9 | Reason codes | Seed the default set; toggle "Require approval" and Enable/Disable | ☐ |
| 16.9.10 | Slug collisions | "Damaged goods", "damaged-goods" and "Damaged  Goods!" all slugify the same → the second is refused with "That reason already exists" | ☐ |
| 16.9.11 | Long labels *(regression)* | Two 60-char labels differing only after character 40 still collide, but the error now names the reason already holding the code and explains the 40-character rule | ☐ |
| 16.9.12 | Emoji-only label | "Label must contain letters or numbers" | ☐ |
| 16.9.13 | Without `adjustments.approve` | Pending rows show **"Awaiting admin"**; the threshold is plain text; the add-reason form is hidden | ☐ |

### 16.10–16.12 Staff console (`/admin`)
Gated on `profiles.is_staff`; a non-staff user is **silently redirected to `/`** (deliberately not a 404).

| # | Case | Expected | Result |
|---|---|---|---|
| 16.10.1 | Workspace list | Total / Starter / Pro / Enterprise counts and a table across **all** orgs, newest first | ☐ |
| 16.10.2 | "Self-signup" | Workspaces with no `onboarded_at` show that label | ☐ |
| 16.10.3 | Non-staff access | `/admin` redirects to `/` with no hint the route exists | ☐ |
| 16.10.4 | **Branding split** | The console reads "NAUTILUS" with a red STAFF chip — confirm no "Nimbus" strings remain | ☐ |
| 16.11.1 | Onboard a workspace | Name + tier + owner email + owner name → created, invitation sent, **magic link shown** | ☐ |
| 16.11.2 | Validation order | 1-char name, invalid email, bad tier, duplicate slug and an existing account each produce their own message | ☐ |
| 16.11.3 | Duplicate slug | `A workspace named "X" already exists. Add a city or year to differentiate.` | ☐ |
| 16.11.4 | **Non-atomic failure** | If the auth user is created but provisioning fails, the message says the account is orphaned. ⚠️ **Retrying the same email is then permanently blocked** by the "already has an account" guard. Test and record severity | ☐ |
| 16.11.5 | Unicode name | An emoji-only or symbols-only name — confirm the slug is never empty | ☐ |
| 16.11.6 | No facility | A staff-onboarded workspace is created **without** a facility, giving a different empty state than self-signup. Confirm | ☐ |
| 16.12.1 | Workspace detail | KPIs (Members, Facilities, Products, Scans 30d), member table, subscription block | ☐ |
| 16.12.2 | Copy is accurate *(regression)* | The stale "not yet wired to Stripe" claim is gone; the panel says it is a read-only mirror and where to make changes | ☐ |
| 16.12.3 | Unknown id | 404 | ☐ |

---

## 17. Cross-cutting

### 17.1 RBAC matrix
Three roles: **owner**, **admin**, **member**. Owner always has all **19** permissions. Admin defaults to all 19 (can be narrowed). Member defaults to **10**.

**Member CAN by default:** adjust stock · manage orders · allocate stock · manage customers · manage pick waves · receive shipments · manage suppliers · review QC · manage work orders · build reports.

**Member CANNOT by default:** manage catalog/import · void cycle counts · manage purchase orders · manage facilities · approve adjustments · manage settings · manage members · manage billing · manage integrations.

Test each as a **member**:

| # | Attempt | Expected | Result |
|---|---|---|---|
| 17.1.1 | Register a product | Blocked (`inventory.manage`) | ☐ |
| 17.1.2 | Import products | Blocked — "Only admins can import products." | ☐ |
| 17.1.3 | Create a PO | Blocked (`purchasing.manage`) | ☐ |
| 17.1.4 | Receive a PO | **Allowed** (`purchasing.receive`) | ☐ |
| 17.1.5 | Create a facility / edit layout | Blocked (`facilities.manage`) — but the builder page still lets you edit until Save | ☐ |
| 17.1.6 | Place/adjust stock | **Allowed** (`inventory.adjust`) | ☐ |
| 17.1.7 | Approve an adjustment | Blocked (`adjustments.approve`) | ☐ |
| 17.1.8 | Invite a member | Blocked (`members.manage`) | ☐ |
| 17.1.9 | Create an API key | Blocked — ⚠️ but the form still renders | ☐ |
| 17.1.10 | Connect an integration | Blocked (`integrations.manage`) | ☐ |
| 17.1.11 | Open billing checkout | Blocked — ⚠️ silently | ☐ |
| 17.1.12 | Create an order | **Allowed** (`orders.manage`) | ☐ |
| 17.1.13 | Build and delete a report | **Allowed** (`reports.manage` is a member default) | ☐ |
| 17.1.14 | Apply a forecast suggestion | Blocked (regression — this used to be ungated) | ☐ |
| 17.1.15 | Load or clear sample data | Blocked — "Only owners and admins…" | ☐ |
| 17.1.16 | **Silent-failure audit** | Across every blocked action above, note which give **no feedback at all**. Collect them as one UX bug rather than 15 | ☐ |
| 17.1.17 | Custom-permission override | Give a member an explicit permission array → it **replaces** the role default entirely, not merges | ☐ |
| 17.1.18 | Owner immunity | An owner keeps all 19 permissions regardless of any custom array | ☐ |

### 17.2 Multi-tenant isolation — **highest severity area**
Because account-table RLS isn't in the repo (finding D), this must be proven empirically. Create **Workspace A** and **Workspace B** with different owners.

| # | Case | Expected | Result |
|---|---|---|---|
| 17.2.1 | A's product id in B's URL | `/inventory/{A-id}` → not found, **never** A's data | ☐ |
| 17.2.2 | Repeat for every detail route | order, PO, ASN, facility, section, customer, supplier, wave, return, work order, report | ☐ |
| 17.2.3 | **Routes with RLS-only scoping** | `/orders/[id]` and `/purchase-orders/[id]` have **no explicit `org_id` filter** (their print siblings do). Probe both especially hard | ☐ |
| 17.2.4 | Member / API-key / audit lists | B sees only B's rows | ☐ |
| 17.2.5 | A's API key against `/api/v1/*` | Only A's data | ☐ |
| 17.2.6 | `/scan` barcode lookup | A barcode that exists only in B is not found from A | ☐ |
| 17.2.7 | Multi-workspace pickers | As a user in both A and B, open `/purchase-orders/new` and `/orders/new` — pickers must list only the active workspace | ☐ |
| 17.2.8 | Multi-workspace settings | `/settings/members` resolves the role **without** the workspace cookie (§16.4.19) — verify which org's role you get | ☐ |
| 17.2.9 | Export routes | Every CSV export with a facility or report id from the other workspace → empty or 404, never data | ☐ |
| 17.2.10 | Facility scope switch | Data re-scopes with no bleed | ☐ |

**Any failure here is S1 and blocks the customer demo outright.**

### 17.3 Security
| # | Case | Expected | Result |
|---|---|---|---|
| 17.3.1 | Direct URL while logged out | Redirect to login, no data flash | ☐ |
| 17.3.2 | `/admin` as a non-staff user | Silent redirect to `/` | ☐ |
| 17.3.3 | XSS attempts | `<script>alert(1)</script>` in product name, notes, customer name, report name, section name → rendered as text everywhere it appears | ☐ |
| 17.3.4 | Security headers | `curl -I` shows `Content-Security-Policy`, `Strict-Transport-Security` (prod), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` | ☐ |
| 17.3.5 | **CSP does not break the app** | Sign in, load Overview, open a facility in **3D**, leave a Realtime page open ~1 min. Console shows **zero** CSP violations and live data still updates (`connect-src` must allow Supabase `wss:`) | ☐ |
| 17.3.6 | Session after password change | Behaves as the copy claims ("Your active sessions will stay signed in") | ☐ |
| 17.3.7 | Sign-out CSRF | See §4.5.6 | ☐ |
| 17.3.8 | Rate limiting is fail-open | Finding G — confirm sign-in still works when the counter is unavailable, and don't treat that as a pass for throttling | ☐ |
| 17.3.9 | `X-Forwarded-For` spoofing | Attempt to reset a rate-limit bucket by spoofing the header; confirm the proxy overwrites it | ☐ |
| 17.3.10 | Low-stock consistency | The Overview "Low stock" KPI **equals** the count from the Inventory low-stock filter, workspace-wide **and** scoped to one facility | ☐ |
| 17.3.11 | Quarantine drives low stock | Quarantine enough units that available falls below the reorder point → the SKU **appears** low while its on-hand still shows the full physical quantity (intended split) | ☐ |
| 17.3.12 | Unsectioned stock | Stock in a location with no section counts toward on-hand and low-stock **workspace-wide**, and drops out when scoped to a facility | ☐ |

### 17.4 Exports and CSV integrity
Four export routes share one encoder.

| # | Case | Expected | Result |
|---|---|---|---|
| 17.4.1 | **Formula injection** | Create products named `=HYPERLINK("http://evil","click")`, `@SUM(A1)`, `+1234;cmd` and `-2+3+cmd\|' /c calc'!A0`. Export **all four** (inventory, orders, valuation, saved report) and open in Excel → no formula executes | ☐ |
| 17.4.2 | **Numbers stay numeric** | A negative unit cost survives as a number Excel will `SUM()`, not as text | ☐ |
| 17.4.3 | Quoting | A value containing `a,b"c` and an embedded newline round-trips correctly | ☐ |
| 17.4.4 | Inventory export mirrors the page | Set search + category + low-stock, export, compare row counts exactly | ☐ |
| 17.4.5 | **Orders export auth** *(regression)* | An unauthenticated direct fetch of `/api/orders/export` returns **401**, not a 200 header-only CSV. As a multi-workspace user, the file contains only the active workspace orders | ☐ |
| 17.4.6 | Orders export bad status *(regression)* | `?status=bogus` returns **400** naming the valid status groups, instead of a silently empty file | ☐ |
| 17.4.7 | Orders export cap *(regression)* | The 5 000-row cap is now 100 000, matching the inventory export | ☐ |
| 17.4.8 | Report export gate | Any org member can export **any** saved report (no `reports.manage` check on export). Confirm intended | ☐ |
| 17.4.9 | Filenames | A facility name with punctuation produces a safe slugified filename | ☐ |

### 17.5 Responsive, accessibility, resilience
| # | Case | Expected | Result |
|---|---|---|---|
| 17.5.1 | Phone-width browser | Usable; nav collapses; **no horizontal scroll** on any page | ☐ |
| 17.5.2 | Tablet | Layouts hold at mid-breakpoints | ☐ |
| 17.5.3 | Keyboard-only pass | Complete a full order flow with the keyboard; focus is always visible; no traps (test the register-product modal and the facility builder especially) | ☐ |
| 17.5.4 | Screen-reader spot check | Overview, Inventory list, and the import result panel — headings and labels make sense | ☐ |
| 17.5.5 | Zoom to 200% | No clipped or overlapping content | ☐ |
| 17.5.6 | `prefers-reduced-motion` | Animations respect it — including the **Nautilus loader**, which must render static | ☐ |
| 17.5.7 | Slow 3G | Loading states appear (route `loading.tsx` uses the Nautilus loader); nothing looks broken | ☐ |
| 17.5.8 | Offline / server error | Friendly message, not a stack trace | ☐ |
| 17.5.9 | **Double-click every submit** | No duplicate records anywhere — orders, POs, products, invites, imports, work orders | ☐ |
| 17.5.10 | Browser Back after every mutation | No stale or duplicated state | ☐ |
| 17.5.11 | Long values | A 200-char product name and a 10 000-unit quantity → layout holds, no overflow | ☐ |
| 17.5.12 | Print paths | PO, packing slip, pick list, label sheets all print cleanly to PDF in Safari **and** Chrome | ☐ |
| 17.5.13 | WebUSB degradation | Safari/Firefox printer UI degrades with a message — **does not crash** | ☐ |
| 17.5.14 | Light + dark | Repeat §17.5.1 and a 5-page spot check in **both** themes | ☐ |

---

## 18. Marketing site

96 routes. Full detail lives with the landing repo; this is the pre-demo subset.

| # | Case | Expected | Result |
|---|---|---|---|
| 18.1 | Homepage in a fresh incognito window | Hero plays, headline animates, nothing flashes unstyled | ☐ |
| 18.2 | Above-fold reveals fire **without scrolling** | All visible content fully opaque after 5 s with no mouse movement | ☐ |
| 18.3 | Both scroll showcases | "Intelligence Engine" and "Chart Room" animate through their beats; no overlapping text; reversing scroll is clean | ☐ |
| 18.4 | Bottom CTA + footer | Animate in and are fully visible, never blank | ☐ |
| 18.5 | Navigation | Every nav item and mega-menu child resolves; labels never wrap between 1400 and 900 px | ☐ |
| 18.6 | Slug-to-slug navigation | From one integration/industry/legal page to another → the new page's bottom CTA still animates in (this was a real bug) | ☐ |
| 18.7 | Deep links + 404 | A pasted deep URL loads cold; `/definitely-not-a-page` shows a branded 404 | ☐ |
| 18.8 | Demo form | Required fields enforced; 3 000 chars into a 2 000-char field is blocked clearly; the lead email arrives | ☐ |
| 18.9 | Contact + waitlist forms | Validate and submit | ☐ |
| 18.10 | Ask Nautilus chat | Answers pricing and integration questions from real product info; rate-limits gracefully; does not leak its system prompt | ☐ |
| 18.11 | Mobile | No horizontal scroll; menu works; showcases are acceptable; the demo modal is usable with the keyboard open | ☐ |
| 18.12 | SEO / sharing | Link preview shows the OG image; `/sitemap.xml` and `/robots.txt` load; unique title + description per page | ☐ |
| 18.13 | ROI calculator | Extreme values (0, 1, 999999999) produce no NaN/Infinity | ☐ |

---

## 19. Mobile app

### Build it first (before Day 1)
```bash
cd D:\hello-world2
npm install
npx expo prebuild --clean -p android    # REQUIRED — the checked-in android/ is pre-rebrand
npx expo run:android
```
- ⚠️ **Expo Go will not work** — `expo-dev-client` is required.
- ⚠️ **Run `eas init` first** or push is structurally impossible (finding F).
- ⚠️ **iOS needs `expo-camera`, `expo-image-picker`, `expo-local-authentication` in `app.json` plugins** first, or camera / photo picker / Face ID crash for missing Info.plist strings.
- ⚠️ Supabase config is **hardcoded** at the same project as the desk app.
- ⚠️ The test account needs an `org_members` row **and `warehouse_access`**, or every screen renders blank.

| # | Case | Expected | Result |
|---|---|---|---|
| 19.1 | Build + sign in | Opens to login with correct branding; Home shows 4 KPIs | ☐ |
| 19.2 | No `warehouse_access` | Signs in but screens are blank — confirm the failure mode is understandable | ☐ |
| 19.3 | Biometric unlock | Enable, restart, prompt appears; failure signs you out | ☐ |
| 19.4 | Scan a real barcode | Product resolves | ☐ |
| 19.5 | Unknown barcode | Registration flow including photo upload | ☐ |
| 19.6 | **Pick an order** | Scan-to-verify → `quantity_picked` rises and **on-hand decrements in the same step** | ☐ |
| 19.7 | Wrong-item scan | Rejected with clear feedback | ☐ |
| 19.8 | **Pick a wave** | Walk-ordered run completes; the desk then shows the wave completable | ☐ |
| 19.9 | **Blind cycle count** | Expected qty **hidden**; an over-threshold variance queues an approval | ☐ |
| 19.10 | PO receive | Partial qty, lot/expiry, QC pass/fail | ☐ |
| 19.11 | ASN / LPN receive | Whole-pallet receive reconciles the PO | ☐ |
| 19.12 | Work order build | Completes via the RPC | ☐ |
| 19.13 | Return + restock | Friendly error mapping | ☐ |
| 19.14 | **Offline queue** | Airplane mode → register / adjust / relocate queue, then sync on reconnect | ☐ |
| 19.15 | **Offline indicator** *(regression)* | Go into airplane mode and queue a write → a banner appears under the header on **every** screen ("Offline — N pending"), and a count badge appears on the Home tab icon. Back online it reads "Syncing…", then both disappear once the queue drains | ☐ |
| 19.16 | Offline-blocked actions | Picking/receiving are hard-blocked by design — confirm the message is clear | ☐ |
| 19.17 | Conflict resolution | Keep-server / keep-mine modal | ☐ |
| 19.18 | Push notification | With EAS configured, on a real device. Without it, the toggle flips back off with an alert | ☐ |
| 19.19 | Placeholders | Manage facilities / Staff & permissions / Label printing / Terms / Privacy all show "NOT YET ON MOBILE" — decide whether to hide before demos | ☐ |
| 19.20 | Dead controls | Scan-FAB long-press and map "VIEW BAYS" are inert. Record | ☐ |
| 19.21 | **Cross-surface consistency** | Pick on mobile → refresh the desk order → numbers agree **exactly** | ☐ |

---

## 20. Test data hygiene & cleanup

- Prefix every test workspace: `QA-<date>-<tester>`.
- Prefix test products/orders/customers: `QA-`.
- **Record every workspace ID created** in §23.
- Sample data has a built-in teardown — use **Clear sample data** rather than deleting rows by hand.
- The seed script's `--wipe` removes only tagged rows, so it is safe on a shared dev project.
- If testing production: after the pass, have someone with DB access delete the QA orgs and their cascade. Deactivating is not enough — they'll show in `/admin` and skew analytics.
- ⚠️ The mobile app points at the **same Supabase project** — mobile test data lands in the same place.

---

## 21. Pre-demo smoke test (30 minutes)

Run on the **exact environment** the customer will see, from a **fresh incognito window**.

| # | Check | Result |
|---|---|---|
| 1 | Marketing homepage loads; hero plays; no console errors | ☐ |
| 2 | Both scroll showcases animate correctly top-to-bottom | ☐ |
| 3 | Bottom CTA card and footer are visible (not blank) | ☐ |
| 4 | Demo form submits and the lead email arrives | ☐ |
| 5 | Ask Nautilus answers a pricing question sensibly | ☐ |
| 6 | Link preview (paste the URL in Slack) shows the OG image | ☐ |
| 7 | Log into the demo workspace | ☐ |
| 8 | Overview shows **real, non-zero** KPIs (use a seeded workspace — a fresh one looks broken) | ☐ |
| 9 | Inventory list loads with products and correct on-hand | ☐ |
| 10 | Open a product — locations, forecast and lots all render | ☐ |
| 11 | **Import a small CSV** — Check, then Import, then see the rows in the list | ☐ |
| 12 | Facility viewer renders the floor plan (2D **and** 3D) | ☐ |
| 13 | Create an order → allocates correctly | ☐ |
| 14 | Build a pick wave → the zoned list looks right | ☐ |
| 15 | Analytics: valuation and forecast both show data | ☐ |
| 16 | Mobile app: sign in, scan an item, pick one line | ☐ |
| 17 | Print a pick list to PDF | ☐ |
| 18 | Light mode and dark mode both look right on the pages you'll show | ☐ |
| 19 | No red errors anywhere in the console during the whole run | ☐ |
| 20 | **Avoid on stage:** Audit tab (stale), Customer→Orders for hand-made orders (empty), anything mobile-push | ☐ |

---

## 22. Defect register

### 22.1 Fixed in the 2026-09-12 pass — **re-test as regressions, don't re-file**
Every row below was open when this plan was written and has since been fixed. The case column is where to confirm it.

| # | Sev | Bug | Case |
|---|---|---|---|
| 11 | S2 | `/inventory/[id]` and `/scan` summed locations **without `is_active`**, so soft-deleted slots still counted toward on-hand, ATP and inventory value while the list RPC excluded them — the same SKU read differently on three screens | 7.3.7 |
| 12 | S2 | `removeLocation` bypassed the adjustment approval threshold entirely: editing 10,000 → 0 queued, removing the slot wrote the same units off silently | 8.5.16 |
| 13 | S2 | ASN receive had **no optimistic lock** (the PO path has one) — concurrent receives double-counted | 12.7.6 |
| 14 | S2 | A crafted POST could receive against a **cancelled** ASN and flip it back to `in_transit` | 12.7.7 |
| 15 | S2 | `markPoCancelled` had no status filter — a **fully-received** PO could be cancelled | 12.3.13 |
| 16 | S2 | `/settings/members` resolved the caller's role **without the workspace cookie**, and its member/invite queries had **no org filter at all** — a multi-workspace user got the wrong admin gate and saw both workspaces' members merged | 16.4.19 |
| 17 | S2 | `/api/orders/export` had no auth check, no org filter, passed an unknown status through as a literal, and capped silently at 5,000 rows | 17.4.5–17.4.7 |
| 18 | S2 | `/analytics` computed action mix, units on hand and the section split from **unpaginated** queries — the bars disagreed with the KPIs above them past ~1,000 rows | 14.1.5 |
| 19 | S2 | Dead stock analysed only the **first 500 products by name**, and its truncation notice gave advice that could not widen coverage | 14.2.6 |
| 20 | S2 | `runOrders` fetched order items unpaginated — large report exports under-reported requested/allocated/picked | 14.6.8 |
| 21 | S2 | `/api/v1/inventory` had no pagination — public API totals truncated past ~1,000 location rows | 15.7.16 |
| 22 | S2 | **Stripe subscription updates never applied.** The handler probed an `id` column the table does not have, so the lookup always failed, every event took the insert branch, and each one after the first violated the primary key — silently. A cancelled customer kept their plan | 15.6.7 |
| 23 | S2 | `saveLayout` did **no server-side validation** of section code length, uniqueness, or bays/levels ≥ 1 | 8.3.9 |
| 24 | S2 | `placeLocation` did not bounds-check bay/level against the section (relocate did), so stock could be created in a slot nothing could reach | 8.5.5 |
| 25 | S2 | `/auth/signout` was a state-changing **GET** with no CSRF protection | 4.5.6 |
| 26 | S2 | `/settings/security` changed a password **without asking for the current one** | 16.3.1 |
| 27 | S2 | Blueprint import destroyed every existing section with no confirmation | 8.3.13 |
| 28 | S2 | `/admin/onboard` left an orphaned auth user on a partial failure, and its own duplicate-account guard then **blocked every retry** for that address | 16.11.4 |
| 29 | S2 | The facility builder was not permission-gated — a member could edit for twenty minutes and only fail at Save | 8.3.18 |
| 30 | S3 | `voidCycleCount` was permission-gated and implemented but **no UI called it** — the `voided` status was unreachable | 9.3.12 |
| 31 | S3 | Building a wave when nothing was eligible still created an **empty wave** | 13.6.5 |
| 32 | S3 | Anyone could steal a claimed pick wave or work order | 13.7.5, 10.4.11 |
| 33 | S3 | ASN over-receipt **silently clamped** while the PO path errored | 12.7.3 |
| 34 | S3 | ASN lot numbers never created a `lots` row | 12.7.8 |
| 35 | S3 | `/serials` header counts came from the first 500 rows only | 10.2.6 |
| 36 | S3 | Serial registration silently discarded everything past 1,000 | 10.2.4 |
| 37 | S3 | `reTestResend`, `testShopify` and `getRecentDeliveries` lacked the `integrations.manage` gate their siblings have | 15.3.6 |
| 38 | S3 | `keepStubAsProduct` unconditionally overwrote `products.notes` | 15.4.9 |
| 39 | S3 | `scan_burst` / `daily_summary` webhook events had **no producers** — subscribing to them could never deliver anything | 15.5.7 |
| 40 | S3 | `/reports/[id]` Delete had no confirmation dialog | 14.6.10 |
| 41 | S3 | Normal PO receipts wrote no `scan_history` row (ASN receipts did) | 12.3.6 |
| 42 | S3 | The adjustment threshold input had `min=1` while the server accepted `0` ("approve everything"), making that setting unreachable | 16.9.7 |
| 43 | S3 | Adjustment reason codes truncate to 40 characters, so long labels collided with an unexplained error | 16.9.11 |
| 44 | S3 | Middleware dropped the query string when redirecting to login | 4.1.7 |
| 45 | S3 | `/login` never rendered the `revoked=1` flag — remote sign-out looked like a random logout | 4.1.12 |
| 46 | S3 | Device sessions accumulated forever, so the list stopped being reviewable | 16.3.9 |
| 47 | S3 | `/settings/navigation` gated its forms on **role** but its actions on **`settings.manage`** | 16.2.5 |
| 48 | S3 | Password reset answered a throttled request differently from a delivered one | 4.3.3 |
| 49 | S3 | `/notifications` had no chips for the `lot_expiry` / `cycle_count_queue` kinds the crons emit, and loaded every row with no limit | 5.5.3, 5.5.9 |
| 50 | S3 | `/cycle-counts` and `/transfers` ignored the active-facility scope every other list honours | 5.3.4 |
| 51 | S3 | The invite "Email mismatch" screen offered no way to sign out — a dead end | 4.6.4 |
| 52 | S3 | Registering a product with a quantity on a workspace with no facility **silently dropped the count** | 7.2.5 |
| 53 | S4 | `/(app)/api/team/import/template` was a dead route returning a different CSV from the live one | deleted |
| 54 | S4 | `/integrations` claimed "Every connection is OAuth — credentials never touch our servers" while three of the four take pasted secrets | 15.1.4 |
| 55 | S4 | `/admin/workspace/[id]` said "Billing is not yet wired to Stripe" — it is | 16.12.2 |
| 56 | S4 | `/analytics` showed a hard-coded "Last sync: Just now" | 14.1.2 |
| 57 | S4 | The facility viewer had no empty-state copy for a facility with no layout | 8.2.5 |
| 58 | S4 | "Adjustment sent for approval" rendered in danger red, teaching operators to read a working governance flow as a failure | 8.5.11 |

### 22.2 Fixed in the previous pass — also regressions
| # | Sev | Bug | Case |
|---|---|---|---|
| 1 | S2 | Inventory **Export CSV → 404** | 7.1.7 |
| 2 | S2 | Product detail **lot supplier link → 404** | 7.3.8 |
| 3 | S2 | **QC pass/fail errors silently swallowed** | 12.8.4 |
| 4 | S3 | Duplicate `/api/inventory/import-template` routes returning different CSVs | 7.4.24 |
| 5 | S2 | New invitee funnelled into creating their own workspace instead of joining | 4.6.2 |
| 6 | S2 | Single-invite fallback said "share the link manually" but never showed the link | 16.4.2 |
| 7 | S1 | No last-owner guard on `removeMember` | 16.4.13 |
| 8 | S2 | API key **scopes never enforced** | 15.7.5 |
| 9 | S3 | **Forecast Apply had no permission check** | 14.3.4 |
| 10 | S3 | Getting-started checklist silently dropped "Connect your store" | 6.1.6 |

### 22.3 Still open
**None.** The three items that survived the first fix pass were closed on 2026-09-12:

| # | Sev | Was | Now | Case |
|---|---|---|---|---|
| 59 | S4 | Mobile offline banner and pending badge existed but were never rendered, so an operator working offline got no indication at all — writes queued silently | `OfflineBanner` is mounted in the shared `ScreenHeader`, which every one of the 18 mobile screens uses, and `PendingBadge` sits on the Home tab icon. Both render nothing when online with an empty queue | 19.15 |
| 60 | S3 | An ASN receive racing a receipt on the PO detail page could lose the PO-side increment, leaving the PO under-reporting goods already on the dock | `app.receive_asn_line` takes the ASN line **and** its linked PO line `FOR UPDATE` and writes both in one transaction | 12.7.6 |
| 61 | S4 | A standalone (non-PO-linked) ASN line created the `lots` row but had nowhere to store `lot_id`, so the Lots registry, FEFO and expiry alerts never saw it | `app.asn_lines.lot_id` added; the same RPC sets it on the ASN line and on the PO line when there is one | 12.7.8 |

### 22.4 Reclassified after verification — **not bugs**
Both were reported by the survey pass and disproved by reading the live database. Recorded so nobody re-files them.

| Claim | Reality |
|---|---|
| `app.assemble_kit` consumes quarantined or inactive stock because its sufficiency check omits the filters the UI applies | **False.** `app.consume_for_build` filters `is_active = true and quarantined = false` on its lock, its availability sum **and** its consumption loop. The UI and the RPC agree. Case 10.4.12 now verifies the crafted POST as well as the button |
| Concurrent Stripe events can race into duplicate `org_subscriptions` rows | **False** — `org_subscriptions` is keyed `PRIMARY KEY (org_id)`, so duplicates are impossible. The real defect in that handler was worse and unrelated (item 22 above) |
| Slot capacity "shows Over but is not enforced" | **Working as intended.** A manual placement records what is physically on the shelf, so it must not be blocked; the slotting optimiser does refuse to *suggest* an over-capacity move. Case 8.5.6 now tests both halves |

### 22.5 Known gaps, by design or accepted
- The desk app cannot pick (finding A).
- Receiving does not create on-hand except via QC hold (finding B).
- Hand-created orders never link a customer (finding C).
- The audit log has no writer (finding E).
- 2FA enrols but does not gate login (§16.3.3).
- Tier limits are not enforced (§15.6.8).
- Rate limiting is fail-open (finding G).

---

## 23. Sign-off

| Section | Owner | Cases run | P | F | B | Blocking issues | Signed |
|---|---|---|---|---|---|---|---|
| 4 — Auth & account lifecycle | | | | | | | |
| 5 — Shell & navigation | | | | | | | |
| 6 — Overview & sample data | | | | | | | |
| 7 — Inventory & catalog | | | | | | | |
| 8 — Facilities | | | | | | | |
| 9 — Floor operations | | | | | | | |
| 10 — Lots / serials / kits / WOs | | | | | | | |
| 11 — Directory | | | | | | | |
| 12 — Purchasing & inbound | | | | | | | |
| 13 — Outbound | | | | | | | |
| 14 — Analytics & reports | | | | | | | |
| 15 — Integrations & API | | | | | | | |
| 16 — Settings & admin | | | | | | | |
| 17 — Cross-cutting | | | | | | | |
| 18 — Marketing site | | | | | | | |
| 19 — Mobile | | | | | | | |
| 21 — Smoke test | | | | | | | |

**Test workspaces created (delete after):**

| Workspace name | Org ID | Environment | Created by | Deleted? |
|---|---|---|---|---|
| | | | | ☐ |

**Ship decision:** ☐ Go &nbsp;&nbsp; ☐ Go with known issues (list) &nbsp;&nbsp; ☐ No-go

_Signed: ________________  Date: _____________
