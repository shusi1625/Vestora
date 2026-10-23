# Code Guideline

## Market Rendering Optimization (2026-10-23)

- `pages/market/WorkspaceMarket.tsx` builds a first-match claims index and memoizes base financial rows separately from filtered/sorted rows. View, page and detail changes do not invalidate base calculations; snapshot/account/time/permission changes do.
- Filtering and stable BigInt sorting still cover the entire dataset. Only rendering is limited to 40 entries per URL page. Filter/sort/reset replace the URL at page one; page navigation pushes history; view changes retain the page; detail selection uses all filtered rows.
- Invalid/out-of-range pages normalize only when data is available. Explicit pagination focuses the named results container. Full result counts remain distinct from visible page size and from unavailable/loading counts.
- `getListingMetrics` accepts optional precomputed totals from the same claim and snapshot time. Existing three-argument calls retain their behavior. `Figure` reuses the full numeric string without changing precision disclosure.
- Regression coverage in `notice-ui.test.mjs` and `workspace-model.test.mjs` includes pagination boundaries/order, dependency invalidation contracts, URL/modal behavior and precomputed-versus-original financial metrics. The hook VM harness is not an actual React renderer; browser verification remains separate.
- Client pagination does not reduce full-list API/detail fan-out. QA production before/after cohorts must keep source/build hashes and fixture budget accounting separate; never reset the existing cumulative cap for a convenient rerun.

## API-to-UI Performance Correlation (2026-10-23)

