# API-to-UI Correlation QA

This is separate production QA instrumentation. It defaults to **local fixture** mode; explicit actual-API mode additionally requires a public build manifest and a separately approved bounded gateway run. Neither mode is wallet E2E proof.

## Local Fixture

```powershell
npm.cmd run test:ui-performance
npm.cmd run qa:ui-typecheck
npm.cmd run qa:ui-build
node tests/performance-ui/fixture.mjs 100
# Separate terminal:
npm.cmd run qa:ui-preview
```

Open `http://127.0.0.1:4341/market` or `/assets`. The API fixture listens on loopback 4393 only; its dev port remains 4340. Preserve an existing fixture process and its cumulative 22000-request cap. Actual-API QA uses separate ports and requires no fixture stop/restart or counter reset.

- Real `readApi` -> `useLiveSnapshot` -> provider -> Market/Assets execution uses a QA-only measurement replacement. Product entry and Vite config are unchanged.
- Required wallet/balance/measurement replacements are checked against actual Rollup module IDs; a missing replacement fails the build. The product build's inert boundary collects nothing.
- Each query batch owns its requests, body/parse/schema/mapping timestamps and the claims-array identity consumed by the page. Commit/frame callbacks cannot borrow an unrelated last request. Binding seals the recorded request set.
- Header timing is not body timing. The batch summary uses the last required API body; all per-request body-to-commit/frame intervals remain available.
- The first commit of a new snapshot can form an API pair. Cached state changes remain separate, with null API intervals. Duplicate or cancelled commits, hidden/unfocused frames, errors and telemetry overflow never become valid zero-latency samples.
- `관측 원문` opens/closes visible raw JSON. Reading it after a sample does not retroactively measure the output panel as part of that sample.
- All injected-wallet access is absent; no RPC balance is invented. Watch-only addresses are not connected wallets. Unavailable balance/ownership checks remain explicitly unavailable.
- Automatic query retry, polling and focus refetch are disabled only in this QA build. The browser transport allows GET to loopback API routes/local assets only, strips API credentials, blocks redirects, and rejects writes/public URLs/RPC. The fixture has no upstream client.
- The fixture supports count 100/1000, delay 0..5000ms, and `normal`, `pending`, `invalid-json`, `http-error`, `old-timestamp` modes. Request cap 22000 belongs only to this isolated fixture, never to an actual run approval.
- Frame callbacks are not actual presentation timing or field INP. These local smoke samples do not meet the goal's per-task 20/initial-navigation 5 actual-API requirements.
- `runUiAction` measures explicit handler intent against the exact page/state key. Its input recorder is separate from API snapshot latency. The fixed scalar progress output settles after frame/cancellation/timeout, so a driver can await completion without forcing screenshots or fixed sleeps. No-op, hidden, superseded, error and stale cases are retained, not turned into zero latency.
- Commit and frame have separate 5-second deadlines. Navigation is restricted to market/assets measurement targets; refresh on other routes is not assigned to a previous page. Source remains `unclassified` in raw events; the run manifest must identify browser automation versus human input.
- Bounded PerformanceObservers retain long tasks, LCP, layout shifts and thresholded EventTiming, never a fabricated INP. Unsupported counts are null. Resource URLs omit credentials/query/hash; buffer overflow/drop counts and loaded CSS font families are visible.
- Browser-vitals storage defaults to 500 resource rows, while this QA runtime explicitly retains up to the existing 2000-identity limit. A 1000-row document produces 1002 API resources plus assets; its original 500-row inventory was truncated. Preserve such prior raw windows as incomplete and collect a new build cohort. Diagnostic storage does not raise fixture or actual API request budgets. Complete initial-document analysis also verifies every required API path appears once in the resource inventory and that the last frame remains within the local fixture freshness bound.
- Original HTML still loads Pretendard from jsDelivr. The fetch guard covers application fetch, not stylesheet/font subresources; external font dependencies are recorded rather than claimed absent. This fixture build is not an offline/CSP-isolated build.

## Actual API Preparation

These preparation commands make no AWS/API/RPC requests and consume no approval nonce. The runner lives in the planning workspace, not this frontend directory. Use the real approved selection only after reviewing current data; do not infer IDs or silently truncate a larger list.

From the planning workspace, inspect the proposed plan and generate its public build description:

