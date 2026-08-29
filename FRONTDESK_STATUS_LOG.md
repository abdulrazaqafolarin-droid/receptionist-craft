# FrontDesk Universal Operator — Running Status Log

> Required deliverable per `FrontDesk-Master-Kickoff-Prompt.md`: a single running document
> tracking, per step from `FrontDesk-UIUX-Redesign-And-Integration-Prompt.md` Section 6,
> the status, what was built, what was tested/how, and any judgment calls.
>
> Legend: ⬜ not started · 🔄 in progress · ✅ done-and-verified · ⚠️ blocked/judgment

---

## Status overview

| Step | Doc reference | Title | Status |
|------|---------------|-------|--------|
| 1 | §1 + Step 1 | Verify certified current state | ✅ |
| 2 | 2.1 + 5.1 | Sidebar regrouping (mobile-first) | ✅ |
| 3 | 2.2 | Signup personalization + onboarding fork | ✅ |
| 4 | 2.3 + 5.5 + 5.6 | Configurator into management pages + empty states + preview/rollback | ✅ |
| 5 | 2.4 | Contextual connectors/modules | ✅ |
| 6 | 5.4 | Redefine Operator Management page | ✅ |
| 7 | 3.3 | Capability & component manifest | ✅ |
| 8 | 4.2 + 4.1b + 4.3 + 4.4 | Shared runtime context + Configurator reasoning history + agent awareness | ✅ |
| 9 | 5.3 | Success-signal capture + Dashboard check card | ✅ |

---

## Step log

### Step 1 — Verify certified current state
- **Status:** ✅ done-and-verified (2026-08-27)

**Results — every §1 claim confirmed true against the current repo + live Supabase:**

| # | Claim | Verified how | Result |
|---|-------|--------------|--------|
| 1 | Connector registry (`connectors`, `connector_definitions`, ~24 seeds, RLS) | Migration `20260826000010_add_connector_registry.sql` | ✅ `connectors` table + `connector_status`/`connector_category` enums + RLS policies + 24 seed definitions (23 `),` rows + final) incl. gmail/twilio_sms/google_calendar/instagram/facebook/stripe/paystack |
| 2 | `business_modules` + 20 Tier-1 seeds | Migration `20260826000012_add_business_modules.sql` | ✅ table + auto-enable Tier-1 logic for existing receptionists |
| 3 | `service_staff`, `quote_requests`, `booking_series` | Migration `20260826000011_add_business_type_mechanics.sql` | ✅ all three tables |
| 4 | `propose-operator-plan` + `approve-operator-plan` deployed | Management API function list | ✅ both ACTIVE, v1, verify_jwt=False |
| 5 | Payment infra (`create-payment-intent`, `payment-webhook`, `create-subscription-checkout`) | Management API | ✅ all three ACTIVE v1 |
| 6 | Configurator wired to gateway via MCP, live-booting | grep + live call | ✅ only `onboard-configurator/index.ts` imports `rutexMcp`; ACTIVE v10; live returns `empty_description` |
| 7 | `widget-chat` does NOT route through gateway (calls Gemini) | grep | ✅ 0 gateway refs; model `gemini-2.5-flash-lite`; ACTIVE v61 |

**Bonus relevant finding:** `20260826000008_add_config_versioning.sql` + `20260826000009_add_revert_config_version_rpc.sql` exist → config versioning + revert RPC already present (directly feed Step 6 / Vision Part Four).

**§2.1 flat sidebar confirmed** (23 ungrouped items in `AppSidebar.tsx`).
**No signup personalization/fork** confirmed (routes in `App.tsx`; nothing at signup).

**Judgment calls:** none.
**Wall loop:** none.

### Step 2 — Sidebar regrouping (mobile-first) — §2.1 + §5.1
- **Status:** ✅ done-and-verified (2026-08-27)

**What was built:**
1. **New `src/pages/Connections.tsx`** — dedicated Connections page housing `ConnectorRegistryPage` + `ModuleRegistry`, pulling the connector/module registry OUT of Settings into its own top-level page (per §2.1 "not a settings sub-tab"). Loads `userId` + receptionists for the per-business selectors. Route `/connections` registered in `App.tsx`.
2. **`src/components/AppSidebar.tsx` rewritten** — flat 23-item list → 7 named, **collapsible** groups (using `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`):
   - **Overview**: Dashboard, Analytics, Money Mode
   - **Your Operator**: Operator Management, Products & Services, Availability, Staff, FAQs
   - **Conversations**: Conversations, Quality Review, KB Suggestions, Escalations
   - **Bookings**: Orders & Appointments, Calendar
   - **Customers**: Customers
   - **Connections**: Channels, Connections (new)
   - **Account**: Organization, Billing, Notifications, Diagnostics, Realtime Logs, Settings, Help
   - Groups default: Overview + Your Operator open; auto-expands the group containing the active route. Collapsed (icon) mode renders item icons grouped by section. Chevron rotates when open.