- `lib/ui-measurement.ts`: inert, typed instrumentation boundary. The normal app collects no performance data and retains its polling/retry/wallet behavior. Only a separate QA build may replace this module.
- QA request/snapshot correlation must retain exact request IDs through body/parse/validation/mapping and the consuming page commit. Missing data is not zero; frame callbacks are not field INP.
- `tests/performance-ui/recorder.ts`, `correlation.test.mjs`: bounded request/batch/snapshot provenance, immutable binding, commit/frame correlation and CPU-only regression tests.
- `tests/performance-ui/runtime.ts`, `main.tsx`, `vite.config.ts`: separate QA instrumentation with no automatic polling/retry and visible raw evidence. The default fixture build uses `qa-ui-dist`; explicit `actual-api` mode uses `qa-ui-actual-dist`. Product entry/config are unchanged.
- QA transport is fixed by mode: fixture API/RPC-blocked 4393, preview 4341 and dev 4340; actual-API API/RPC-blocked 4394, preview 4342 and dev 4343, all on `127.0.0.1` with strict Vite ports. Environment URL/port overrides cannot change this contract. Preserve the fixture process and cumulative 22000-request cap; the matching actual-API runner/policy must bind 4394/4342 separately. The QA runtime selects its gateway only from those fixed mode origins; API and session guards retain their existing restrictions.
- `tests/performance-ui/run-config.mjs`, `build-config.test.mjs`: validate an explicit absolute local public manifest before an actual-API build. The public manifest contains only mode, plan digest, watched address and exact paths; it never grants run approval. Fixture mode does not read it.
- Actual-API entry verifies a single bounded gateway session before importing App. Session expiry/mismatch fails closed. Every API GET carries gateway-owned run/plan headers, checked before upstream reservation; response identifiers are checked again. Custom caller headers, RPC, wallet access, redirects and writes remain blocked. Local CORS preflight does not consume upstream GET budget.
- `tests/performance-ui/read-only-wallet.ts`, `no-rpc.ts`, `adapters.test.mjs`: disconnected typed adapters with provider/storage/network traps. RPC balances remain unavailable, not synthetic zero.
- `tests/performance-ui/fixture.mjs`: standalone 100/1000-row loopback GET-only fixture with no upstream client. Local request cap 22000 is fixture-only, never live authorization.
- `tests/performance-ui/runtime.test.mjs`, `fixture.test.mjs`, `tsconfig.json`: browser-transport safety, actual schema/accounting loopback regressions and QA-specific typechecking. QA build fails if an inert measurement module or live wallet/balance adapter bypasses the required replacements.
- `tests/performance-ui/input-recorder.ts`, `input-recorder.test.mjs`: semantic expected-state input-to-commit/frame timing. No-op, superseded, timed-out or hidden operations are not zero-latency passes; API data changes and cache-only operations remain separate.
- `tests/performance-ui/browser-observer.ts`, `browser-observer.test.mjs`: bounded long-task/LCP/layout-shift/EventTiming and redacted resource inventory. Unsupported observations are null, resource overflow stays explicit, and no INP verdict is derived. The QA runtime records font declarations, lifecycle visibility and resource-buffer overflow without probing installed system fonts.
- Resource inventory storage defaults to 500 entries; QA runtime explicitly retains up to the existing 2000-identity bound for a 1000-row document's 1002 API reads plus assets. This changes diagnostic storage only, not request/rate/byte/time approval caps. Prior 500-entry observations remain resource-incomplete and are never rewritten as complete.
- Planning workspace `work/g3-api-cohort-analysis.mjs`, `g3-api-cohort-analysis.test.mjs`: pure initial-document analysis of exact request/batch/commit/frame identities, mapping, required API resource inventory, freshness, lifecycle and drop counters. Groups stay separate by source/page/state/viewport/count/fixture PID. Missing or excluded intervals are null; duplicate/replayed documents cannot meet the N20/initial5 minimums.
- Input measurement has a 5-second commit deadline followed by a separate 5-second frame deadline. QA's scalar progress output is updated after recorded completion so an automation driver can await a real frame without fixed sleeps or repeated screenshot forcing.
- Error-state verification keeps unknown market counts separate from a verified empty list, and the live status no longer says it is loading after terminal failure. A no-data retry is loading until its request settles; existing stale data is not blanked during a background refresh.
- `tests/performance-ui/snapshot-race.test.mjs`: executes the actual snapshot query with deferred local responses, proving aborted list/history/balance results never bind and account queries remain isolated. It also covers unavailable balances/history and retry loading versus background stale data. Actual browser account-switch cancellation is verified separately.
- Planning workspace `work/g3-cohort-analysis.mjs` retrospectively separates raw valid inputs from fresh/foreground single-fixture observations and never pools different viewports. `work/g3-ui-run-plan.mjs` remains a CPU-only draft ledger: 20 API/body-to-UI pairs per page include 5 initial documents; byte/time feasibility stays unknown.
- Planning workspace `work/g3-ui-approval.mjs`, `g3-ui-gateway.mjs`, `run-api-ui-measurement.mjs`: default-closed actual-API run entry, exact selection/policy approval, shared GET/rate/bytes/time budget, continuous resource/operational guards, original validated response bytes and run/request IDs. Execution requires fresh human approval; it never starts from the build/public manifest alone. One-use nonce markers share the G1/G2 namespace.
- Planning workspace `work/g3-api-ui.test.mjs`, `g3-runtime-gateway-integration.test.mjs`: injected transport/resource tests and ephemeral loopback HTTP only. Actual `readApi`, DTO validation, mapping and QA recorder are bundled in memory for integration. These tests authorize neither AWS traffic nor functional P0 completion; their fake-clock intervals are not performance results.

## Claim/Payment Recovery Safety (2026-10-22)

- `lib/transaction-safety.ts`: shared EIP-1559 direct-call cost calculation (`scope: public-rpc-direct`) and bounded, redacted wallet-failure diagnostics. The RPC quote is not a wallet-wide cap; zero maximum fee and negative balance are invalid. No arbitrary fee floor or wallet security override is applied. Diagnostic metadata never authorizes deletion or retry. Existing v1 records without metadata remain unresolved and are never migrated or cleared automatically.
- `components/workspace/GasReview.tsx`: shared claim/approval/create fee review with direct-call cost, RPC gas quantity/max fee per gas, balance and separately visible unknown wallet maximum cost. Its balance check covers only the direct RPC quote; wallet wrapping/security costs and wallet-selected fees can differ. Final wallet approval remains a separate human action.
- Claim/create engines preserve diagnostic hints across reload, without storing raw errors, RPC URLs or stacks. Metadata is written under the account lock only if the original reservation still matches; hash recovery still requires exact receipt evidence.
- Public fee preflight is not a guarantee of MetaMask affordability. User rejection and application-proven pre-wallet errors remain the only safe pre-submission release paths; all ambiguous provider errors retain their reservation.

