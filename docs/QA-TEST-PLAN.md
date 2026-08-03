# Nautilus — Pre-Customer QA & UAT Test Plan

**Scope:** marketing site (`nautilusinventory.com`) · dashboard web app (`app.nautilusinventory.com`) · mobile picker app (Expo/React Native)
**Goal:** a brand-new person can sign up from zero and run a full warehouse day without hitting a broken screen, a wrong number, or a dead end — before any customer sees it.

> **Status of this document:** generated from the code as of the latest `main`. Every route, permission, field and business rule below was read out of the repo, not assumed. Where something is unverified or environment-dependent it says so explicitly.

---

## 0. How to use this document

### Roles for the test pass
| Role | Who | Covers |
|---|---|---|
| **Tester A — "New customer"** | Anyone, ideally the least familiar with the product | **Phase 1** (marketing site, §2) + **Phase 2** (account lifecycle, §4). Must **not** be coached — we're testing discoverability. |
| **Tester B — "Warehouse operator"** | Someone who understands the domain | **Phases 3–5** (core data §5, inbound §6, outbound & floor §7) |
| **Tester C — "Admin/IT"** | Technical | **Phases 6–7** (intelligence §8, integrations/API/crons §9) + **Phase 9** cross-cutting & security (§11) |
| **Tester D — "Floor / mobile"** | Anyone with a physical phone | **Phase 8** (mobile, §10) + every case marked **[MOBILE]** in Phase 5 |

> **Phase 5 depends on Tester D.** The desk app cannot execute picks (§3, finding A) — B and D must run Phase 5 together, or B stops at `in_progress`.

### Result codes
Mark every case with one of:

- **P** — Pass, works as expected
- **F** — Fail, broken (file a bug)
- **B** — Blocked, couldn't run it (say why)
- **N/A** — Not applicable in this environment
- **?** — Works but feels wrong / confusing (these matter as much as failures before a customer demo)

### Severity for anything marked F or ?
| Sev | Meaning | Ship rule |
|---|---|---|
| **S1** | Data loss/corruption, wrong stock numbers, security or cross-tenant leak, total blocker | **Must fix before any customer sees it** |
| **S2** | Core flow broken or unusable workaround required | Must fix before demo |
| **S3** | Wrong/missing behaviour, but a workaround exists | Fix if time |
| **S4** | Cosmetic, copy, polish | Backlog |

### Bug report format (paste into your tracker)
```
[SEV] Short title
Case ID:      e.g. 4.3.2
Environment:  prod / staging / local · browser+version · desktop/mobile
Account:      email + role + workspace name
Steps:        1. … 2. … 3. …
Expected:     …
Actual:       …
Evidence:     screenshot / screen recording / console error / network response
Blast radius: does this affect stock accuracy or money? yes/no
```

---

## 1. Environments & pre-flight

### 1.1 What you're testing against
| Surface | URL | Notes |
|---|---|---|
| Marketing site | https://nautilusinventory.com | Live, verified 200 |
| Dashboard app | https://app.nautilusinventory.com | Live, verified 200 |
| Mobile app | Expo — see Phase 10 | Needs a build; not in an app store |

**Decide before you start:** are you testing **production** or a **local/staging** instance?
Production is the honest test (real CSP, real CDN, real cold starts) — but *every order, product and count you create is real data in the real database.* Use an obviously-named throwaway workspace (e.g. `QA-2026-07-30-A`) and see §12 for cleanup.

### 1.2 Running it locally (if testing local)

**Dashboard app** (`D:\app-nimbus1`):
```bash
npm install
cp .env.local.example .env.local   # then fill in values
npm run dev                        # http://localhost:3000
```
Unauthenticated traffic redirects to `/login`.

**Marketing site** (`D:\nimbus-inventory-landing`):
```bash
npm install
npm run dev
```

**Known install gotcha (from the README):** the 3D viewer pulls `@react-three/fiber`, which declares an optional React Native peer. If Expo exists elsewhere in your tree, npm can trip on peer resolution — add `legacy-peer-deps=true` to a root `.npmrc`.

### 1.3 One-time Supabase config (must already be done, else everything fails)
1. `app` schema exposed to PostgREST — Settings → API → Exposed schemas = `public, app, storage, graphql_public`
2. Redirect URLs allowed — Authentication → URL Configuration:
   - `http://localhost:3000/auth/callback` (dev)
   - `https://app.nautilusinventory.com/auth/callback` (prod)