```powershell
node .\work\run-api-ui-measurement.mjs --plan --selection-file <selection.json>
node .\work\run-api-ui-measurement.mjs --public-manifest --selection-file <selection.json>
```

Selection JSON has `watchedAddress` and `streamIds` (canonical positive uint256 decimal strings). `/streams` must return exactly the selected complete ID set; a changed list stops the run rather than extending its allowlist. The current 40-query plan needs `122 + 40 * streamIds.length` GETs, including health, seed and at most 40 metrics reads. At most 34 IDs fit 1500 GETs; byte/time feasibility still requires measurement. A 1000-row local fixture is not eligible for this live plan.

The generated public manifest has **only** `mode`, `planDigest`, `watchedAddress`, `allowedPaths`. Store this output as a local JSON file, not an approval file. From `C:/GitHub/Vestora/frontend`, supply its absolute local path to both build and preview:

```powershell
$env:VESTORA_QA_MODE = 'actual-api'
$env:VESTORA_QA_SESSION_MANIFEST = '<absolute-local-public-manifest.json>'
npm.cmd run qa:ui-build -- --configLoader runner
npm.cmd run qa:ui-preview -- --configLoader runner
```

The output is `qa-ui-actual-dist`, distinct from default `qa-ui-dist`. Actual-API QA pins API **http://127.0.0.1:4394/api**, blocked RPC **http://127.0.0.1:4394/rpc-blocked** and preview Origin **http://127.0.0.1:4342**. Its dev port is 4343. These ports are fixed by mode, not environment overrides, with loopback hosts and strict ports in both modes. Do not kill an unrelated listener to obtain a port. Keep this environment only for the actual-API preview process; remove both variables when returning to fixture mode. Never put an approval document or credentials in Vite defines, `public/`, source control or the browser.

## Separate Run Approval

An actual run requires a new human authorization of the exact target, selection, plan/policy digests, caps, resource/operational guards and time window. The plan's template has `approved:false` and is unusable. Do not automatically approve it, reuse an earlier AWS run's permission, or treat build success as permission.

Only after that run approval, the planning-workspace execution entry is:

```powershell
node .\work\run-api-ui-measurement.mjs --execute --approval-file <fresh-human-approved-api-ui.json>
```

The runner must reserve loopback 4394 and bind the approved preview Origin 4342 before consuming the exclusive nonce and doing AWS preflight. Its matching runner/policy update is required; a port change does not approve a run. The fixture on 4393 and preview on 4341 stay independent. Never automatically switch targets or restart an exhausted run. Approval must leave ten minutes of runway after preflight, within its fifteen-minute issuance window. Resource failure, projection pending/stale/drift, timeout, expiry, allocation exhaustion or safety limits stop further reads.

- Browser, seed, health and metrics share rolling 5 GET starts/s, concurrency 5, total at most 1500, 64 MiB, ten minutes, five-second request and two-MiB response caps. Per-path allocations cannot be exchanged. AWS observation commands also have a fixed cap and heartbeat.
- Entry makes one private, five-second, 16-KiB `/session` handshake per document before importing App. A failed handshake stays failed. Exact account/paths/digest/read-only status/P0-false/expiry are checked. No real wallet or public RPC is used.
- Every API GET includes session-owned plan/run headers; the gateway rejects missing or previous-run values **before** upstream reservation. Only their two-header local CORS preflight is accepted. Every response carries request/run/plan IDs for the recorder to verify; original validated body bytes are retained. A bound non-200 response is recorded once and closes further reads.
- Local `GET http://127.0.0.1:4394/status` and empty `POST http://127.0.0.1:4394/stop` without browser Origin inspect/stop the same approved actual-API run, without an extra upstream request. Stop does not prove already-started backend work was cancelled.
- Only the approved QA tab should operate during measurement. The normal 4190 wallet app and direct backend tabs must not generate unbudgeted reads. Preserve raw traces before navigation/reload; separate task/viewport/source cohorts and missing samples.

## Evidence Limits

CPU/VM and loopback integration tests validate protocol behavior, not actual AWS latency, native-browser actual-API CORS behavior, cold-load timing or functional P0. Repeated fresh 1000-row input/API-pair cohorts, a separately approved actual run and its correlated browser traces remain required. No example, build or synthetic test result authorizes AWS requests. Frame timing is not field INP.