## QA Boundary Continuation (2026-10-22)

- Existing model/payment/claim tests now identify B07/B08/B12/B13/B14/B16-B21/B23/B27/B28/B30 explicitly. Time/uint256/BigInt/cancellation cases use fixed local inputs, never real transactions.
- B28 executes the actual snapshot hook with an injected clock and query result; it does not merely restate the threshold expression.
- Automated boundary evidence is recorded separately from manual UI and Sepolia/AWS evidence.
- QA-05: claim/create engines distinguish a failed pre-wallet reservation from an ambiguous error after requesting the wallet. Existing unresolved user records are never cleared by this change.
- QA-07: `pages/market/WorkspaceMarket.tsx` keeps validated filters/sort/view and selected detail in URL search parameters. Filter changes replace history; opening details pushes history so Back/Forward restores them. Direct-link close removes only modal parameters, and blocked buy intent becomes read-only detail. `tests/notice-ui.test.mjs` covers URL validation and history callbacks; actual browser navigation is checked separately.
- QA-08: the market renders one unframed empty surface before branching into cards/table, so an empty view toggle does not change footer position. Overall empty and filtered empty messages have separate locale keys and a component regression test.

## Bounded Load Preparation (2026-10-22)

- Planning workspace `work/g2-fixed-plan.mjs`, `g2-runner-integration.test.mjs` and `run-aws-readonly-load.mjs`: the read-only runner audits the fixed 1049-request API plan before approval consumption, records actual baseline/recovery monotonic windows, and combines the API schedule/protocol audit with existing measurement checks. CPU-only VM integration uses the actual scheduler/client/ledger code with in-memory transport and approval traps. This does not authorize live execution or evaluate the separate AWS resource/recovery completion gates.
- `work/load-summary-scope.mjs` keeps API protocol scope in summaries and refuses unbound historical post-stop resource supplements for new runs. A resource supplement alone never establishes projection recovery.

- `tests/performance/expiry.test.mjs`: deterministic fake-clock and loopback-only expiry/abort regression for the gateway. Included in `test:load-safety`; no AWS/RPC/wallet access or actual live approval is used.
- Live approval and observation freshness are hard stop deadlines, not just checks triggered by the next request. Renewing the watchdog replaces its deadline; shutdown must clear deadline timers and abort local upstream reads. Client abort does not prove work already received by the backend stopped.

- `tests/performance/budget.mjs`: shared rolling rate, concurrency, request/byte/time limits, failure circuit and readiness validation.
- Rate-limit reservations expose the remaining rolling-window wait; the gateway rounds up to a minimum 1ms and rechecks the budget after waking. Limits and failure/expiry stops are unchanged. Expiry tests cover the fractional deadline and operator stop while rate-queued; concurrency waiters retain their bounded 50ms check.
- `tests/performance/gateway.mjs`: loopback-only GET allowlist gateway, no redirects/retries/writes, operator stop, live approval expiry and resource-watchdog gate. Default target is the isolated fixture.
- `tests/performance/api-contract.mjs`: reuses actual DTO schemas and mapping/accounting validators for measured responses, without a network client.
- `tests/performance/run.mjs`: zero-request plan by default; explicit smoke/full run through the shared gateway, endpoint samples/percentiles, dropped iterations and validation errors.
- `tests/performance/safety.test.mjs`, `fixture.json`, `live-proposal.json`, `live-approval.example.json`, `README.md`: local-only safety regression and default-closed readiness/runbook. Example approvals are intentionally unusable.
- `tests/manual-qa/performance.ts`: bounded fixture-only EventTiming/long-task/LCP, fetch response-header and dispatch-to-second-frame telemetry. Missing/thresholded timings are not reported as zero or field INP.
- The manual QA Vite config has a separate production fixture build/preview. `VESTORA_QA_PERF=1` routes API calls through the shared local gateway; wallet/RPC remain fake and local. It never alters the normal app build.