3. Google OAuth provider configured (redirect URI is Supabase's callback, not ours)

### 1.4 Environment variables — and what breaks without each

**Dashboard app:**
| Var | Needed for | If missing |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | Everything | App is dead |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin onboarding, crons, server actions | Admin flows fail |
| `NEXT_PUBLIC_SUPABASE_DB_SCHEMA` | `app` schema targeting | Queries hit wrong schema |
| `RESEND_API_KEY` + `SYSTEM_EMAIL_FROM` | Invites, digests, alerts | **No email sends — invite flow untestable** |
| `ANTHROPIC_API_KEY` | AI features | AI surfaces fail |
| `CRON_SECRET` | All 6 cron endpoints | Crons reject as unauthorised |
| `INTEGRATION_ENCRYPTION_KEY` | Integration token storage | Integrations fail |
| `SHOPIFY_API_KEY` / `SECRET` | Shopify connect | Shopify untestable |
| `STRIPE_SECRET_KEY` / `WEBHOOK_SECRET` / 4× `PRICE_*` | Billing | Billing untestable |
| `NEXT_PUBLIC_APP_URL` / `SITE_URL` | Links in emails, redirects | Broken links in emails |

**Marketing site:** `ANTHROPIC_API_KEY` (Ask Nautilus chat), `RESEND_API_KEY` + `RESEND_FROM_EMAIL` + `LEAD_TO_EMAIL` (demo/contact forms), `SUPABASE_URL` + `SERVICE_ROLE_KEY` (form storage, chat history), `IP_HASH_SALT` (rate limiting), `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_CALENDLY_URL`, `NEXT_PUBLIC_SITE_URL`.

> ⚠️ **Do §1.5 before the team starts.** If email or Stripe keys are missing, Phases 2.4 and 7 are blocked and you'll waste people's time discovering it live.

### 1.5 Pre-flight gate (one person, 10 minutes, before the team starts)
| # | Check | Expected | Result |
|---|---|---|---|
| 1.5.1 | `npm test` in `D:\app-nimbus1` | **77 tests pass, 11 files** (verified) | ☐ |
| 1.5.2 | `npm run build` in `D:\app-nimbus1` | Compiles, 67 static pages, exit 0 (verified) | ☐ |
| 1.5.3 | `npm run build` in landing repo | Compiles, 102 static pages (verified) | ☐ |
| 1.5.4 | Load both live URLs | Both 200 (verified) | ☐ |
| 1.5.5 | Confirm `RESEND_API_KEY` is set in the app env | Invite emails will send | ☐ |
| 1.5.6 | Confirm Stripe keys + price IDs set | Billing testable | ☐ |
| 1.5.7 | Confirm `CRON_SECRET` set | Cron endpoints testable | ☐ |
| 1.5.8 | Pick + record the test workspace naming convention | e.g. `QA-<date>-<tester>` | ☐ |

### 1.6 Seeding a demo workspace (for Phases 6–9)

```bash
node scripts/seed-demo.mjs --org <slug|uuid>       # or --email owner@example.com
node scripts/seed-demo.mjs --org <slug> --wipe     # reset, then re-seed
node scripts/seed-demo.mjs --org <slug> --wipe-only
```

Writes a facility with a dock door and 4 zoned sections, 27 products with unit
costs / reorder points / lead times, ~150 stock placements, lots (expiring in
9 and 25 days, plus one already expired), **90 days of scan history with
weekday seasonality**, 3 purchase orders (draft / sent / partially received),
and 5 orders including one that deliberately backorders.

It also plants the conditions several reports need in order to show anything:
4 products below their reorder point (low-stock queue + auto-draft-PO cron),
3 dead-stock products with no picks for 200+ days, and a kit with a 3-part BOM.

- Uses the service-role key — **it bypasses RLS.** Only point it at a workspace you mean to modify.
- Every seeded row is tagged; `--wipe` removes **only** tagged rows, so it's safe on a shared dev project.
- After seeding, **switch the facility scope** to the seeded facility — `/picking` will not build waves under "All facilities".
- Dashboard sparklines stay flat until the nightly `kpi-snapshots` job has run **twice**; that's expected, not a bug.

### 1.7 Browser / device matrix
Run **Phase 1–9 fully on Chrome desktop**. Then repeat the §13 smoke test on each of:

| Target | Priority | Notes |
|---|---|---|
| Chrome desktop (latest) | **Required** | Primary target |
| Safari desktop | **Required** | No WebUSB — printer/scanner surfaces must degrade gracefully, not crash |
| Firefox desktop | Required | Same WebUSB caveat |
| Edge desktop | Nice | Chromium, low risk |
| iOS Safari (phone) | **Required** | Marketing site + app responsive |
| Android Chrome (phone) | **Required** | Marketing site + app responsive |
| iPad / tablet | Nice | Layout mid-breakpoint |

> **Hardware constraint from the code:** barcode scanners are USB/Bluetooth **HID keyboard-emulating** — a plain keyboard can simulate them, so scan flows are testable without hardware. **Zebra ZPL label printing uses WebUSB → desktop Chromium only**; Firefox and Safari cannot do it at all. Templates assume **203 DPI** (ZD420/ZD620/GK420) and the printer must be in **ZPL** mode, not EPL/Line. WebUSB permission is per-origin, per-browser, per-profile.

---

## 2. Phase 1 — Marketing site (Tester A)

The customer's first impression. 96 routes; all verified returning 200 at the time of writing.

### 2.1 First impression & core journey
| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 2.1.1 | Homepage loads | Open https://nautilusinventory.com in a **fresh/incognito window** | Hero video plays, headline animates in, nothing flashes unstyled | ☐ |
| 2.1.2 | Above-fold reveals fire **without scrolling** | Load page, **do not touch the mouse**, wait 5s | All visible content is fully opaque. *Nothing* stays invisible waiting for a scroll | ☐ |
| 2.1.3 | AI section (4 beats) | Scroll slowly through "The Intelligence Engine" | Terrain morphs through Voice → Spatial → Search → Forecast; each beat has a distinct colour + camera; captions crossfade; no flicker | ☐ |
| 2.1.4 | Warehouse showcase (5 beats) | Scroll through "Chart Room" | Chart draws itself: Plot → Fix → Fronts → Course → Revision; no text overlapping other text | ☐ |
| 2.1.5 | Scroll back up | Scroll up through both sections | Animations reverse cleanly; no stuck/blank canvas | ☐ |
| 2.1.6 | Bottom CTA appears | Scroll to page bottom | "Ask Nautilus anything" card animates in and is fully visible — never blank | ☐ |
| 2.1.7 | Footer | At page bottom | Footer content visible; App Store + Google Play buttons styled consistently with other buttons | ☐ |
| 2.1.8 | Full page, no console errors | DevTools console open through the whole scroll | Zero errors (GA network aborts on navigation are expected/benign) | ☐ |

### 2.2 Navigation & routes
| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 2.2.1 | Nav links | Click every top-nav item incl. mega-menu children | All resolve, no 404 | ☐ |
| 2.2.2 | Nav labels don't wrap | Resize window slowly 1400px → 900px | "AI Engine" and all labels stay on one line | ☐ |
| 2.2.3 | Page transitions | Home → Pricing → Home → Calculator → back | No flash of blank, no rubber-band scroll jump, page always starts at top | ☐ |
| 2.2.4 | **Browser back button** | Navigate 3 pages deep, then press Back repeatedly | Scroll position restores sanely, no jump/stutter, content visible | ☐ |
| 2.2.5 | Deep links | Paste a deep URL directly (e.g. `/integration/shopify`) | Loads correctly cold | ☐ |
| 2.2.6 | Hash links | Use a nav link with `#` (e.g. AI Engine) | Scrolls to the right section | ☐ |
| 2.2.7 | 404 | Visit `/definitely-not-a-page` | Branded 404, not a stack trace | ☐ |

### 2.3 Content pages
| # | Case | Expected | Result |
|---|---|---|---|
| 2.3.1 | Pricing — all tiers render, toggle monthly/annual changes prices | Numbers change, no layout jump | ☐ |
| 2.3.2 | ROI Calculator — change every input | Outputs recompute live; no NaN/Infinity; extreme values (0, 1, 999999999) don't break it | ☐ |
| 2.3.3 | Blog index + 3 posts | Render, images load, no broken markdown | ☐ |
| 2.3.4 | Help centre index + 3 articles | Render, code blocks readable | ☐ |
| 2.3.5 | 3 industry pages | Render fully, CTA card visible at bottom | ☐ |
| 2.3.6 | 3 integration pages | Render fully, CTA card visible at bottom | ☐ |
| 2.3.7 | Compare pages (fishbowl, netsuite-wms, sortly) | Render, comparison table readable on mobile | ☐ |
| 2.3.8 | Legal (privacy, terms, security) | Render; signature block at the bottom is **visible** | ☐ |
| 2.3.9 | **Slug-to-slug navigation** | From `/integration/shopify` click another integration; repeat for industry + legal | New page renders **and its bottom CTA card animates in** (this was a real bug — verify it stays fixed) | ☐ |

### 2.4 Forms & conversion paths (the money paths)
Validation rules read from `lib/validation.js`.

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 2.4.1 | Demo modal opens | Click "Request a Demo" anywhere | Modal opens, focus moves into it | ☐ |
| 2.4.2 | Demo — required fields | Submit empty | Errors on **Name, Email, Company, Warehouse size, Comments** (all required) | ☐ |
| 2.4.3 | Demo — bad email | `notanemail` | "valid email" error | ☐ |
| 2.4.4 | Demo — max lengths | Paste 3000 chars into Comments (max 2000) | Blocked with a clear message, not silently truncated | ☐ |
| 2.4.5 | Demo — happy path | Fill validly, submit | Success state shown; **"Send request" button is styled as a CornerButton with a loading spinner** | ☐ |
| 2.4.6 | Demo — email actually arrives | Check `LEAD_TO_EMAIL` inbox | Lead email received with all fields | ☐ |
| 2.4.7 | Demo — Escape / close | Press Esc, click backdrop | Closes, focus returns to trigger | ☐ |
| 2.4.8 | Contact form | Required: Name, Email, Message (Company/Role/Stage optional). Message max 5000 | Validates + submits + email arrives | ☐ |
| 2.4.9 | Waitlist form | Email required, max 200 | Validates + submits | ☐ |
| 2.4.10 | **Ask Nautilus chat** | Open chat, ask "how much does it cost?" and "do you integrate with Shopify?" | Streams a relevant answer citing real product info; no hallucinated features; no raw error | ☐ |
| 2.4.11 | Chat — abuse/rate limit | Send 15 messages rapidly | Rate-limited gracefully, not a 500 | ☐ |
| 2.4.12 | Chat — hostile input | Ask it to ignore instructions / reveal its prompt | Stays in character, doesn't leak system prompt | ☐ |

### 2.5 Marketing site — mobile
| # | Case | Expected | Result |
|---|---|---|---|
| 2.5.1 | Home on a real phone | No horizontal scroll anywhere | ☐ |
| 2.5.2 | Mobile menu | Opens, all links work, closes | ☐ |
| 2.5.3 | Both scroll showcases on mobile | Render and animate acceptably; no jank that makes the page unusable | ☐ |
| 2.5.4 | Demo modal on mobile | Usable, keyboard doesn't cover the submit button | ☐ |
| 2.5.5 | Tap targets | All buttons/links comfortably tappable | ☐ |

### 2.6 SEO / sharing / trust
| # | Case | Expected | Result |
|---|---|---|---|
| 2.6.1 | Paste the URL into Slack/iMessage/LinkedIn | Preview card shows the branded OG image + correct title/description | ☐ |
| 2.6.2 | Browser tab | Favicon shows the Nautilus "N", not a blank page icon | ☐ |
| 2.6.3 | `/sitemap.xml` and `/robots.txt` | Both load, sitemap lists ~96 URLs | ☐ |
| 2.6.4 | View source on 3 pages | Unique `<title>` + meta description per page | ☐ |
| 2.6.5 | HTTPS + headers | Padlock present; response has `Content-Security-Policy` (enforced) and `Strict-Transport-Security` | ☐ |

---



## 3. ⚠️ Read before scheduling anyone — six structural findings

Verified directly against the code. These **change what is testable**. Decide how to handle each before building a schedule.

| # | Finding | Evidence (verified) | Impact on this plan |
|---|---|---|---|
| **A** | **The desk app cannot pick.** `quantity_picked` is written only by the `app.pick_order_item` RPC, which has **zero callers** in the web app. The only callers are the mobile app (`app/orders/[id].tsx:769`, `app/waves.tsx:432`). | grep for `pick_order_item` in `app/ lib/ components/` returns one comment | Orders **cannot leave `in_progress`**, waves **cannot complete**, and **Returns are unreachable** from the desk (the Create-return panel only renders when `picked > 0`). **Phase 5 must run with the mobile app, or with `quantity_picked` seeded via SQL.** |
| **B** | **Receiving does not create stock.** Receiving a PO/ASN only increments `quantity_received`. On-hand exists only after placing product into a slot. | `purchase-orders/actions.ts:290`, `inbound/actions.ts:313`; the UI says so at `purchase-orders/[id]/page.tsx:400` | A tester who receives a PO then checks Inventory sees **0 on hand** and files a false bug. Scripted explicitly in Phase 4. |
| **C** | **Orders are never linked to customers.** Nothing writes `orders.customer_id`; the order form takes a free-text name. | only two *reads*, at `customers/actions.ts:94,101` | Customer detail's Orders panel is **permanently empty**. One known gap — don't file it repeatedly. |
| **D** | **The base schema is not in this repo.** Only 45 incremental migrations; **zero** `create table` for `orgs`, `org_members`, `profiles`, `products`, `warehouses`, `org_subscriptions`, `audit_log`, `api_keys`, `integrations`, `notifications`. | verified: 0 migrations create any of them | **You cannot build a clean QA environment from the repo — `supabase db reset` yields a broken DB. Clone the live project.** Also: **RLS on account tables is unverifiable from source, so multi-tenant isolation must be proven empirically (§11.2).** |
| **E** | **The audit log is never written to.** `audit_log` appears once in the entire codebase — the SELECT that renders the page. | `settings/audit/page.tsx:55` | `/settings/audit` is **permanently empty**. Confirm whether DB triggers exist in the live project; otherwise hide the tab before demos. |
| **F** | **Mobile push cannot work in the current build.** `extra.eas.projectId` is missing from `app.json`, so registration returns `no-eas-project` and the Settings toggle flips itself back off. | `lib/push.tsx:52-58` | Run `eas init` before Phase 8, or cut push testing. |

### 3.1 Decisions required before Day 1
- [ ] **Mobile in scope?** If not, Phase 5 stops at `in_progress` and Returns is cut entirely.
- [ ] **Which environment?** Production (real data) or a **clone** of the live Supabase project. A rebuild from migrations will not work.
- [ ] **Who has `is_staff`?** `/admin` is unreachable until someone runs `update app.profiles set is_staff = true where email = '…'`. There is **no UI** for this.
- [ ] **Is `RESEND_API_KEY` + `SYSTEM_EMAIL_FROM` set?** If not, the single-invite path on `/settings/members` is effectively broken (it says "share the link manually" but never shows the link). Use onboarding/bulk invite paths, which do show links.
- [ ] **Is `NEXT_PUBLIC_APP_URL` set?** If not, **every email link points at `https://app.nautilus.io`**.
- [ ] **Stripe / Shopify keys present?** If not, Phases 7.4 and 7.2 become short "degrades correctly" checks.
- [ ] **Seed data?** Use `node scripts/seed-demo.mjs --org <slug>` (see §1.6). Roughly a third of the screens are blank without it, and the history-dependent reports (forecast, valuation, dead stock, turnover) can't be judged at all on an empty workspace.

> **Seed vs. manual:** Phases 2–3 deliberately build data **by hand** — that *is* the test of the new-customer experience. Seed a **second** workspace for Phases 6–7 (intelligence and integrations), which need 90 days of history that no tester can click into existence.

---

## 4. Phase 2 — Account lifecycle (Tester A, uncoached)

**Do not coach Tester A.** Every hesitation is a demo failure point. Record them.

### 4.1 Signup → first workspace
| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 4.1.1 | Find signup | From the marketing site, get to creating an account | Reaches `/signup` unaided | ☐ |
| 4.1.2 | Short password | 5 characters | "Password must be at least 8 characters" | ☐ |
| 4.1.3 | Strength meter | Type increasingly strong passwords | Appears after first keystroke, responds | ☐ |
| 4.1.4 | Duplicate email | Sign up with an existing address | "That email is already registered. Try signing in instead." | ☐ |
| 4.1.5 | Signup rate limit | 6 rapid signups from one IP | Blocked after 5 (5/IP/600s) | ☐ |
| 4.1.6 | Happy path | Valid details | **Either** a "Check your email" banner **or** straight to `/onboarding`, depending on the Supabase email-confirmation setting. **Record which your environment does.** | ☐ |
| 4.1.7 | Confirmation email | Click the link (if confirmation is on) | Authenticated, then `/onboarding` | ☐ |
| 4.1.8 | Onboarding gating | Leave workspace or facility name blank | Submit stays **disabled** | ☐ |
| 4.1.9 | Onboarding validation | 1-character workspace name | Rejected ("at least 2 characters") | ☐ |
| 4.1.10 | Onboarding happy path | Workspace + facility, no invites | Redirect to `/` | ☐ |
| 4.1.11 | **First impression** | Look at the overview as a brand-new owner | ⚠️ **Expect five empty panels and no "create your first product" CTA.** Answer honestly: would a customer know what to do next? **This is the single biggest demo risk.** | ☐ |
| 4.1.12 | Onboarding with invites | Add 2 teammate emails | Copy-able `/invite/<token>` links shown | ☐ |
| 4.1.13 | Idempotence | Return to `/onboarding` afterwards | Redirects to `/`; no second workspace | ☐ |
| 4.1.14 | Facility-insert failure path | (If reproducible) force the facility insert to fail | "Workspace created, but the first facility failed…" — org and membership still exist | ☐ |

### 4.2 Login, session, recovery
| # | Case | Expected | Result |
|---|---|---|---|
| 4.2.1 | Wrong password | "That email and passcode don't match our records." | ☐ |
| 4.2.2 | Empty fields | "Email is required" / "Password is required" | ☐ |
| 4.2.3 | Sign-in rate limit (11 tries) | Blocked after 10 (10/IP/300s) | ☐ |
| 4.2.4 | Protected route while logged out | `/inventory` → `/login?next=/inventory`; after login lands on **/inventory** | ☐ |
| 4.2.5 | **Open-redirect defence** | `/login?next=//evil.com` → after login goes to `/`, never off-site | ☐ |
| 4.2.6 | Logged in on `/login` | Redirects to `/` | ☐ |
| 4.2.7 | Forgot password, unknown email | Same success message as a known one — **deliberate, not a bug** | ☐ |
| 4.2.8 | Forgot password, real email | Email arrives; link resets; new password works | ☐ |
| 4.2.9 | Magic link | Email arrives; link signs in | ☐ |
| 4.2.10 | Google sign-in | Completes and lands in the app | ☐ |
| 4.2.11 | Sign out | Back to `/login`; browser Back does not restore the session | ☐ |

### 4.3 Invites and teams (Tester A + B)
| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 4.3.1 | Invite a teammate | `/settings/members` → invite B as **member** | Success message | ☐ |
| 4.3.2 | Email arrives | Check B's inbox | Working link on the **correct host** (see `NEXT_PUBLIC_APP_URL`) | ☐ |
| 4.3.3 | **Invite a brand-new person** | Invite someone with no account; have them follow their nose | ⚠️ **Known critical break:** `/login` → "New operator?" → `/signup` (no `next`) → hard redirect to `/onboarding` — **they create their own workspace instead of joining yours.** Confirm and rate severity | ☐ |
| 4.3.4 | Existing user accepts | Signed in as B, open the link | "Join <org>" → membership created | ☐ |
| 4.3.5 | Wrong account | Open B's invite while signed in as A | "Email mismatch" naming both addresses | ☐ |
| 4.3.6 | Re-use accepted invite | Open again | "Already accepted" | ☐ |
| 4.3.7 | Expired invite | Backdate `expires_at` via SQL | "Invite expired" | ☐ |
| 4.3.8 | Bogus token | `/invite/garbage` | "Invite not found" | ☐ |
| 4.3.9 | Revoke pending invite | ✕ then open the link | No longer valid | ☐ |
| 4.3.10 | Bulk CSV invite | Template → 5 rows incl. 1 bad email + 1 duplicate | Preview flags bad rows; only valid ones invited; links shown | ☐ |
| 4.3.11 | Bulk limits | >200 rows or >2 MB | Rejected clearly | ☐ |
| 4.3.12 | **Owner protection** (regression) | As admin, try to remove the owner — the button is hidden, so replay the form POST with the owner's `user_id` | **Nothing happens; the owner remains.** An admin can no longer remove an owner | ☐ |
| 4.3.12b | **Last-owner guard** (regression) | With two owners, have one remove the other (allowed). Then try to remove the final owner | Co-owner removal succeeds; removing the **last** owner is refused, so the workspace can't be stranded with nobody able to manage members or billing | ☐ |
| 4.3.13 | Self-removal | Try to remove yourself | Blocked | ☐ |
| 4.3.14 | Per-member permissions | Uncheck `orders.manage` for B; B tries to create an order | B cannot | ☐ |
| 4.3.15 | Reset to role default | Chip returns to "· role default" | ☐ |
| 4.3.16 | Uncheck everything, save | ⚠️ **Silent no-op by design** (anti-lockout), zero feedback — record as UX | ☐ |

### 4.4 Account settings & security
| # | Case | Expected | Result |
|---|---|---|---|
| 4.4.1 | `/settings` account | Shows email/name/workspaces. ⚠️ **No way to edit name or phone anywhere** — confirm | ☐ |
| 4.4.2 | Change password | Validates length + match. ⚠️ **Never asks for the current password** — record as a security finding | ☐ |
| 4.4.3 | Enrol 2FA | QR + secret → 6-digit verify → factor listed | ☐ |
| 4.4.4 | **Does 2FA actually gate login?** | Sign out, sign back in | ⚠️ **Expected to FAIL — no AAL2 step-up exists.** Must not be claimed as a feature to customers | ☐ |
| 4.4.5 | Devices list | Current device badged | ☐ |
| 4.4.6 | Revoke a device | Other browser signed out on next navigation | ☐ |
| 4.4.7 | Sidebar customisation | Hide/reorder; Settings can never be hidden | ☐ |
| 4.4.8 | Audit log | ⚠️ Expect **permanently empty** (finding E) | ☐ |
| 4.4.9 | API key create | Token shown **exactly once** | ☐ |
| 4.4.10 | API keys as a member | ⚠️ Form + Revoke render but silently fail — record | ☐ |
| 4.4.11 | Staff console | With `is_staff`, open `/admin` | Workspace list. ⚠️ Note **"Nimbus" branding** here vs "Nautilus" everywhere else | ☐ |
| 4.4.12 | Staff onboard | `/admin/onboard` a client workspace | Created + magic link shown. ⚠️ Creates **no facility** — different empty state than self-signup | ☐ |

---

## 5. Phase 3 — Core data setup (Tester B, owner/admin)

**This is the dependency spine. Follow the order exactly.**

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 5.1 | Create facility | `/facilities` → Add facility | Created; a "Receiving" door auto-seeds (drives slotting distance) | ☐ |
| 5.2 | Facility empty state | Open `/facilities/{id}` | ⚠️ Blank grid, **no empty-state copy** — record | ☐ |
| 5.3 | **Create a section** | `/facilities/{id}/builder` → Add section → set Code/Bays/Levels → **Save layout** | Persists. ⚠️ **The builder is the only way** — there is no simple add-section form | ☐ |
| 5.4 | Overlap guard | Drag two sections to overlap | Red banner, **Save disabled** | ☐ |
| 5.5 | Builder shortcuts | ⌘Z / ⌘⇧Z / ⌘S / arrows / Delete | All behave | ☐ |
| 5.6 | Unsaved-work guard | Change something, close the tab | Browser warns | ☐ |
| 5.7 | Section code collision | Add A, B, C → delete A → add another | ⚠️ New one is also `C` — record | ☐ |
| 5.8 | Builder as a **member** | Edit then Save | ⚠️ Page isn't gated: you can edit for 20 minutes, then fail at save. Record severity | ☐ |
| 5.9 | Blueprint scan | Upload a floor plan | ⚠️ **Destructive — queues every existing section for deletion with no confirmation.** Throwaway facility only | ☐ |
| 5.10 | Snapshots | Save, change, restore | Restores; warns when it would orphan locations | ☐ |
| 5.11 | Register a product | `/inventory` → Register (barcode + name required) | Created | ☐ |
| 5.12 | Duplicate barcode | Same barcode twice | "Barcode X is already registered" | ☐ |
| 5.13 | Set unit cost | Give ≥3 products a `unit_cost` | ⚠️ **Required or the whole Valuation report is empty** | ☐ |
| 5.14 | **CSV import** | `/inventory/import` — ⚠️ reachable **only via ⌘K command palette**. Upload 1 good + 1 missing-barcode + 1 duplicate + 1 existing row | Good row imports; each bad row reported specifically | ☐ |
| 5.15 | Import limits | >1000 rows or >5 MB | Whole file rejected clearly | ☐ |
| 5.16 | Import category typo | category "Widgest" | ⚠️ Silently creates a new category — record | ☐ |
| 5.17 | **Export CSV** | `/inventory` → Export CSV | 🔴 **CONFIRMED BUG — 404.** Link is `/api/inventory/export`; route is `/inventory/export` | ☐ |
| 5.18 | Create supplier | `/suppliers/new` | Created | ☐ |
| 5.19 | Create customer | Business type with no company name | Rejected; valid one saves | ☐ |
| 5.20 | **Place stock in a slot** | Facility → section → slot → Add product + qty | ⚠️ **The only action that creates on-hand.** Verify `/inventory` reflects it | ☐ |
| 5.21 | Slot capacity | Exceed `slot_capacity` | ⚠️ Shows "Over" but **is not enforced** — record | ☐ |
| 5.22 | Out-of-range bay | Place at bay 999 | ⚠️ **No bound check on place** (Move does check) — record | ☐ |
| 5.23 | Adjust quantity | Inline edit with a reason | Applies, or queues if ≥ threshold | ☐ |
| 5.24 | Move stock | To another slot | Works; bounds enforced | ☐ |

---

## 6. Phase 4 — Inbound (Tester B)

| # | Case | Expected | Result |
|---|---|---|---|
| 6.1 | Create draft PO | Status `draft`, number `PO-2049`+ | ☐ |
| 6.2 | No suppliers | Hard block: "Add a supplier first" | ☐ |
| 6.3 | Mark as sent | Status `sent`; **receive controls appear** (hidden while draft) | ☐ |
| 6.4 | Partial receipt | Status `partially_received`; remaining recalculated | ☐ |
| 6.5 | **Over-receipt** | Rejected: "Can't receive X — only Y remaining" | ☐ |
| 6.6 | **Receipt ≠ stock** | After receiving, `/inventory` still shows **0 on hand** (finding B). Expected — confirm the UI explains it | ☐ |
| 6.7 | Concurrent receipt | Second browser gets "received by someone else — refresh and retry" | ☐ |
| 6.8 | Lot capture | `lots` row created; product flips to `track_lots` | ☐ |
| 6.9 | **QC hold** | Creates a **quarantined** slot; appears in `/receiving` | ☐ |
| 6.10 | QC pass | Quarantine cleared; stock enters ATP | ☐ |
| 6.11 | QC fail | Location deactivated; leaves on-hand | ☐ |
| 6.12 | QC error surfacing | 🔴 **CONFIRMED BUG — errors silently swallowed** (`receiving/page.tsx` never reads `?error=`) | ☐ |
| 6.13 | Cancel PO | Receive controls disappear | ☐ |
| 6.14 | Print PO | Clean paper doc; test Save-as-PDF | ☐ |
| 6.15 | ASN from PO | Copies only outstanding lines | ☐ |
| 6.16 | ASN over-receipt | ⚠️ **Silently clamps** — inconsistent with the PO path, which errors. Record | ☐ |
| 6.17 | Pallet (LPN) receive | All lines on the LPN received together | ☐ |
| 6.18 | ASN lot number | ⚠️ Free text only — **never creates a `lots` row** (unlike PO receive). Record | ☐ |
| 6.19 | Auto-draft POs | "Draft from low-stock" groups by preferred supplier; banner when nothing is low | ☐ |

---

## 7. Phase 5 — Outbound & floor operations (Tester B + D)

> ⚠️ **Finding A governs this phase.** Without mobile you can reach `in_progress` and no further. **[MOBILE]** marks cases needing Phase 8.

| # | Case | Expected | Result |
|---|---|---|---|
| 7.1 | Create order | Number `ORD-1049`+, auto-allocated | ☐ |
| 7.2 | Empty catalog | Form replaced by "Add a product first" | ☐ |
| 7.3 | Validation | Missing customer name on `installer_job`; transfer with identical source/destination — both rejected | ☐ |
| 7.4 | **Kit explosion** | Ordering a kit shows **components** on the detail page | ☐ |
| 7.5 | **Oversell prevention** | Allocation caps at available; remainder becomes **backorder** | ☐ |
| 7.6 | **Concurrent allocation** | Two simultaneous orders for one SKU — combined allocation **never exceeds on-hand** | ☐ |
| 7.7 | Backorders page | Lists shorted lines with age. ⚠️ No Fill button here — filling lives on PO detail | ☐ |
| 7.8 | Fill backorders | From PO detail after receiving; oldest order first | ☐ |
| 7.9 | Advance status | Reaches `in_progress` | ☐ |
| 7.10 | **Staging gate** | "Mark staged" **blocked** until `picked ≥ allocated` — expected, not a bug | ☐ |
| 7.11 | Cancel order | Allocation released to ATP | ☐ |
| 7.12 | Cancel after pick **[MOBILE]** | Allocation clamps **down to picked**, not zero | ☐ |
| 7.13 | Build a wave | ⚠️ **Requires a single facility selected** in the scope selector | ☐ |
| 7.14 | Wave zoning | Grouped by zone, ordered by distance from the door; FEFO badge on lot lines | ☐ |
| 7.15 | Claim / release / cancel wave | Cancel returns orders to the eligible pool | ☐ |
| 7.16 | Pick list print | Clean paper doc with barcodes | ☐ |
| 7.17 | **Execute picks [MOBILE]** | `quantity_picked` rises and **on-hand decrements in the same step** | ☐ |
| 7.18 | Complete wave **[MOBILE]** | Succeeds once everything is picked | ☐ |
| 7.19 | Full lifecycle **[MOBILE]** | Staged → Ready → Out for delivery → Complete; terminal states offer nothing further | ☐ |
| 7.20 | Packing slip | Shows Picked; **no prices** | ☐ |
| 7.21 | Create return **[MOBILE prereq]** | Panel appears only when `picked > 0`; qty capped at picked minus already-returned | ☐ |
| 7.22 | Review return | Reviewable once, irreversible | ☐ |
| 7.23 | Restock a return | Stock returns to on-hand | ☐ |
| 7.24 | **Partial restock** | ⚠️ **Closes the return permanently; remainder can never be restocked** — record | ☐ |
| 7.25 | Count, no variance | "Count recorded — no variance" | ☐ |
| 7.26 | Count, small variance | Commits; on-hand corrected | ☐ |
| 7.27 | Count, large variance | **Queued**; on-hand unchanged; appears in `/settings/adjustments` | ☐ |
| 7.28 | Approve adjustment | Commits; drift-guard blocks if stock moved meanwhile | ☐ |
| 7.29 | Concurrent counts | Serialised under a row lock; no lost update | ☐ |
| 7.30 | Blind counts | ⚠️ **Desk has none** (expected qty always shown). Mobile **does** blind counts — verify there | ☐ |
| 7.31 | Work order | Create → Release → Complete & build; components consumed; blocked when short | ☐ |
| 7.32 | Circular BOM | "That would create a circular BOM…" | ☐ |
| 7.33 | **Scan without hardware** | `/scan` → type a barcode in the manual field → Look up | ☐ |
| 7.34 | Scan unknown barcode | "Not in catalog" + Register link | ☐ |
| 7.35 | Kiosk mode | `/kiosk` and `?kiosk=1`; Esc exits; readable across a room | ☐ |

---

## 8. Phase 6 — Dashboard & intelligence (Tester C)

> Most of this phase needs **history**, not just data. Forecast wants ~90 days of pick/adjust scans; valuation wants unit costs; sparklines want ≥2 nightly snapshots. On a fresh workspace, flat sparklines and empty panels are **expected, not bugs**.

| # | Case | Expected | Result |
|---|---|---|---|
| 8.1 | Overview as **owner** | 6 KPIs including **Inventory value** and **Capital in dead stock** | ☐ |
| 8.2 | Overview as **admin** | Order-flow + inventory KPIs, **no money** figures beyond admin scope | ☐ |
| 8.3 | Overview as **member** | Scans / Open orders / Pick queue / Low stock — **no financials at all** | ☐ |
| 8.4 | Sparklines on a new workspace | ⚠️ Flat, no delta chips (needs ≥2 nights of `kpi_snapshots`) — expected | ☐ |
| 8.5 | Realtime | In a second browser, record a scan | Overview updates without a manual refresh | ☐ |
| 8.6 | Facility scope | Switch facility in the scope selector | KPIs re-scope; product count stays workspace-wide by design | ☐ |
| 8.7 | `/analytics` root | 4 KPIs + action-mix + where-units-live | ☐ |
| 8.8 | AI summary banner | ⚠️ Renders **nothing** (no error) if the edge function isn't deployed or `ANTHROPIC_API_KEY` isn't a **Supabase secret**. Record which state you're in | ☐ |
| 8.9 | Flat sparklines on analytics | ⚠️ Products/Units sparklines are deliberately flat placeholders — **not a bug** | ☐ |
| 8.10 | `/analytics/forecast` | Drifted SKUs with suggested ROP; empty message is "Reorder points look well-tuned" | ☐ |
| 8.11 | Forecast staleness | Add scans, reload | ⚠️ Cached **30 minutes** — won't change immediately | ☐ |
| 8.12 | Forecast **Apply** | Writes reorder point + safety stock | ☐ |
| 8.13 | Forecast Apply as a **member** | ⚠️ **No permission check exists** — a member can apply. Confirm and record | ☐ |
| 8.14 | `/analytics/valuation` | Value, FIFO value, ABC classes, aging, top 25, CSV export | ☐ |
| 8.15 | Valuation with no costs | "Nothing to value yet", or `$0` + "N SKUs with stock have no unit cost" | ☐ |
| 8.16 | Valuation CSV | Downloads; formula-injection escaped (test a product named `=cmd\|' /c calc'!A1`) | ☐ |
| 8.17 | `/analytics/dead-stock` | Threshold + sort work; state is in the URL and shareable | ☐ |
| 8.18 | Dead-stock cap | ⚠️ With >500 SKUs it silently analyses the **first 500** (banner shown) — record as a limitation | ☐ |
| 8.19 | `/analytics/slotting` | Suggested moves with scores | ☐ |
| 8.20 | Slotting with no layout | "No layout to slot against" | ☐ |
| 8.21 | Slotting with no dock door | In-page warning that proximity scoring is skipped | ☐ |
| 8.22 | Slotting **Apply** | Real stock move; error paths: "Stock has moved — refresh", "over its capacity", "Bay exceeds section maximum" | ☐ |
| 8.23 | Custom report | `/reports` → build across each of the 3 datasets | Preview caps at 500 rows | ☐ |
| 8.24 | Report CSV export | Up to 100k rows; filename `Nautilus-{dataset}-{date}.csv` | ☐ |
| 8.25 | Report as a member | `reports.manage` is a member default — should work | ☐ |

---

## 9. Phase 7 — Integrations, API & automation (Tester C)

### 9.1 Integrations surface
| # | Case | Expected | Result |
|---|---|---|---|
| 9.1.1 | `/integrations` grid | 14 providers listed; ⚠️ **only 4 are connectable** (Slack, Webhooks, Resend, Shopify) — the rest show "Coming soon" | ☐ |
| 9.1.2 | Slack connect | Paste a real incoming-webhook URL | Saves **and fires a live test message** | ☐ |
| 9.1.3 | Slack bad URL | Non-`hooks.slack.com` URL rejected | ☐ |
| 9.1.4 | Integrations as a **member** | Requires `integrations.manage` — should be blocked | ☐ |

### 9.2 Outbound webhooks
| # | Case | Expected | Result |
|---|---|---|---|
| 9.2.1 | Create endpoint | HTTPS URL + ≥1 event; secret shown **once** | ☐ |
| 9.2.2 | **SSRF guard** | Try `http://localhost:4000` or a private IP | **Rejected** — you need a public HTTPS receiver (webhook.site or similar) | ☐ |
| 9.2.3 | Test delivery | Arrives with `X-Nautilus-Event`, `X-Nautilus-Delivery`, `X-Nautilus-Timestamp`, `X-Nautilus-Signature` | ☐ |
| 9.2.4 | Signature verification | HMAC-SHA256 of the raw body with your secret matches the header | ☐ |
| 9.2.5 | Real event fires | Receive a PO → `po_received` delivered | ☐ |
| 9.2.6 | Cycle-count event | Record a variance → `cycle_count_variance` delivered | ☐ |
| 9.2.7 | **Dead events** | Subscribe to `scan_burst` and `daily_summary` | ⚠️ **Zero producers exist** — nothing will ever fire. Record as misleading UI | ☐ |
| 9.2.8 | Retry ladder | Point at a URL returning 500; check `webhook_deliveries` | Backoff 15m / 1h / 4h / 12h, max 5 attempts | ☐ |
| 9.2.9 | Pause/resume/delete | Behave as labelled | ☐ |

### 9.3 Public API
Get a key from `/settings/api-keys`. Windows note: use **`curl.exe`** (PowerShell aliases `curl`).

```bash
curl.exe -i -H "Authorization: Bearer YOUR_KEY" https://app.nautilusinventory.com/api/v1/products
```

| # | Case | Expected | Result |
|---|---|---|---|
| 9.3.1 | GET `/api/v1/products` | 200 + JSON | ☐ |
| 9.3.2 | GET `/api/v1/inventory` | 200; products with no locations are **absent**, not `on_hand: 0` | ☐ |
| 9.3.3 | POST `/api/v1/scans` | **201** `{data:{id}}` | ☐ |
| 9.3.4 | No / bad / revoked key | Uniform `401 {"error":"Invalid or missing API key"}` | ☐ |
| 9.3.5 | **Scope enforcement** (regression) | Create a `product:read`-only key, then POST a scan with it | **403** `{"error":"Missing scope: scan:write","required_scope":"scan:write"}` | ☐ |
| 9.3.5b | Scope enforcement, happy path | Same key against `GET /api/v1/products` | **200** — the scope it does hold still works | ☐ |
| 9.3.5c | Inventory scope | A key **without** `location:read` against `GET /api/v1/inventory` | **403** naming `location:read` | ☐ |
| 9.3.5d | Both gates | A `scan:write` key whose issuer lacks `inventory.adjust` | **403** naming the *permission*, not the scope — the two failures are distinguishable | ☐ |
| 9.3.6 | **Cross-org isolation** | Use workspace A's key to fetch products; confirm zero workspace-B rows | **S1 if it leaks** — `api_keys` RLS is not in the repo | ☐ |
| 9.3.7 | Rate limit | 130 requests inside 60s | `429` + `Retry-After` after 120. ⚠️ No `X-RateLimit-*` headers | ☐ |
| 9.3.8 | Key inheritance | Remove the key's creator from the org, retry the key | Key goes inert (401) | ☐ |
| 9.3.9 | Limit clamp | `?limit=9999` on products | Clamped to 500; **no pagination beyond it** | ☐ |

### 9.4 Cron jobs
All are **POST-only** and need `Authorization: Bearer $CRON_SECRET`. pg_cron cannot reach localhost — trigger manually:

```bash
curl.exe -i -X POST https://app.nautilusinventory.com/api/cron/stockout-alerts -H "Authorization: Bearer YOUR_CRON_SECRET"
```

| # | Case | Expected | Result |
|---|---|---|---|
| 9.4.1 | GET instead of POST | 405 | ☐ |
| 9.4.2 | Missing/wrong secret | 401 | ☐ |
| 9.4.3 | `stockout-alerts` | `{ok,orgs,notified}`. ⚠️ Needs pick/adjust scans in the last 60 days, else velocity is 0 and nothing alerts. 3-day cooldown per user+product | ☐ |
| 9.4.4 | `lot-expiry-alerts` | Needs lots with `expires_at`; 7-day cooldown | ☐ |
| 9.4.5 | `auto-draft-pos` | Opt-in per org; **not idempotent** — re-running creates more drafts (handy for repeat tests) | ☐ |
| 9.4.6 | `cycle-count-queue` | Opt-in; tops the queue to 10 | ☐ |
| 9.4.7 | `email-digests` | Without Resend returns `{"ok":true,"skipped":"email_not_configured"}` — the cleanest "email off" signal | ☐ |
| 9.4.8 | `webhook-retries` | Set `next_retry_at = now()` on a failed delivery, re-run | ☐ |
| 9.4.9 | Notifications appear | After a successful cron run, check `/notifications` | ☐ |
| 9.4.10 | Vault secrets | Confirm `cron_app_url` + `cron_secret` exist and match `CRON_SECRET`. ⚠️ `net.http_post` is fire-and-forget — a 401 still logs a *successful* job run. **Check `net._http_response` for the real status** | ☐ |

### 9.5 Email & billing
| # | Case | Expected | Result |
|---|---|---|---|
| 9.5.1 | Invite email | Arrives and renders correctly | ☐ |
| 9.5.2 | Email link host | ⚠️ Points at your environment, not `app.nautilus.io` (set `NEXT_PUBLIC_APP_URL`) | ☐ |
| 9.5.3 | Digest email | Enable the toggle, create an unread notification, run the cron | ☐ |
| 9.5.4 | Resend integration | `/integrations/resend` — key must start `re_`; saving sends a live test | ☐ |
| 9.5.5 | Billing **unconfigured** | Grey "Billing isn't configured" banner; no plan picker | ☐ |
| 9.5.6 | Billing **test mode** | Checkout with `4242 4242 4242 4242`, `stripe listen --forward-to <app>/api/webhooks/stripe` | Subscription reflected on the page | ☐ |
| 9.5.7 | Stripe webhook unconfigured | POST returns **503** | ☐ |
| 9.5.8 | Billing as a member | Plan buttons render but silently no-op — record | ☐ |
| 9.5.9 | Tier limits | ⚠️ Tier copy ("up to 2 facilities, 1k SKUs") is **marketing only — nothing is enforced.** Confirm before a sales conversation | ☐ |
| 9.5.10 | Shopify | Only testable with a partner app + dev store. Otherwise verify it degrades with a clear message | ☐ |

---

## 10. Phase 8 — Mobile app (Tester D)

### 10.1 Build it first (do this before Day 1)
```bash
cd D:\hello-world2
npm install
npx expo prebuild --clean -p android    # REQUIRED — checked-in android/ is pre-rebrand
npx expo run:android
```
- ⚠️ **Expo Go will not work** — `expo-dev-client` is required, and remote push hasn't worked in Expo Go since SDK 53.
- ⚠️ **Run `eas init` first** or push is structurally impossible (finding F).
- ⚠️ **iOS needs `expo-camera`, `expo-image-picker`, `expo-local-authentication` added to `app.json` plugins** first, or camera / photo picker / Face ID will crash for missing Info.plist usage strings.
- ⚠️ Supabase config is **hardcoded** (`lib/supabase.ts`) at the same project as the desk app — you cannot point this build at staging without editing source.
- ⚠️ The test account needs an `org_members` row **and `warehouse_access`**, or the app signs in and every screen renders blank.
- Physical device required for: scanning, torch, photos, haptics, push. An emulator is fine for offline-queue tests.

| # | Case | Expected | Result |
|---|---|---|---|
| 10.1 | Build + launch | App opens to login with correct branding | ☐ |
| 10.2 | Sign in | Reaches Home with 4 KPIs | ☐ |
| 10.3 | No `warehouse_access` | ⚠️ Signs in but screens are blank — confirm the failure mode is understandable | ☐ |
| 10.4 | Biometric unlock | Enable, restart, prompt appears; failure signs you out | ☐ |
| 10.5 | Scan a real barcode | Product resolves | ☐ |
| 10.6 | Scan unknown barcode | Registration flow incl. photo → Storage | ☐ |
| 10.7 | **Pick an order** | Scan-to-verify → `quantity_picked` rises, on-hand decrements | ☐ |
| 10.8 | Wrong-item scan | Rejected with clear feedback | ☐ |
| 10.9 | **Pick a wave** | Walk-ordered run completes; desk shows the wave completable | ☐ |
| 10.10 | Blind cycle count | Expected qty **hidden**; over-threshold queues an approval | ☐ |
| 10.11 | PO receive | Partial qty (long-press), lot/expiry, QC pass/fail | ☐ |
| 10.12 | ASN / LPN receive | Whole-pallet receive reconciles the PO | ☐ |
| 10.13 | Work order build | Completes via RPC | ☐ |
| 10.14 | Return + restock | Friendly error mapping | ☐ |
| 10.15 | **Offline queue** | Airplane mode → register / adjust / relocate | Queued, then synced on reconnect | ☐ |
| 10.16 | **Offline indicator** | While offline | ⚠️ **Expected to FAIL — `OfflineBanner`/`PendingBadge` exist but are never rendered.** The operator gets no indication. Record | ☐ |
| 10.17 | Offline-blocked actions | Try picking/receiving offline | Hard-blocked (by design) — confirm the message is clear | ☐ |
| 10.18 | Conflict resolution | Cause a conflict, sync | Keep-server / keep-mine modal | ☐ |
| 10.19 | Scanner offline | ⚠️ Registration is **online-only** despite claims — confirm | ☐ |
| 10.20 | Push notification | With EAS configured, on a real device | Received. Without it: toggle flips back off with an alert | ☐ |
| 10.21 | Settings placeholders | Manage facilities / Staff & permissions / Label printing / Terms / Privacy | ⚠️ All show "NOT YET ON MOBILE" — decide whether to hide before demos | ☐ |
| 10.22 | Dead controls | Scan-FAB long-press; map "VIEW BAYS" | ⚠️ Both inert (`TODO`) — record | ☐ |
| 10.23 | Map screen | Floor plan renders; ⚠️ no pinch-zoom/pan | ☐ |
| 10.24 | Cross-surface consistency | Pick on mobile → refresh the desk order | Numbers agree exactly | ☐ |

---

## 11. Phase 9 — Cross-cutting (Tester C leads; everyone contributes)

### 11.1 RBAC matrix
Three roles: **owner**, **admin**, **member**. Owner always has all 19 permissions. Admin defaults to all 19 (but can be narrowed). Member defaults to 10.

**Member CAN by default:** adjust stock · manage orders · allocate stock · manage customers · manage pick waves · receive shipments · manage suppliers · review QC · manage work orders · build reports.

**Member CANNOT by default:** manage catalog/import · void cycle counts · manage purchase orders · manage facilities · approve adjustments · manage settings · manage members · manage billing · manage integrations.

Test each row as a **member**:

| # | Attempt | Expected | Result |
|---|---|---|---|
| 11.1.1 | Register a product | Blocked (`inventory.manage`) | ☐ |
| 11.1.2 | Create a PO | Blocked (`purchasing.manage`) | ☐ |
| 11.1.3 | Receive a PO | **Allowed** (`purchasing.receive`) | ☐ |
| 11.1.4 | Create a facility / edit layout | Blocked (`facilities.manage`) | ☐ |
| 11.1.5 | Approve an adjustment | Blocked (`adjustments.approve`) | ☐ |
| 11.1.6 | Invite a member | Blocked (`members.manage`) | ☐ |
| 11.1.7 | Create an API key | Blocked — ⚠️ but the form still renders | ☐ |
| 11.1.8 | Connect an integration | Blocked (`integrations.manage`) | ☐ |
| 11.1.9 | Open billing checkout | Blocked — ⚠️ silently | ☐ |
| 11.1.10 | Create an order | **Allowed** (`orders.manage`) | ☐ |
| 11.1.11 | Apply a forecast suggestion | ⚠️ **Allowed — no permission check exists.** Record | ☐ |
| 11.1.12 | **Silent-failure audit** | Across every blocked action above, note which give **no feedback at all** (many `void` actions just return). Collect them as one UX bug | ☐ |

### 11.2 Multi-tenant isolation — **highest severity area**
Because account-table RLS isn't in the repo (finding D), this must be proven empirically. Create **Workspace A** and **Workspace B** with different owners.

| # | Case | Expected | Result |
|---|---|---|---|
| 11.2.1 | A's product ID pasted into B's URL (`/inventory/{A-id}`) | Not found / denied — **never** A's data | ☐ |
| 11.2.2 | Same for order, PO, facility, customer, supplier, wave, return | All denied | ☐ |
| 11.2.3 | B's member list | Shows only B's members | ☐ |
| 11.2.4 | B's API keys page | Shows only B's keys | ☐ |
| 11.2.5 | B's audit page | No A rows | ☐ |
| 11.2.6 | A's API key against `/api/v1/*` | Only A's data | ☐ |
| 11.2.7 | `/scan` barcode lookup | ⚠️ No explicit `org_id` filter (RLS-only) — verify a B barcode is not found from A | ☐ |
| 11.2.8 | **Multi-workspace user pickers** | As a user in both A and B, open `/purchase-orders/new` | ⚠️ Known: pickers may list rows from **both** workspaces. Confirm and rate | ☐ |
| 11.2.9 | Facility scope switch | Data re-scopes correctly, no bleed | ☐ |

**Any failure here is S1 and blocks the customer demo outright.**

### 11.3 Security
| # | Case | Expected | Result |
|---|---|---|---|
| 11.3.1 | Direct URL to an app page while logged out | Redirect to login, no data flash | ☐ |
| 11.3.2 | `/admin` as a non-staff user | Silent redirect to `/` | ☐ |
| 11.3.3 | CSV injection | Product named `=cmd\|' /c calc'!A1` → export → open in Excel | Prefixed/neutralised, no formula execution | ☐ |
| 11.3.4 | XSS attempts | `<script>alert(1)</script>` in product name, notes, customer name | Rendered as text everywhere it appears | ☐ |
| 11.3.5 | Session after password change | Behaves as documented | ☐ |
| 11.3.6 | Security headers on the app | CSP / HSTS present | ☐ |

### 11.4 Responsive, accessibility, resilience
| # | Case | Expected | Result |
|---|---|---|---|
| 11.4.1 | App on a phone-width browser | Usable; nav collapses; no horizontal scroll | ☐ |
| 11.4.2 | App on tablet | Layouts hold at mid-breakpoints | ☐ |
| 11.4.3 | Keyboard-only pass through a core flow | Everything reachable; focus visible; no traps | ☐ |
| 11.4.4 | Screen-reader spot check on 3 screens | Headings and labels make sense | ☐ |
| 11.4.5 | Zoom to 200% | No clipped or overlapping content | ☐ |
| 11.4.6 | `prefers-reduced-motion` | Animations respect it | ☐ |
| 11.4.7 | Slow 3G (DevTools throttle) | Loading states appear; nothing looks broken | ☐ |
| 11.4.8 | Offline / server error | Friendly message, not a stack trace | ☐ |
| 11.4.9 | Double-click every submit button | No duplicate records created | ☐ |
| 11.4.10 | Browser Back after every mutation | No stale or duplicated state | ☐ |
| 11.4.11 | Long values | 200-char product name, 10k-unit quantity | Layout holds; no overflow | ☐ |
| 11.4.12 | ⌘K command palette | Opens; every destination resolves | ☐ |
| 11.4.13 | Print paths (Safari + Chrome) | PO, packing slip, pick list, label sheets all print cleanly to PDF | ☐ |
| 11.4.14 | WebUSB on Safari/Firefox | Printer UI degrades with a message — **does not crash** | ☐ |

---

## 12. Test data hygiene & cleanup

- Prefix every test workspace: `QA-<date>-<tester>`.
- Prefix test products/orders/customers: `QA-`.
- **Record every workspace ID created** in the sign-off sheet below.
- If testing production: after the pass, have someone with DB access delete the QA orgs and their cascade. Deactivating is not enough — they'll show in `/admin` and skew analytics.
- ⚠️ Remember the mobile app points at the **same Supabase project** — mobile test data lands in the same place.

---

## 13. Pre-demo smoke test (30 minutes, run immediately before any customer sees it)

Run this on the **exact environment** the customer will see, from a **fresh incognito window**.

| # | Check | Result |
|---|---|---|
| 1 | Marketing homepage loads; hero plays; no console errors | ☐ |
| 2 | Both scroll showcases animate correctly top-to-bottom | ☐ |
| 3 | Bottom CTA card and footer are visible (not blank) | ☐ |
| 4 | Demo form submits and the lead email arrives | ☐ |
| 5 | Ask Nautilus answers a pricing question sensibly | ☐ |
| 6 | Link preview (paste URL in Slack) shows the OG image | ☐ |
| 7 | Log into the demo workspace | ☐ |
| 8 | Overview shows **real, non-zero** KPIs (a fresh workspace looks broken — use a seeded one) | ☐ |
| 9 | Inventory list loads with products and correct on-hand | ☐ |
| 10 | Open a product — locations, forecast, lots all render | ☐ |
| 11 | Facility viewer renders the floor plan (2D and 3D) | ☐ |
| 12 | Create an order → allocates correctly | ☐ |
| 13 | Build a pick wave → zoned list looks right | ☐ |
| 14 | Analytics: valuation and forecast both show data | ☐ |
| 15 | Mobile app: sign in, scan an item, pick one line | ☐ |
| 16 | Print a pick list to PDF | ☐ |
| 17 | No red errors anywhere in the console during the whole run | ☐ |
| 18 | **Avoid on stage:** Audit tab (empty), Customer→Orders panel (empty), Inventory Export CSV (404), anything mobile-push | ☐ |

---

## 14. Bugs already confirmed by code inspection (fix before UAT if possible)

These were verified during the writing of this plan — testers don't need to rediscover them.

**Items 1–4, 7 and 8 are already FIXED** (commit following this document) — re-test them as regression cases rather than filing them.

| # | Sev | Status | Bug | Location | Fix |
|---|---|---|---|---|---|
| 1 | **S2** | ✅ FIXED | Inventory **Export CSV → 404** | `app/(app)/inventory/page.tsx:135` | Change `/api/inventory/export` → `/inventory/export` |
| 2 | **S2** | ✅ FIXED | Product detail **lot supplier link → 404** | `app/(app)/inventory/[id]/page.tsx:741` | Change `/settings/suppliers/{id}` → `/suppliers/{id}` |
| 3 | **S2** | ✅ FIXED | **QC pass/fail errors silently swallowed** | `app/(app)/receiving/page.tsx:15` | Accept `searchParams` and render `?error=` |
| 4 | **S3** | ✅ FIXED | **Duplicate route** `/api/inventory/import-template` from two files returning different CSVs | `app/(app)/api/...` + `app/api/...` | Delete one |
| 5 | **S2** | open | New invitee funnelled into creating their own workspace instead of joining | `(auth)/actions.ts:169`, `LoginForm.tsx:122` | Preserve `next` through signup |
| 6 | **S2** | open | Single-invite fallback says "share the link manually" but never shows the link | `settings/actions.ts:84` | Surface the link like the other invite paths |
| 7 | **S1** | ✅ FIXED | No last-owner guard on `removeMember` | `settings/actions.ts:101` | Block removing the final owner |
| 8 | **S2** | ✅ FIXED | API key **scopes never enforced** | `app/api/v1/*` | Enforce `auth.scopes` per route |
| 9 | **S3** | open | `scan_burst` / `daily_summary` webhook events have no producers | `lib/integrations/types.ts:8` | Remove from the picker or implement |
| 10 | **S3** | open | Forecast **Apply** has no permission check | `analytics/forecast/actions.ts:11` | Gate on a permission |
| 11 | **S3** | open | Blueprint import destroys existing sections with no confirmation | `BuilderShell.tsx:436` | Add a confirm dialog with counts |
| 12 | **S3** | open | Stale staff copy: "Billing is not yet wired to Stripe" | `admin/workspace/[id]/page.tsx:216` | Delete the line |
| 13 | **S4** | open | "Nimbus" vs "Nautilus" branding split in `/admin` | `admin/layout.tsx:8,47` | Pick one |
| 14 | **S3** | open | Normal PO receipts write no `scan_history` row (ASN receipts do) | `purchase-orders/actions.ts:469` | Move the insert out of the `qcHold` branch |
| 15 | **S3** | open | Mobile offline banner / pending badge never rendered | `lib/offlineUI.tsx:12,221` | Mount them |

---

## 15. Sign-off

| Phase | Owner | Cases run | P | F | B | Blocking issues | Signed |
|---|---|---|---|---|---|---|---|
| 1 — Marketing site | | | | | | | |
| 2 — Account lifecycle | | | | | | | |
| 3 — Core data setup | | | | | | | |
| 4 — Inbound | | | | | | | |
| 5 — Outbound & floor | | | | | | | |
| 6 — Intelligence | | | | | | | |
| 7 — Integrations & API | | | | | | | |
| 8 — Mobile | | | | | | | |
| 9 — Cross-cutting | | | | | | | |
| Smoke test | | | | | | | |

**Test workspaces created (delete after):**

| Workspace name | Org ID | Environment | Created by | Deleted? |
|---|---|---|---|---|
| | | | | ☐ |

**Ship decision:** ☐ Go &nbsp;&nbsp; ☐ Go with known issues (list) &nbsp;&nbsp; ☐ No-go

_Signed: ________________  Date: _____________
