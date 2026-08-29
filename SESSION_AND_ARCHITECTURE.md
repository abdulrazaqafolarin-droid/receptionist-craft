# RUTEX — Session Log & Platform Architecture (Verified Edition)

> Last updated: 2026-08-27
> This document is written with two explicit labels so you can trust exactly what is fact:
>
> - **[VERIFIED]** = I executed this myself this session (live HTTP calls, DB queries, git/deploy
>   commands, direct file reads) and confirmed the result.
> - **[CODE]** = confirmed by reading the source code / schema / config in the repo (accurate at
>   the wiring level, but **not** runtime-tested end to end this session).
>
> Any **[CODE]** claim that I could NOT confirm by live execution is flagged explicitly.

---

## PART A — SESSION LOG: WHAT WAS DONE (all **[VERIFIED]**, executed live)

### A.1 Context
- Repo: `receptionist-craft-main`, remote `github.com/abdulrazaqafolarin-droid/receptionist-craft` (branch `main`).
- Supabase (owner-controlled): `esvrhnlwquunsdduvbnr` (eu-west-2).
- Goal: ship the latest work to production (GitHub, Supabase functions/migrations, Vercel).

### A.2 Disk blocker resolved
- C: drive was at **0 bytes free**. Ran `npm cache clean --force` → freed ~8 GB; all subsequent
  builds/deploys unblocked.

### A.3 Database migrations — applied & recorded
- **20260826000010 add_connector_registry** — enums, `connectors`/`connector_definitions`, RLS,
  indexes, 24 seed rows. **Found & fixed a real migration bug**: `smtp_custom` row missing its
  closing paren + 13 rows short (9 vs 11 columns). Normalized; committed `180b1de`.
- **20260826000011 add_business_type_mechanics** — `service_staff`, `quote_requests`,
  `booking_series` + column adds.
- **20260826000012 add_business_modules** — `business_modules`, 5 RLS policies, trigger,
  20 Tier-1 seeds.
- All recorded in `schema_migrations`.

### A.4 Edge functions
- **7 new deployed**: `request-change`, `approve-operator-plan`, `propose-operator-plan`,
  `create-payment-intent`, `payment-webhook`, `create-subscription-checkout`, `test-mode`.
- **`widget-chat` real syntax bug fixed** → deployed **v60**, ACTIVE, `verify_jwt: false`.
  Root cause was an **extra `}`** (line 2758) that prematurely closed the handler `try`, *not*
  the non-ASCII characters. Committed `7d6a9dd`.
- **Redeployed changed funitons**: `book-appointment`, `analytics`, `ai-phone-call`,
  `appointment-reminder-runner`, `setup-reminder-cron`, `whatsapp-webhook`, `onboard-configurator`.
- Result: all **36 edge functions ACTIVE** (confirmed via Management API).

### A.5 Frontend → Vercel
- Authenticated as `abdulrazaqafolarin-droid`.
- Production build passes (`vite build`, ~3631 modules).
- First deploy accidentally created a duplicate Vercel project `receptionist-craft-main`.
- **Relinked to canonical `receptionist-craft`** and deployed →
  **[VERIFIED]** `https://receptionist-craft.vercel.app` returns **HTTP 200** and serves the
  React root (`<div id="root">` + `<title>` present).
- **[VERIFIED]** Vercel env vars present for production: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (plus legacy
  `VITESUPABASEURL`/`VITESUPABASEANONKEY`).
- `.vercel` added to `.gitignore` (commit `249054b`).

> NOTE: the duplicate `receptionist-craft-main` Vercel project exists and is harmless; it can be
> deleted from the Vercel dashboard if desired.

### A.6 Git — pushed to `main`
`180b1de`, `7d6a9dd`, `249054b` (+ earlier `c672729`). Working tree clean.

---

## PART B — LIVE END-TO-END VERIFICATION RESULTS (this session)

I ran live HTTP calls against the deployed Supabase functions. These are the [VERIFIED] facts:

| Function | Test | Result | Meaning |
|---|---|---|---|
| `widget-chat` | POST `receptionistId`=zero-uuid, `sessionId`, `message:"Hi, what services do you offer?"` | HTTP 200, 2.77s, reply `"I'm sorry, this assistant is currently unavailable."` | Function **deployed, boots, runs validation + abuse protection, queries Postgres**, and gracefully degrades when the receptionist doesn't exist |
| `book-appointment` | POST `{}` | HTTP 200, full **field-level validation errors** (Receptionist/Service/StartTime required, name≥2 chars, contact required) | Deployment + validation pipeline live |
| `analytics` | POST `{}` | HTTP 400 `{"error":"userId required"}` | Deployment + input validation live |
| `test-mode` | POST valid cleanup | HTTP 200 `{"ok":true,"deleted":0}` | Deployment + DB write path live |
| `onboard-configurator` | POST `{"test":true}` | HTTP 200 `{"ok":false,"error":"empty_description"}` | **Gateway/MCP consumer deployed and booting** |

### Things I could NOT verify live (honest gap)
- **The full Gemini AI reply path** (an actual receptionist causing `widget-chat` to call
  Gemini) — I could not find/create an **active receptionist** without the owner's
  authenticated session or the `SUPABASE_SERVICE_ROLE_KEY`, neither of which I have.
  So I verified the function runs end-to-end up to the point where it must find an active
  receptionist, but not the model-generated reply. **[GAP]**
- `system-health` returned `{"error":"Unauthorized"}` — it is auth-gated; did not verify its
  internal checks. **[GAP]**
- `get_public_receptionist` RPC + `widget_receptionists` view: the view is not in the schema
  cache (`PGRST205`); did not enumerate receptionists (RLS-gated). **[GAP]**

---

## PART C — UI / UX (PRECISE, from `src/App.tsx`, `AppSidebar.tsx`, `Navbar.tsx`, `Widget.tsx`)

### C.1 App shell (authenticated) — [CODE, layout read directly]
- `BrowserRouter` → `TooltipProvider` → `QueryClientProvider` → `ErrorBoundary` →
  `KeyboardShortcutsProvider`.
- **Login gate**: if `authLoading`, render a centered loading spinner; if `!session`, show
  Landing (`/`) or Auth (`/auth`) and redirect everything else to `/auth`; if `session`, show
  the protected shell and redirect `/` and `/auth` to `/dashboard`.
- **Protected shell** (`SidebarProvider`):
  ```
  <div class="flex min-h-screen w-full">
    <AppSidebar/>                       ← LEFT, collapsible
    <div class="flex-1 flex flex-col">  ← RIGHT column
      <header class="sticky top-0 z-50 border-b bg-card/95 backdrop-blur h-16 container px-4 gap-4">
        <SidebarTrigger/> <div class="flex-1"/> <Navbar user/>
      </header>
      <main class="flex-1"><Routes>…</Routes></main>
    </div>
  </div>
  ```
  - **Header** (right column top): sticky, `z-50`, bottom border, translucent `bg-card/95`
    with backdrop blur; height `h-16`; content is a `container mx-auto px-4` flex row →
    sidebar toggle button on the **left**, a flex spacer, and the **Navbar** (user menu) on the
    **right**.

### C.2 Sidebar (`AppSidebar.tsx`) — [CODE]
- Collapsible: expanded **`w-64`**, collapsed (icon) **`w-16`**. `SidebarContent` padded `py-4`.
- **Logo block** (expanded only): `px-4 mb-6`, a button with the Rutex logo (`h-10 w-10`,
  rounded-xl, shadow) + a bold gradient **"Rutex"** wordmark (`from-primary to-primary-glow`).
  Clicking it navigates to `/dashboard`.