## Isolated Manual QA (2026-10-22)

- `tests/performance/telemetry.test.mjs`: CPU-only mocked browser checks for independent network/input/other telemetry caps, reset windows and pre-reset in-flight observations. No browser or upstream traffic. Human measurement uses the QA-only input reset immediately before handoff, so a long polling session cannot silently consume the input buffer. Raw per-kind drops and visibility/focus are retained.

- `tests/manual-qa/scaled-data.mjs`: bounded 10/100/1000-row read-only API fixtures. Exact raw accounting, unique identities and scheduled/streaming/completed cases; no upstream client. The server paces scaled API responses at 40/s, so initial load times include this deliberate constraint and never prove backend capacity.
- `tests/performance/scaled-data.test.mjs`: size/ID/cap/accounting/phase regressions, included in load safety checks.
- F03/F08 continuation: workspace market adds token-scoped BigInt unclaimed sorting and an icon-only labeled reset that preserves view/history; assets adds scheduled/completed filters using the projection basis, not wall-clock guesses.
- QA performance captures select changes as well as button clicks, and first rendered workspace rows. Second-frame timing is still a proxy, not field INP or exact API-to-React-commit correlation.

- `tests/manual-qa/vite.config.ts`: separate loopback-only Vite entry on port 4212; replaces only the injected-wallet hook and API/RPC configuration. Not a production route/build.
- `tests/manual-qa/main.tsx`: actual app plus visible scenario controls; only this isolated origin's disposable pending records are reset.
- `tests/manual-qa/wallet.ts`: in-memory EIP-1193 provider driving the actual wallet session; never accesses MetaMask. Sends only to the loopback fixture.
- `tests/manual-qa/server.mjs`: deterministic API/RPC/event fixture on port 4391 with bounded requests and no upstream client. Approval/creation/claim receipts, same-nonce replacement detection and explicit post-review drift controls are test-only; no real signing.
- Fixture observations are not Sepolia/AWS evidence. Real-wallet signatures remain human handoff.

## Confirmed Wallet Disconnect (2026-10-22)

- `components/workspace/DisconnectWalletDialog.tsx`: account-scoped confirmation, safe cancel focus, in-flight guard and truthful error feedback. Opening/canceling never calls the wallet.
- `LiveConnection.tsx`: distinguishes wallet permission revocation from ending watch-only lookup. Confirmation shows the selected account; permissions apply to this origin and all its connected accounts/tabs.
- `lib/wallet-session.ts`: keeps local `disconnect` for lookup/session use. Explicit `revokeConnection(expectedAccount)` invalidates quotes, requests `wallet_revokePermissions`, verifies permissions and exposed accounts, then detaches. It never clears pending transaction records or changes on-chain approvals.
- `tests/disconnect-fixture.html` / `.tsx`: dev-only actual-component UI fixture with an in-memory provider, no injected wallet, storage, RPC or API. No production route.
- `tests/claim-runtime.test.mjs` and `tests/notice-ui.test.mjs`: permission revocation, account/provider races, failure, duplicate confirmation and pending-record safety coverage.

## Dismissible Notices (2026-10-20)

- `components/workspace/DismissibleNotice.tsx`: local, identity-keyed dismissal for one notice; it never changes transaction/storage/polling state.
- `lib/notice-policy.ts`: terminal/verified-result dismissal eligibility. Unresolved wallet/send/error states remain visible.
- Claim/create progress and live stale/projection-delay notices share the close affordance. Live freshness badges remain visible when the larger notice is dismissed.
- `tests/notice-ui.test.mjs`: dismissal, identity changes, unresolved safety and copy regression coverage.
- `tests/notice-fixture.html` / `.tsx`: isolated dev-only browser fixture for close controls and responsive verification; no wallet, provider, storage or RPC and no production route registration.

## Live Payment Creation (2026-10-20)