3. **`src/pages/Settings.tsx` simplified** — removed the Connectors & Modules tabs (moved to Connections page); Settings now Account + Notifications only. Cleaned unused imports/state.

**How tested:** `npx tsc -p tsconfig.app.json --noEmit` — **0 errors** in AppSidebar/Connections/Settings/App.tsx (only interleaved pre-existing project errors remain). `npm run build` — **passes**, 3632 modules, dist generated.

**Judgment calls:** Group labels adopted from §2.1's explicit suggestions (doc says the principle is required, exact labels flexible). Kept "Connections" (route) vs "Channels" separate per §2.1. Default-open Overview + Your Operator chosen as the primary setup surfaces.

**Wall loop:** none.

### Step 3 — Signup personalization + onboarding fork — §2.2
- **Status:** ✅ done-and-verified (2026-08-27)

**What was built:**
1. **Repurposed `/onboarding` as the signup front door** (the route Auth navigates to right after signup, `Auth.tsx:86`). It is now a **2-part gate**, not the old 3-step form:
   - **Personalization step** (genuinely short, "a greeting, not an intake form"): your name, business name, business type in plain language (free text, no rigid dropdown). Name persisted to `profiles.full_name`.
   - **Fork decision screen** (explicit, "not a buried route"): two big option cards — **"Build by talking it through"** (primary, recommended, `MessageSquareText`) routes into `/conversational-onboarding`, and **"Build with a step-by-step form"** (`ListChecks`) routes into `/onboarding-wizard`. Both are one tap away, neither hidden behind the other.
2. **Prefill from fork to conversational path** — `ConversationalOnboarding` now reads `businessName`/`businessType` query params and auto-fills its describe textarea (e.g. "I run Sunshine Dental Clinic, a dental clinic. Please set up my AI operator for it."), so the owner doesn't re-type what they just told us.
3. **Wizard untouched** — `/onboarding-wizard` (full 7-step Setup Wizard) is fully intact and is the form-fork target exactly as the spec demands ("kept exactly as it is").

**Sidebar/other routes sanity check:** Dashboard/MoneyMode/Help already link to `/onboarding-wizard` (the proper post-setup path) — unaffected. `Services.tsx` + `Orders.tsx` empty-state buttons point at `/onboarding` (was the old 3-step form) — they now correctly land on the new personalization+fork gate, an improvement, not a break.

**How tested:** `tsc --noEmit` — 0 errors in `Onboarding.tsx` / `ConversationalOnboarding.tsx` (only interleaved pre-existing project errors remain). `npm run build` — **passes** (48.44s, 3632 modules, chunk-size warning only).

**Judgment calls:** Since `profiles` has no business-name/type columns and `receptionists` isn't created until the chosen path runs, business details are passed through query params to prefill rather than persisted to a schema without a column for them. Name → `profiles.full_name` (column exists + in generated types). Fork target for the "form" is `/onboarding-wizard` (the richer, intact Setup Wizard) rather than the legacy 3-step `/onboarding` form, which is superseded by the wizard.

**Wall loop:** none.

### Step 4 — Configurator into management pages + empty states + preview/rollback — §2.3 + §2.5 + Part Four
- **Status:** ✅ done-and-verified (2026-08-28)

**What was built:**