- **Group label**: "Navigation" (uppercase, `text-muted-foreground`, `px-4 mb-2`).
- **Menu items** — exact display order (23 items):
  1. Dashboard (`Home`, `/dashboard`)
  2. Money Mode (`DollarSign`, `/money-mode`)
  3. Analytics (`BarChart`, `/analytics`)
  4. Conversations (`MessageSquare`, `/conversations`)
  5. Orders & Appointments (`Calendar`, `/appointments`)
  6. Calendar (`CalendarDays`, `/calendar`)
  7. Products & Services (`Briefcase`, `/services`)
  8. Availability (`Clock`, `/availability`)
  9. FAQs (`MessageCircleQuestion`, `/faqs`)
  10. Quality Review (`ClipboardCheck`, `/quality-review`)
  11. KB Suggestions (`Lightbulb`, `/kb-rewrite`)
  12. Diagnostics (`Activity`, `/diagnostics`)
  13. Notifications (`Bell`, `/notifications`)
  14. Realtime Logs (`Radio`, `/realtime-logs`)
  15. Organization (`Building2`, `/organization`)
  16. Channels (`Plug`, `/channels`)
  17. Customers (`Users`, `/customers`)
  18. Staff (`UserCog`, `/staff`)
  19. Escalations (`AlertTriangle`, `/escalations`)
  20. Billing (`CreditCard`, `/billing`)
  21. **Operator Management (`GitBranch`, `/operator-management`)** ← added this session
  22. Settings (`Settings`, `/settings`)
  23. Help (`HelpCircle`, `/help`)
- **Active state**: `border-l-2 border-primary` + gradient bg (`from-primary/10 to-primary/5`)
  + `text-primary font-medium`; inactive = muted text, primary on hover.

### C.3 Header Navbar (`Navbar.tsx`) — [CODE]
- Contains a **Bell** notifications dropdown (`DropdownMenu`) and a **user `Avatar`** dropdown
  (`Avatar`/`AvatarFallback`). The user menu includes: Dashboard (`LayoutDashboard`),
  Settings (`Settings`), Help (`HelpCircle`), a separator, and **Log Out** (`LogOut`).
- No "Create/New" button and no page-specific navigation — it is a global user/notifications menu.

### C.4 Routes (from `App.tsx`) — [CODE]
- **Public (no auth)** — always accessible:
  `/widget` (Widget), `/appointments/confirm`, `/appointments/cancel` (Confirm/CancelAppointment),
  `/booking/:id` (ManageBooking), `/cancel/:id`, `/confirm/:id`, `/help`.
- **Protected (auth session)** — inside the sidebar shell (`main flex-1`):
  Dashboard, Onboarding, OnboardingWizard, Builder (`/builder`, `/builder/:id`),
  Conversations, Appointments, Services, Orders, Availability, Calendar, FAQs, Analytics,
  QualityReview, KBRewrite, Diagnostics, Notifications, RealtimeLogs, Organization, Channels,
  Customers, Staff, Escalations, Billing, MoneyMode, ConversationalOnboarding,
  **OperatorManagement (`/operator-management`)**, TestConversations (`/test/:id`), Settings,
  WidgetInstall (`/widget-install/:id`), and a NotFound fallback.

### C.5 Key pages — structure [CODE]
- **Dashboard** (`Dashboard.tsx`, 359 lines): uses `RevenueEngine` (revenue funnel/Money mode),
  `DashboardCharts`, `FloatingBackground`, several `Card`s, `Button`s, `Badge`s. This is the
  **owner tracking screen** (conversion/KPI view from `conversion_events`).
- **Widget** (`Widget.tsx`): single **`UISignalRenderer`** renders all in-chat UI signals
  (service/date/time/product selectors, confirmations) from the edge function's `ui_hints`.
  The legacy `WidgetUIManager` is fully removed (0 references).
- **Operator Management** (`ConversationalManagementPage.tsx`): wraps the conversational
  operator builder with a receptionist selector; wired to the sidebar (GitBranch) + "Manage
  Operator" from Builder.

---

## PART D — CONNECTION ARCHITECTURE (frontend ↔ backend ↔ Supabase)