- `lib/create-payment-model.ts`: exact draft validation, deployment/account-scoped persistent reservation and strict decoding.
- `lib/create-payment-engine.ts`: separate explicit approval and escrow actions, receipt recovery, projection completion and session invalidation.
- `lib/create-payment-chain.ts`: pinned balances/allowance, exact-amount approval, stream creation simulation, direct/wrapped receipt proof and API application.
- `hooks/use-create-payment.ts`: provider-lifetime progress and visible read-only recovery polling.
- `components/workspace/CreatePaymentAction.tsx`: condition review, explicit wallet buttons and global recovery status. Existing create dialog supplies its validated fields.
- `tests/create-payment.test.mjs`: mocked creation/approval safety and adapter regressions. `docs/payment-creation.md`: execution boundaries and manual test checklist.
- Claim and creation sends share the existing account Web Lock and refuse each other's unresolved reservations. Creation approval never automatically starts a second transaction.
- `use-payment-names.ts` synchronizes account-scoped local names across consumers/tabs after a verified creation. Names are never on-chain arguments.

## Local UI Integration (2026-10-19)

### Live Read Integration

### Claim Execution (2026-10-19)

- `lib/wallet-session.ts`: revisioned EIP-1193 session, account/chain synchronization, explicit network switch and quote invalidation; `hooks/use-injected-wallet.ts` subscribes to it.
- `lib/claim-policy.ts`: exact quote checks, pending-record decoding and projection/event completion evidence. `lib/claim-storage.ts`: deployment/account-scoped pending reservations.
- `lib/claim-chain.ts`: minimal verified stream ABI, pinned block reads, simulation, explicit wallet claim, receipt/replacement and API proof adapters using viem.
- `lib/claim-engine.ts`: testable transaction orchestration; `hooks/use-claim-transaction.ts`: provider-lifetime progress and visible recovery polling.
- `components/workspace/ClaimAction.tsx`: explicit review/approval, progress and hash recovery. Other transaction controls remain disabled.
- `tests/claim-runtime.test.mjs`: mocked wallet/chain lifecycle and adapter tests, no real signing. `docs/claim-execution.md`: execution boundaries and user verification checklist.
- Wallet-wrapped receipts use exact deployed-contract claim events plus sender/chain/value guards; direct calls retain calldata checks. Existing-hash reconciliation is read-only and account-locked. The live claim dialog follows refreshed snapshots.

- `lib/live-config.ts`: explicit live/sample mode and public service configuration. `lib/live-api.ts`: validated backend DTOs and abortable GET reads.
- `lib/live-mapping.ts`: exact BigInt, projected timestamp, token-address and account-history mapping. `lib/live-chain.ts`: Sepolia balances at the projection block using viem.
- `hooks/use-injected-wallet.ts`: EIP-1193 account/chain events, no signing. `hooks/use-live-snapshot.ts`: account-keyed query, 15-second foreground polling, bounded history fan-out.
- `providers/live-context.ts`, `providers/LiveWorkspaceProvider.tsx`: live read context. `components/workspace/LiveConnection.tsx`: real-wallet/read-only address control and data provenance.
- `tests/live-mapping.test.mjs`: live mapping and failure cases. `docs/live-data.md`: configuration, evidence and remaining execution boundary.

- Active screen entries: `pages/market/WorkspaceMarket.tsx`, `pages/assets/WorkspaceAssets.tsx`, `pages/sales/index.tsx`, `pages/issued/index.tsx`, `pages/transactions/index.tsx`.
- `pages/assets/AssetComposition.tsx`: per-token portfolio donut. `pages/issued/PaymentDetails.tsx` and `CreatePaymentDialog.tsx`: issuer review, private names and prefunded creation form.
- `components/workspace/`: shared preview UI, semantic payment status, data states, fund composition and claim review dialog.
- `hooks/use-workspace-snapshot.ts`: prototype read adapter; replace here for live snapshots. `hooks/use-payment-names.ts`: account-scoped local metadata only.
- `lib/workspace-model.ts`: pure BigInt ownership, payer and accounting selectors. `styles/workspace.css`: integrated green theme and responsive layout.
- `tests/workspace-model.test.mjs`: isolated model and translation coverage checks. `docs/ui-integration.md`: scope, accounting rules and live integration boundaries.
- Original collected page entries remain for source comparison. `docs/original-source.zip` and capture manifests are immutable. The integrated workspace never executes real transactions.