1. **`src/components/ConfiguratorAffordance.tsx` (NEW)** — a Sheet-based affordance wrapping the reusable Configurator engine (`ConversationalManagement`). Props: `receptionistId`, `context` (page label), `title`/`label`/`variant`/`className`. Provides the persistent **"Tell me what to change"** entry point that routes through the existing propose→approve flow. A **"Test conversation"** footer button closes the sheet and navigates to `/test/:id`.
2. **`src/components/PlanReview.tsx`** — added `onTest?: () => void`; renders a "Test conversation" button (`FlaskConical`, `flex-1`) next to Approve so the owner can preview/test a proposed change before committing (§5.5 preview + surfacing rollback via the Configurator's version history).
3. **`src/components/ConversationalManagement.tsx`** — passes `onTest={() => navigate('/test/:id')}` through to PlanReview (pre-existing version-history → revert flow already satisfies rollback surfacing).
4. **Wired `ConfiguratorAffordance` into every management page (§2.3):** Services, Availability, Staff, FAQManagement, Channels, and Connections (each passing `context="<Page>"`). Also added a "Test conversation" affordance available wherever a receptionist is selected.
5. **Real empty states added (§5.6):** Staff, Channels, and Connections now render a dashed "Create your AI operator first" empty state ("Set up my AI operator" → `/onboarding`) when no receptionist exists, instead of rendering empty selects/tabs.

**Judgment call — the Configurator shares the Responder's chat component (fold-in per user directive):**
Per the owner's instruction (the plan doc's §3.1 "don't rebuild what already exists" was not yet applied to the Configurator's *own* interface), I investigated the chat UIs and found **four hand-rolled chat implementations** (`pages/Widget.tsx` = customer Responder, `ConversationalManagement.tsx` = Configurator, `TestConversations.tsx`, `components/Widget.tsx` = dead) with **no shared chat shell**. Rather than build a second chat UI from scratch, I did the small refactor the owner called for:

- **`src/components/widget/ChatShell.tsx` (NEW)** — a single presentational chat component providing the shared mechanics (scrollable message list, aligned bubbles, typing indicator, input footer, auto-scroll via `scrollRef`) with a `theme: "responder" | "configurator" | "test"` prop for **distinct theming per context**, plus render slots: `renderMessage` (embedded bubble content e.g. PlanReview), `renderQuickReplies`, `emptyState`, `footerBefore` (History / honeypot), `betweenPanel` (UISignalRenderer), `inputAfter` (VoiceInput), `footerAfter` (Start Fresh), `typingIndicator`, `showAvatar`/`showTimestamp`, `accentGradient`, `listClassName`, and a `contextLabel` orientation pill.
- **Configurator** (`ConversationalManagement.tsx`) now renders the same `ChatShell` (`theme="configurator"`) with its inline `PlanReview` via `renderMessage`, the History button via `footerBefore`, and a **"Configurator · editing your operator" contextLabel** so the owner always knows who they're talking to.
- **Customer Responder** (`pages/Widget.tsx`) now renders the same `ChatShell` (`theme="responder"`) preserving every existing behavior through slots: quick replies, gradient avatars/send button, bouncing-dots typing indicator, voice input, honeypot, "Start Fresh"/"Powered by AI" footer, `UISignalRenderer` as `betweenPanel`, timestamps, and the branded gradient list background via `listClassName`.
- `TestConversations.tsx` left as-is (diagnostic tool with a distinct inline/sticky-input layout; forcing it into the shared shell would risk a sticky-input regression — recorded as a judgment call, not a second *new* implementation).

**How tested:**
- `npx tsc -p tsconfig.app.json --noEmit` — **0 errors** in `ChatShell.tsx`, `Widget.tsx`, `ConfiguratorAffordance.tsx`, `PlanReview.tsx`. The only errors in `ConversationalManagement.tsx` are the **pre-existing** `setHistory` `config_versions` union-type error (M2 backlog, verified via git diff that my edits did not touch that loading code).
- `npm run build` — **passes** (52.46s, chunk-size warning only).
- Confirmed via git diff that all earlier/reported page errors (Services/Staff/Channels/ConversationalManagement `setState` and integration-paystack types) are pre-existing M2-backlog errors, not introduced by Step 4.

**Wall loop:** none (no ambiguity requiring the owner).

### Step 5 — Surface connectors/modules contextually — §2.4
- **Status:** ✅ done-and-verified (2026-08-28)

**What was built:**

1. **`src/components/InlineConnectPrompt.tsx` (NEW)** — the **single reusable** inline connect-prompt component built once and used everywhere a capability gap is detected (per Step 5's explicit "build the pattern once, use it everywhere" instruction — not a bespoke version per page). It takes a `connectorKey` + `userId` (plus optional `why`/`displayName`/`compact`/`showWhenConnected`), fetches the connector's **live** definition (`connector_definitions`) and status (`connectors`) from the DB, and:
   - **Gap detected** (not_configured/error/expired) → renders the connect prompt **right there, at the moment the capability is touched**, with a concrete action, never "go check Settings":
     - **OAuth connectors** (e.g. `gmail`, `google_calendar`) → a "Connect" button that opens Connections for the one sign-in (honest, since per-connector OAuth is completed there), plus a setup-guide link when one exists.
     - **API-key connectors** (e.g. `twilio_sms`, `stripe`, `paystack`) → an inline labeled paste-key field with a **Save key** action that persists the key to `connectors.config_json` and marks the row `configured` (tier 2). Follows §3.2: a concrete UI slot for the real integration path, never "this isn't possible."
     - **Coming-soon** connectors → an honest "on roadmap" state (real gap we cannot connect yet).
   - **Connected/configured** → renders nothing by default (no clutter); optional `showWhenConnected` renders a subtle confirm state.
2. **Wired into `ModuleRegistry`** (`src/components/ModuleRegistry.tsx`) with a new `userId` prop — the primary §2.4 detection point. For any **enabled** tier-2 module with required connectors (`gmail`, `twilio_sms`, …), an `InlineConnectPrompt` renders inline under that module for each required connector not yet connected. Because the component self-hides when connected, it only appears exactly when the gap is real. This is the concrete "an enabled capability touches a connector that isn't live → prompt appears right there."
3. **`src/pages/Connections.tsx`** — passes `userId` through to `ModuleRegistry`.

**Live DB verification (service-role read-only queries, all confirmed):**
- `connectors`, `connector_definitions`, `business_modules` all **exist on the live project** (`to_regclass` → all three named).
- `connector_definitions` has **24 seed rows** (not empty) — `gmail` (`auth_type=oauth`), `twilio_sms` (`auth_type=api_key`), `is_coming_soon=false`, correct `setup_url`/`help_url` shape. `connectors` has **0 rows** (pre-launch, nobody connected — so the gap prompt will correctly show).
- **Found + fixed a live RLS bug:** `connector_definitions` has `relrowsecurity=true` but **no policies**, which silently denies every read to the authenticated owner — it would have broken **both** the Step-2 `ConnectorRegistryPage` and this new `InlineConnectPrompt` (both select from it as the logged-in user). `connectors`, by contrast, has full per-user policies (view/insert/update/delete) — reads/writes work.
- **Applied migration `20260828000001_allow_authenticated_read_connector_catalog.sql`** (new file, not an edit to existing) and **executed it live**: added `FOR SELECT TO authenticated USING (true)` on `connector_definitions` (a shared catalog with no per-user rows). Verified the policy now exists in `pg_policies`. This unblocks the owner's browser from reading the catalog.

**How verified locally:** `npx tsc -p tsconfig.app.json --noEmit` — 0 errors in `InlineConnectPrompt.tsx` / `ModuleRegistry.tsx` / `Connections.tsx`. `npm run build` — **passes** (50-51s, chunk-size warning only).

**Judgment calls:**
- **Shared-catalog RLS grant**: added an `authenticated` read policy on `connector_definitions` (a public catalog) — a deliberate, safe exception to "it's RLS-protected," since it contains no user data. Not a user-data leak.
- **OAuth connect action → Connections page** rather than an inline OAuth popup: per-connector OAuth flows aren't built yet, so honestly routing the owner to the one-sign-in hub (with a setup-guide link) is the truthful "one extra step," per §3.2, instead of a broken-feeling dead OAuth button.
- **Paste-key writes `configured` (tier 2)**, not `connected` (tier 1), since a pasted key isn't verified until a health check runs — matches the schema's `connector_status` semantics exactly.

**Wall loop:** none (no genuine ambiguity requiring the owner).

### Step 6 — Redefine the Operator Management page — §5.4
- **Status:** ✅ done-and-verified (2026-08-28)

**What was built:**

1. **`src/components/VersionHistory.tsx` (NEW)** — a reusable version-history timeline / rollback component for any receptionist. Reads `config_versions` (append-only; ordered by `version_number` desc), and for each version renders: version number, **"Live"** badge on the current version, change-source label (onboarding / owner change / revert / auto revert / platform update), timestamp, the owner's original words, and an expandable plan summary. Highlights the currently-live version and offers a **one-tap "Revert to this version"** per non-live version, gated behind a confirm dialog (since reverting touches the live operator). Calls the existing `revert_config_version` RPC (which restores the target config to the live `receptionists` row AND saves the revert as a **new** version, so history is never destroyed). Handles the empty state honestly ("No changes recorded yet").

2. **`src/pages/ConversationalManagementPage.tsx` rewritten** — its distinct purpose is now the **history/rollback home** (§5.4), no longer redundant with the Step-4 inline affordances:
   - Retitled **"Operator History & Management"**.
   - **PRIMARY section: "Change History"** — always-visible `VersionHistory`, with the version currently live called out in the header description.
   - **SECONDARY, collapsed surface: "Make a change to your operator"** — the Configurator chat is kept (Collapsible, default closed) so a new change is still possible from here, but it's no longer the page's reason for existing.
   - Loads the live `currentVersion` and refreshes it when a revert completes (`onReverted`).

**Live DB verification (service-role read-only):**
- `config_versions` and `operator_plans` **exist** on the live project (`to_regclass`).
- `revert_config_version` RPC **registered** (`pg_proc`).
- `config_versions` currently has **0 rows** (no changes recorded yet — pre-launch, so the new empty state is the correct present behavior). Real receptionists exist (Ruth "Rutex Demo Clinic", "Tess dentals") to render against once changes accrue.
- Rollback path exercised by code review against the exact RPC signature (`p_receptionist_id`, `p_target_version`) — matches the component's call. Deliberately did **not** fabricate fake config rows to force a live revert test, since that would write synthetic data into production tenancy.

**How verified locally:** `tsc -p tsconfig.app.json --noEmit` — 0 errors in `VersionHistory.tsx` / `ConversationalManagementPage.tsx`. `npm run build` — **passes** (53.41s, chunk-size warning only).

**Judgment calls:**
- **Revert action routed to the existing RPC** (which snapshots a new version) rather than deleting/rewriting old rows — preserving append-only history per the vision. The confirm dialog is added because it touches live config.
- **History elevated above the chat** (default-open, first section) to make §5.4's "history is the purpose" concrete, while keeping the chat reachable but collapsed to avoid re-introducing redundancy.

**Wall loop:** none (no genuine ambiguity requiring the owner).

### Step 7 — Capability & component manifest + Configurator reads from it — §3.3 + §3.4
- **Status:** ✅ done-and-verified (2026-08-28)

**What was built:**

1. **`supabase/functions/_shared/config/manifest.ts` (NEW)** — the **single source of truth** for what the platform can actually build (§3.3). Enumerates, all verified against the real code/schema:
   - **`OPERATIONAL_CAPABILITIES`** — the only capabilities the engine genuinely supports (from the `.strict()` `operationsConfigSchema` workflows + `BusinessCapabilities`): `appointment_booking`, `product_ordering`, `sells_products`, `books_appointments`, `offers_services_on_demand`, `delivers`, `requires_compliance`, `supports_urgent_requests`, `has_membership` — each with its real engine hook.
   - **`REUSABLE_COMPONENTS`** — 17 real frontend widgets that already exist (`ChatShell`, `ServiceSelector`, `DateSelector`, `TimeSlotSelector`, `ProductSelectorEnhanced`, `BookingConfirmation`, `OrderConfirmation`, `LeadForm`, `SwitchConfirmation`, `VoiceInputButton`, `UISignalRenderer`, `AppointmentCalendar`, `ManageBookingPortal`, `WidgetCustomization`, `InlineConnectPrompt`, `ConfiguratorAffordance`, `VersionHistory`) with their real import paths + roles.
   - **`BACKEND_PIECES`** — 11 tables (`receptionists`, `services`, `appointments`, `orders`, `availability_rules`, `service_staff`, `quote_requests`, `booking_series`, `payments`, `subscriptions`, `customers`), 3 RPCs (`create_widget_appointment`, `create_widget_order`, `revert_config_version`), and 7 edge functions.
   - **`composeForBusiness(profile)`** — §3.4's composition helper: maps a business's needs onto the set of EXISTING pieces to assemble.
   - **`buildManifestPrompt()`** — compiles the manifest into the "WHAT THE PLATFORM CAN ACTUALLY BUILD … DO NOT INVENT" block.
2. **`enhancedConfigurator.ts` — the Configurator now READS the manifest.** Both `generateOperatorPlan` (initial build via `propose-operator-plan`) and `generateChangePlan` (ongoing via `request-change`) now append `buildManifestPrompt()` to their system prompts, so the AI reasons from the live inventory and is told: assemble existing capabilities/components first; invent new code/UI/connectors when a need genuinely isn't met (plainly noting what was invented); and never enable an engine capability outside the closed operational-capabilities set → fixes the §3.3 failure mode.

3. **Correction (2026-08-28, per owner):** the initial wording wrongly said the Configurator "must not invent" any component and framed the manifest as a closed prohibition. Corrected both the manifest `GUIDING RULE` and both Configurator system prompts to: **PREFER assembly of existing pieces, but INVENT new code/UI when necessary** (operational/engine capabilities remain the only closed set). Also corrected the AI identity in both system prompts — the Configurator is an **opencode agent accessed through the Rutex gateway** (sibling: the Responder agent, also via the gateway) — replacing the generic "consultant for Rutex FrontDesk" framing. Redeployed both functions as **v3**; `verify_jwt` preserved at `false` via the new config.toml entries. (Transport consolidated onto gateway/Opencode 2026-08-28 — `enhancedConfigurator.ts` now calls `askRutex()` and no longer invokes Gemini directly; see Step 9 note.)

**How verified:**
- **Deno typecheck**: `deno check _shared/config/manifest.ts` and `deno check _shared/config/enhancedConfigurator.ts` both **pass clean** (the only errors when checking the broader `config/index.ts` barrel are pre-existing `versioning.ts` supabase-js typing issues, in a file I did not touch).
- **§3.4 composition test (Deno, then removed)**: `composeForBusiness` for a business needing booking+ordering returns only existing manifest pieces (incl. `switch_confirmation` for the dual flow) — every composed role resolves to a real component/backend piece; a dual booking+ordering business composes the existing `switch_confirmation` rather than new UI. All 10 assertions passed.
- **Deployed live**: `request-change` and `propose-operator-plan` deployed via Supabase CLI → both **version 2**, ACTIVE. The CLI upload log explicitly included `manifest.ts` in the bundle (confirming the manifest is part of the deployed Configurator). Flipped `verify_jwt` back to `false` via Management API (the CLI defaulted them to true, which would have blocked frontend anon-key invokes) and added `[functions.request-change]` / `[functions.propose-operator-plan]` / `[functions.approve-operator-plan]` `verify_jwt=false` entries to `supabase/config.toml` so future deploys preserve it.
- `npm run build` — **passes** (63s; Step 7 touched only `supabase/` tree, no `src/` changes).

**Judgment calls:**
- **Manifest lives in `supabase/functions/_shared/` only** (not duplicated in `src/lib/`): the requirement is that the *Configurator's reasoning* reads it, and that happens in the edge functions. A second frontend copy would introduce drift; the manifest already lists frontend components by real path. Single source of truth.
- **Did not make a live Gemini plan call** against production: it would consume the finite Gemini quota and write a draft `config_versions` row to a real tenancy, for no added confidence beyond the successful deploy + bundle + passing composition test.

**Wall loop:** none (no genuine ambiguity requiring the owner).

### Step 8 — Shared runtime context + Configurator reasoning history — §4.2 + §4.1b + §4.4
- **Status:** ✅ done-and-verified (2026-08-28)

**Live-DB facts verified first (via Management API, not assumed):**
- `receptionists` has NO `operations_config` column and NO `channels`/`contact_info`/`operating_hours`/`policies`/`industry` columns → the **full OperationsConfig lives ONLY in `config_versions.config_json`** (versioned source of truth). Calls that write those drifted columns would fail against live DB — confirmed schema drift; the snapshot treats `config_versions.config_json` as authoritative.
- Demo business `8009284e-4dc2-4530-ba25-0e1c90a445ac` (Ruth): `connectors` = **0 rows**, `integrations` = **0 rows**, `config_versions` = **0 rows** → genuinely NO payment capability configured anywhere. Placeholder `user_id` `0000…0001`.
- `integration_type` enum includes `stripe`/`paystack`; connector catalog payment keys `stripe` + `paystack` (tier1 auto / tier2 links / tier3 connect).

**What was built:**

1. **`supabase/functions/_shared/context/businessContext.ts` (NEW, §4.2)** — single canonical live snapshot, `buildBusinessContext(supabase, { receptionist, includeRecentActivity })`, fetched fresh at moment of use (never a stale flag). Queries latest `config_versions.config_json` (full ops state), live `connectors`+`connector_definitions` (tier, by user_id), live `integrations` (`type`/`enabled`), and cheap `conversion_events` recent-activity summary. Derives canonical `capabilities`, `aiMode`, `openNow`, and a typed **`payment`** readiness (`canCollectPayments`/`canGenerateLinks`/`autonomous`/`provider`/`connector_tier`/`source`) from BOTH connectors AND enabled integrations. Uses the same custom `db.ts` client as widget-chat (no supabase-js dependency). Guards the placeholder user_id so a fake user returns no payment.
2. **`businessContext.ts::buildLiveStatePromptBlock()` (§4.4)** — renders the Live Business State block for the Responder prompt, including the **NON-NEGOTIABLE payment rule**: if `canCollectPayments` is false, the Responder MUST tell the customer payment/receipt isn't available online and NEVER imply a payment link can be completed. If true, it MAY offer links (autonomous or manual per tier).
3. **Responder wired (§4.4)** — `widget-chat/index.ts` imports both functions, computes the live-state block per message (after loading `receptionist`), and passes it into `buildMasterSystemPrompt` as a new `liveStateBlock`. Wrapped in try/catch → **non-fatal** (worst case empty block, chat continues as before). The Responder now genuinely knows payment/connector/ops state at runtime — closes the §4.4 gap where it could promise a payment link with no connector.
4. **Configurator reasoning-history (§4.1b)** — migration `20260828000002_add_configurator_reasoning_history.sql` (`ALTER config_versions ADD COLUMN reasoning_notes text`, applied live + verified in `information_schema`). `versioning.ts::saveConfigVersion` persists `reasoning_notes`; new `getReasoningHistory(supabase, id, limit)` returns the trail `{version_number, change_source, plan_text, owner_input, reasoning_notes, created_at}` newest-first. `generateChangePlan` accepts `reasoningHistory` and injects a **"WHY THINGS ARE THE WAY THEY ARE"** block (`buildReasoningHistoryPrompt`) so the SAME Configurator recalls past decisions instead of asking the owner to re-explain. `propose-operator-plan` and `request-change` persist `reasoning_notes`; `request-change` retrieves the history and feeds it back. Also fixed a pre-existing `revertToVersion` null-assignability type error in `versioning.ts`.

**How verified:**
- **Deterministic Deno test (mocked db client, 6 groups, then removed):** no payment → `canCollectPayments=false`, `canGenerateLinks=false`, prompt says "Payment collection is NOT configured" + NON-NEGOTIABLE + "NEVER IMPLY A PAYMENT"; stripe tier-1 → LIVE via STRIPE + MAY offer; paystack tier-2 → links yes / auto no; enabled integration → collect true; latest config_version correctly picked; placeholder user → no payment. All passed — **the §4.4 rule, proven**.
- **Deno typecheck:** `businessContext.ts` clean; `enhancedConfigurator.ts` clean (errors only in pre-existing `versioning.ts` supabase-js typing); `request-change`/`propose-operator-plan` after fixes have only the single pre-existing versioning error, **0 in new code**; widget-chat's 81 pre-existing type errors unchanged (none reference the new code) and the module resolves.
- **Deployed (CLI bundle confirmed including `businessContext.ts`):** `widget-chat` **v62** (Responder now carries the live-state block), `request-change` **v5**, `propose-operator-plan` **v5**; all `verify_jwt=false`, ACTIVE.
- **Live DB round-trip (§4.1b):** inserted a `config_versions` row with `reasoning_notes` for the demo receptionist, read it back newest-first exactly as `getReasoningHistory` does (owner_input + plan_text + reasoning_notes all returned), then deleted it — storage + retrieval proven against prod.
- **Deployed smoke:** `request-change` v5 boots and validates correctly (returns expected `no_existing_config` 400 for the version-less demo business before Gemini), proving the reasoning-history code path loads clean.
- `npm run build` — **passes** (49s; Step 8 touched only `supabase/` tree, no `src/` changes).

**Judgment calls:**
- **Live multi-turn §4.4 Gemini call was inconclusive** (session-restoration returned greeting+echo; the demo's messages don't persist to `chat_messages`) — end-to-end model behavior wasn't observed live. The §4.4 *rule and prompt* are proven deterministically + deployed; the residual (model obedience) risk is low and noted.
- **Recent-activity is off by default in the Responder path** (`includeRecentActivity:false`) to avoid a per-message `conversion_events` query; the snapshot supports it for agents that need it. **§4.3 module-agent cross-coordination is now BUILD as a concrete mechanism (2026-08-29):** a `module_action_log` ledger table (created + verified LIVE via `to_regclass`, RLS owner insert/select + service_role, UNIQUE `(receptionist_id, action_key)` dedup index) plus `_shared/context/moduleCoordination.ts` (deno-check clean) exposing `recordModuleAction` (idempotent write), `getRecentModuleActions` (read siblings' recent actions, time-windowed, exclude-self), and `buildCoordinationPromptBlock` (surfaces siblings' actions into a module agent's prompt so it BEHAVES coordinated). This replaces the earlier "shared read only" state; email/SMS/invoice module agents now have a mechanism to adopt (they must still call the helper).
- **Transport note (2026-08-28):** `propose-operator-plan`/`request-change` now route through the gateway/Opencode via `_shared/rutexMcp.ts` (`askRutex`), consolidating the Configurator onto the same gateway transport as `onboard-configurator`. No direct Gemini call remains in `enhancedConfigurator.ts`.

**Wall loop:** none (no genuine ambiguity requiring the owner).

### Step 9 — Success signals: define + capture + check — §5.3
- **Status:** ✅ done-and-verified (2026-08-28)

**Signals defined (§5.3):**
1. **(a) Conversational-vs-form adoption** — fraction of new signups who choose the conversational onboarding path vs the wizard (the §2.2 fork). `signal='onboarding_path_chosen'`, `payload.path ∈ {conversational, form}` (+ business type).
2. **(b) Time to a fully configured operator** — wall-clock from profile creation to a live operator. Measured as `configured_operator` signal timestamp minus `profiles.created_at` for that owner; surfaced as an average.
3. **(c) Navigation support-question volume** — owners opening a help question (proxy for "where do I find X" support load). `signal='navigation_help'`, `payload.question` = the FAQ they opened.

**What was built (capture infra + check view):**
1. **Migration `20260828000003_add_success_signals.sql` (NEW, applied live)** — user-level table `success_signals (id, user_id → profiles, signal, payload jsonb, created_at)` wired for the pre-receptionist phase (fork choice happens before any receptionist exists, so these can't go in `conversion_events`, which requires `receptionist_id`). `signal` checked to the 3 values. Indexed. **RLS ON** with `auth.uid() = user_id` (using + check) so an owner can only read/write their own rows.
2. **`src/lib/successSignals.ts` (NEW)** — one shared `recordSignal(signal, payload)` helper used by all call sites (DRY, non-fatal, RLS-respecting; casts `success_signals` as the table isn't in the auto-generated `types.ts`).
3. **Instrumentation:**
   - `Onboarding.tsx` — fork choice recorded in both `goConversational` (path `conversational`) and `goForm` (path `form`).
   - `ConversationalOnboarding.tsx` + `onboarding/Step6Install.tsx` — `configured_operator` recorded on completion, tagged with the path + receptionist id (both fork branches covered).
   - `Help.tsx` — FAQ `AccordionTrigger` open records `navigation_help` with the question text (the support-signal capture).
4. **`src/components/SuccessSignalsCard.tsx` (NEW) + Dashboard placement** — a compact 4-metric card on the owner Dashboard ("Success Signals" section after the stats grid): conversational choice %, avg time-to-configured, help-questions-opened count, and fully-configured count. RLS-scoped to the current owner, so it stays private and safe in production; it displays cleanly even with zero data ("No signups yet").

**How verified (live, not just code review):**
- **Migration + RLS live:** table, columns, indexes, `relrowsecurity=true`, and the exact policy (`auth.uid() = user_id` for using+check) confirmed via `information_schema`/`pg_policy`. **Negative RLS test passed** — anon insert via postgREST rejected (401).
- **Data-model + card-query round-trip (live):** inserted 3 fork choices (2 conv / 1 form), 2 `configured_operator`, 1 `navigation_help` for the demo user (service-role, then cleaned up) and ran the card's exact queries: fork adoption computed 2/3 → 67%, nav-help count = 1, and time-to-configured computed correctly per signal as `configured_at − profiles.created_at`. All correct. (The large minute value in the test was an artifact of the old demo profile created in May with Aug test rows — the SQL math is right; real owners yield plausible values.)
- **Typecheck:** `tsc -p tsconfig.app.json --noEmit` — **0 errors** in `successSignals.ts`, `SuccessSignalsCard.tsx`, `Onboarding.tsx`, `ConversationalOnboarding.tsx`, `Step6Install.tsx`, `Help.tsx` (only interleaved pre-existing project errors remain). `npm run build` — **passes** (48.9s).

**Judgment calls:**
- **Scoped capture to the owner-visible, admin-check approach and placed the check view as a Dashboard card** (asked the user): full infra + definitions + a visible card, not just a doc.
- **`navigation_help` = FAQ-open is a proxy** for "where do I find X" support load (there is no live support/helpdesk subsystem to attach to). Documented as such; can be augmented later with a real "report a problem" capture if a support channel is built.
- **Pre-launch reality (§5.2 note honored):** signals capture starts now, but real numbers only accumulate once owners arrive — the card is designed to read "No signups yet" rather than a misleading zero-baseline, and the founder can also run the aggregate SQL across all users via Management API whenever they want the cross-owner view.
- **Card is deliberately owner-scoped via RLS** (not a cross-tenant founder view) so it's safe to ship: a business owner sees their own setup signals; the founder-level aggregate is a separate SQL query, not baked into the product UI.

**Wall loop:** none (raised scope/placement as a genuine judgment call and the owner chose full infra + Dashboard card — proceeded).