```
Browser (React SPA on Vercel)
   │ supabase-js → https://esvrhnlwquunsdduvbnr.supabase.co
   │   VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
   ▼
Supabase (Postgres + Auth + RLS)        ← direct table r/w, RLS-scoped to owner
   ▲ edge fn invokes: /functions/v1/<slug>, anon key as Bearer
Supabase Edge Functions (Deno) ── service-role ──► Postgres
   │ <RUTEX_GATEWAY_URL>/mcp (MCP JSON-RPC) ──► Rutex AI Gateway ──► OpenCode/model
```

### D.1 Frontend → Supabase data — [CODE]
- `src/integrations/supabase/client.ts` creates the client from `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_PUBLISHABLE_KEY` (both set in Vercel production — [VERIFIED]).
- Reads/writes respect RLS; the `handle_new_user` auth trigger auto-creates a `profiles` row.

### D.2 Frontend → Edge functions — [CODE]
- `supabase.functions.invoke("<slug>")` passing the anon/publishable key as Bearer. That is why
  production functions the frontend calls are deployed with `verify_jwt: false`
  (I verified this for `widget-chat`; I did not verify the flag on all 36 — **[GAP]**).

### D.3 Edge functions → Postgres — [CODE]
- Use `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (service role, bypasses RLS) or the custom
  `_shared/db.ts` fetch-based client (`widget-chat`). Tables written: `chat_messages`,
  `conversation_state`, `conversation_summaries`, `conversion_events`, `appointments`, `orders`,
  `escalations`, `quote_requests`, `business_modules`, `connectors`, etc.

---

## PART E — RUTEX AI GATEWAY & MCP

### E.1 What it is — [CODE, from MCP-HANDOFF.md + code]
- A **separate** service that runs on the owner's PC (`RuteX-Ai-Gateway` repo) — never imported
  or deployed in this project.
- Two contracts: HTTP `POST /v1/ask` (legacy) and **MCP** at `{RUTEX_GATEWAY_URL}/mcp`
  (`tools/list` → `rutex_ask`, `rutex_health`, `rutex_reset_conversation`).

### E.2 Client in this repo — [CODE]
- `supabase/functions/_shared/rutexMcp.ts`: self-contained Deno MCP client (raw JSON-RPC over
  Streamable HTTP). Exports `askRutex()`, `rutexHealth()`, `resetRutexConversation()`,
  typed `RutexMcpError{kind}`.
- **Gateway-connected Configurator functions** (verified by grep this session):
  `onboard-configurator`, plus `propose-operator-plan` / `request-change`
  (via `enhancedConfigurator.ts`, consolidated 2026-08-28). `widget-chat` has
  **0** references to the gateway — it calls Gemini directly. **[VERIFIED]**

### E.3 Secrets (only two) — [CODE]
- `RUTEX_GATEWAY_URL` (**stable** gateway URL — no longer rotating, per owner
  directive; source of truth `tunnel-url.txt` on the owner's PC) and
  `RUTEX_GATEWAY_KEY` (from owner `.env` → `RUTEX_PROJECT_KEYS` → `"frontdesk"`).

### E.4 Rules (from MCP-HANDOFF) — [CODE, documented as design rules, not runtime-tested by me]
1. Never deploy/import the gateway repo here.
2. In deployed apps never use `127.0.0.1` — always `RUTEX_GATEWAY_URL`.
3. Client timeouts ≥ 90 s.
4. `conversationId` required, stable per end-user thread.
5. Keys only from the owner's `.env`.
6. Cloudflare 1033 → gateway process is behind (URL is stable — do not hunt for a new tunnel URL).

---

## PART F — RESPONDER → CONVERSATIONAL AI (`widget-chat`)

### F.1 Per-message pipeline — [CODE, read from `widget-chat/index.ts`]
Request fields: `receptionistId`, `sessionId` (both required), `message`, optional
`displayedGreeting`, `source`, `test_mode`, honeypot `_hp_field`, `_form_load_time`.
Flow: validate required → abuse protection (rate limit/honeypot/suspicious score) → load
GEMINI key → fetch active receptionist → load conversation state → intent/slot/task analysis →
Engine v2 → build guarded prompt (hallucination guard, action gate) → LLM call →
return `{ reply, hasBookingIntent, hasOrderIntent, uiHints, uiSignal }` + write `kpi_tick`.
- The AI model call uses **Gemini direct** (`GEMINI_API_KEY`, model `gemini-2.5-flash-lite`).
  The Rutex Gateway is an **optional upgrade path**, not currently wired into widget-chat. [VERIFIED]

### F.2 ActiveTask / action gate — [CODE]
Booking/order actions block until all slots are collected + confirmed (step
selecting→collecting→confirming→completed). Memory via rolling summary; greet once; name
validator; hallucination guard.

---

## PART G — CONFIG → BUILDING A BUSINESS OPERATOR

### G.1 Two onboarding paths — [CODE, routes verified]
- Form-driven: `/onboarding`, `/onboarding-wizard`.
- Conversational: `/conversational-onboarding` and `/operator-management`
  (`ConversationalManagementPage` wrapping the builder with a receptionist selector).

### G.2 The configurator function (`onboard-configurator`) — [CODE + VERIFIED boot]
- Interprets input via `askRutex()` (gateway/MCP). **[VERIFIED]** live: empty input returns
  `{"ok":false,"error":"empty_description"}`.
- Alongside `generate-system-prompt`, `generate-knowledge-base`, `parse-services`, it produces
  the finished `receptionists` config (system_prompt, knowledge_base, services, capabilities,
  customer_fields, money_mode, avg_booking_value). `widget-chat` reads that row to behave as the
  operator. Propose/approve plan flow: `propose-operator-plan` + `approve-operator-plan`
  (both deployed this session).

---

## PART H — OWNER MANAGEMENT & TRACKING

### H.1 Where owners manage — [CODE]
- **Dashboard** (`/dashboard`): `RevenueEngine` + `DashboardCharts` + cards → KPI/conversion view.
- **Builder / Operator Management** (`/builder/:id`, `/operator-management`): edit operator,
  toggle/test Money Mode, review/approve plans.
- **Settings** (`/settings`): connector registry (`connectors`/`connector_definitions`),
  module registry (`business_modules`), channels, KB rewrite, quality review, diagnostics.
- **Money Mode** (`/money-mode`): configure sales behavior (manual toggle now).
- **Billing** (`/billing`): `create-subscription-checkout`, `create-payment-intent`/`payment-webhook`.

### H.2 Tracking — [CODE]
- `conversion_events` `kpi_tick` events (engagement, repetition, hallucination risk, intent score,
  money-mode active) feed the funnel/dashboards, alongside `appointments`, `orders`,
  `escalations`, `quote_requests`. Reminder CRON keeps follow-ups alive.

---

## PART I — VERIFICATION CHECKLIST (HONEST SCORES)

| AGENTS.md item | My status |
|---|---|
| Requested feature works exactly as intended | Deployed + functions boot; full UI flows not runtime-tested by me (**partial**) |
| No existing feature broken | No regressions observed; not exhaustively re-tested (**partial**) |
| Full booking flow works end to end | `book-appointment` validates live; **not** proven to a created appointment (**partial**) |
| Full ordering flow works end to end | **Not live-tested** by me |
| Owner dashboard loads & shows correct data | Build passes; **not** live-drilled (no owner session) |
| AI responds intelligently in all scenarios | `widget-chat` boots + DB + graceful path verified; Gemini reply **not** verified (no active receptionist) |
| All DB writes correct and complete | Migrations applied; individual row writes not exhaustively checked |
| No contradictions between systems | Architecture cross-checked via grep/reads |
| Platform in a better state than before | Yes — bug fixed, functions deployed, frontend live |

---

*End of SESSION_AND_ARCHITECTURE.md (verified edition)*