## Local Sample Additions (2026-10-19)

This collected copy adds `scripts/audit-source.mjs` (local import and source integrity report),
`capture-manifest.json`, `README.md`, and `docs/` (source archive, collection notes, verification evidence).
The original service-owned scripts/reports were not collected. The analytics bootstrap is removed from
the runtime copy and preserved in `docs/original-source.zip`. Original routes and UI modules remain unchanged.

## Project Structure Overview

```
project-root/
  ├── i18n.config.json       # i18n manifest for supported locales and language metadata
  ├── public/
  │   └── locales/           # public/locales/{code}.json translation files (ko only)
  ├── src/
  │   ├── components/        # All reusable UI components
  │   │   ├── ui/            # Prebuilt and custom UI components, grouped by function
  │   │   ├── common/        # Amount, StatusBadge, DataState, MetricCard, Section, notices, tone tokens
  │   │   ├── layout/        # AppShell, header/nav, wallet button, testnet + network indicators
  │   │   ├── claim/         # 수취권 summary, payout timeline, role actions, claim/buy dialogs
  │   │   ├── market/        # marketplace toolbar and listing card
  │   │   ├── tx/            # transaction status timeline, receipt and activity dialogs
  │   │   └── prototype/     # prototype scenario switcher panel
  │   ├── hooks/             # Custom React hooks (use-scroll-restore)
  │   ├── i18n/              # i18n runtime: config.ts (entry) + util.ts (helpers)
  │   ├── lib/               # Domain + utilities: types, tokens, format, claim-math, status, price
  │   ├── pages/             # Application pages (each page in its own subdirectory)
  │   │   ├── market/        # /market
  │   │   ├── assets/        # /assets
  │   │   ├── claim-detail/  # /claims/:id
  │   │   ├── sell/          # /claims/:id/sell
  │   │   └── coming-soon/   # placeholder screens for later scope
  │   ├── providers/         # App-wide context: scenario, prototype data, wallet, transaction state
  │   ├── prototype/         # Sample data and scenario definitions used before on-chain wiring
  │   ├── App.tsx            # Main app component, sets up route + context providers
  │   ├── router.tsx         # Router config (AppShell layout route + child routes)
  │   ├── main.tsx           # Entry point for the React app
  │   └── index.css          # Global styles and design tokens
  ├── package.json           # Project metadata and scripts
  ├── tailwind.config.ts     # Tailwind CSS configuration
  └── ...                    # Other config and lock files
```

> Backend-handoff temporary files (`scripts/`, `i18n.scan.json`, `reports/i18n/`, `docs/i18n-*.md`) are kept in the repo only until backend integration of i18n statistics/scan/auto-translate is complete. They are owned by the backend long-term and will be removed once integration lands. Treat them as read-only handoff copies — do not extend them.

## Directory Responsibilities

- **public/**: Static files served directly. Place images, icons, and robots.txt here.
- **public/locales/**: Translation files, one per language (`{code}.json`). Flat dotted keys (e.g. `home.hero.title`); the `fallbackLng` file is the structural source of truth.
- **i18n.config.json**: The lightweight i18n manifest for fallback language, language labels, browser detection aliases, and document direction. Single source of truth for the language list.
- **src/components/**: All UI components.
  - **ui/**: Contains atomic and composite UI components.
  - *Group related components into subdirectories if they share a domain or feature (e.g., `form/`, `charts/`).*
- **src/hooks/**: Custom React hooks. Each file should export a single hook focused on one responsibility.
- **src/i18n/**: Two files only.
  - `config.ts` is the runtime entry: imports the manifest via `util.ts`, initializes i18next (HTTP backend, language detector, react binding), syncs `<html lang/dir>`, and re-exports the helpers. Importing this file for its side effect boots i18next.
  - `util.ts` holds pure helpers parsed from the manifest: `fallbackLng`, `supportedLngs`, `languageOptions`, `normalizeLanguage`, `getLanguageDirection`, plus types.
  - Components use the official `useTranslation()` from `react-i18next` directly; there is no project-specific `useT` wrapper.
- **src/lib/**: Utility functions and libraries that are not React components or hooks.
- **src/pages/**: All route-level pages.
  - *Each page should have its own subdirectory if it contains more than a single file or has related logic/components.*
- **src/App.tsx**: Sets up global providers.
- **src/router.tsx**: Sets up routing.
- **src/main.tsx**: Application entry point.

**Important:**
Whenever a new module (such as a component, hook, or utility) or a new page is added or removed, this document **must be updated immediately** to reflect the changes. Keeping this documentation up to date ensures that all collaborators have a clear understanding of the current project structure and its intended organization.

## How to Add New Code

### 1. Adding a New Page

- **Create a subdirectory under `src/pages/` for each new page.**
  - Example: For a "Dashboard" page, create `src/pages/dashboard/`.
- **Place the main page component as `index.tsx` inside the subdirectory.**
- **Add any page-specific components or logic in the same subdirectory.**
- **Register the new route in `src/router.tsx and generate a semantic name.**
  - Example:
    ```tsx
    import Dashboard from "./pages/dashboard";
    // ...
    {
      path: "/dashboard",
      name: 'dashboard',
      element: <Dashboard />
    }
    ```

### 2. Adding a New Component

- **If you are adding a group of related components, create a subdirectory (e.g., `form/`, `charts/`).**
- **If the component is only used by a specific page, place it in that page's subdirectory under `src/pages/`.**
- **Each component should be focused on a single responsibility.**
- **Small files (< 100 lines) are encouraged for a single component.**

### 3. Adding a New Hook

- **Create a new file in `src/hooks/` named after the hook (e.g., `use-feature.ts`).**
- **Each file should export only one hook.**
- **Hooks should be as small and focused as possible.**

### 4. Adding Utilities

- **Add utility functions to `src/lib/`.**
- **Group related utilities in the same file or subdirectory if needed.**

### 5. Adding or Updating Languages

- **Language metadata must go through `i18n.config.json`.**
- **Do not hardcode supported languages, labels, browser detection aliases, or RTL direction lists in `src/i18n/*.ts`.**
- **Locale content lives in `public/locales/{code}.json`** as flat dotted-key JSON; the `fallbackLng` file owns the canonical key set.
- **Runtime code reads the manifest only through `src/i18n/util.ts`.** Adding or removing a language means editing `i18n.config.json` plus the matching `public/locales/{code}.json`; nothing in `src/i18n/` needs to change.
- **Translations are read with the official `useTranslation()` from `react-i18next`.** No custom hook, no cast at call sites.

## Coding Best Practices

- **One module, one responsibility:**
  Each file (component, hook, utility) should do one thing only.
- **High cohesion, low coupling:**
  Keep related logic together and avoid unnecessary dependencies between modules.
- **Naming conventions:**
  - Use `PascalCase` for components and page directories.
  - Use `camelCase` for hooks and utility functions.
  - Name page subdirectories and files after their route or feature.
- **Component structure:**
  - Keep components small and focused.
  - Extract subcomponents if a component grows too large.
- **Page structure:**
  - Place all logic, hooks, and components specific to a page in its subdirectory.
  - Only share code via `components/`, `hooks/`, or `lib/` if it is truly reusable.
- **Documentation:**
  - Add comments for complex logic.
  - Document the purpose of each module at the top of the file if not obvious.

## Example: Adding a New "Profile" Page

1. **Create a directory:**
   `src/pages/profile/`
2. **Add the main page component:**
   `src/pages/profile/index.tsx`
3. **Add page-specific components:**
   `src/pages/profile/ProfileHeader.tsx`, `src/pages/profile/ProfileDetails.tsx`
4. **Register the route in `App.tsx`:**
   ```tsx
   import Profile from "./pages/profile";
   // ...
   <Route path="/profile" element={<Profile />} />
   ```
5. **If you need a reusable button, add it to `src/components/ui/button.tsx`.**
