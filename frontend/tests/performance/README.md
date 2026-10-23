# Vestora Bounded Load Preparation

This is a prepared test harness, not a completed AWS/Sepolia performance test.
No wallet signing or public RPC load generator exists here. A/B tests are excluded.

## Verified Scope

- Default target: the isolated API fixture at `127.0.0.1:4391`.
- Shared browser/synthetic gateway: `127.0.0.1:4392`, at most 5 starts per rolling
  second, 5 upstream requests in flight, 1500 reserved requests, 64 MiB response
  body, 10-minute session, 5-second upstream timeout. Caps can only be reduced.
- Explicit GET path allowlist; no forwarded cookies/auth, redirects, retries or
  writes. A bounded local queue (20 requests, at most 5 seconds) smooths polling
  bursts. Queue and upstream durations are recorded separately. Client timeout
  includes both. Limits are shared by every tab and synthetic caller using this
  one gateway, not by independent instances or other users of the service.
- Three consecutive upstream failures, error/latency windows, operator stop,
  budgets and stale live monitoring close the gate. Stopping prevents new
  requests and aborts in-flight client reads; it does not prove backend work
  stopped and never restarts AWS resources.
- Rate-limited waiters use the next rolling-window deadline, rounded up to the
  next millisecond, rather than fixed 50ms polling. Concurrency waiters retain a
  bounded 50ms check; all waiters still re-reserve against the same shared limits.
  A local 5/s rehearsal exposed queue inflation and dropped iterations before
  this change. Retain failed raw runs; do not interpret gateway queue time as
  upstream API capacity or raise the cap to make a run pass.
- Live approval and watchdog expiry also have independent deadlines: they stop
  an idle gateway, abort in-flight reads and wake queued requests without waiting
  for another incoming request. A delayed heartbeat cannot revive an expired
  session. Watchdog age 90000ms is valid; age 90001ms is expired.
- `expiry.test.mjs` injects a clock and upstream responses to check timer renewal,
  stop/close cleanup and in-flight/queue cancellation. All its actual HTTP calls
  stay on ephemeral loopback ports; the approved-live test values are synthetic,
  never changes to the operator approval file or permission to contact AWS.
- `api-contract.mjs` reuses the actual DTO and accounting validators. Schema,
  account or amount errors stop the synthetic run immediately.
- `run.mjs` is zero-request plan-only by default. Smoke is 10 requests over 10
  seconds. Full synthetic plan is 1/s for 60s, 3/s for 120s, 5/s for 120s (1020
  requests), leaving at most 480 shared requests for browser and API monitoring.
- Reports retain endpoint/status/latency, validation errors, bytes, dropped
  iterations, gateway before/after/delta and all raw samples. Fewer than 20
  observations per endpoint are marked small-sample, not an SLA result.

## Local Rehearsal

From `C:/GitHub/Vestora/frontend`, use separate terminals:

```powershell
node tests/manual-qa/server.mjs
npm.cmd run qa:load-gateway
npm.cmd run test:load-safety
npm.cmd run qa:load-plan
npm.cmd run qa:load-smoke
```

The fixture must be in normal mode (or P02-harness for a full 1020-request
rehearsal), with no unresolved fixture transaction. P02-harness has a bounded
1500-API cap and refuses sends. Other fixture API caps are not a load budget. The
preflight/caps are tested before starting the gateway. A stopped/expired gateway
must be explicitly replaced for a new session; never reset counters mid-run.

Production **fixture** UI through the gateway:

```powershell
$env:VESTORA_QA_PERF='1'
node node_modules/vite/bin/vite.js build --config tests/manual-qa/vite.config.ts
node node_modules/vite/bin/vite.js preview --config tests/manual-qa/vite.config.ts
```

Open `http://127.0.0.1:4213/market`. The orange fixture controls identify it as
non-live. `성능 관측 읽기` displays bounded telemetry as visible JSON. Normal
4190/dev app traffic does NOT pass this gateway. Never use an ungated app for a
live load session. Builds go to `qa-dist`, not normal production `dist`.

Emergency local stop (does not make an upstream request):

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:4392/stop
```

## Live Gate: Not Ready

`live-proposal.json` is an explicit proposal, not an authorization. Passing it
with `live-approval.example.json` is refused before listening or contacting AWS.
Do not change the false fields merely to make the tool start.

Required before a separately approved live run:

1. Resolve/retest gas-maximum-fee and hashless-failure recovery (QA-03/04), finish
   actual-wallet functional verification and review every outstanding P0.
2. Reconfirm target, actual stream IDs and address allowlist. A growing dataset
   can add detail paths; do not silently widen the allowlist.
3. Collect fresh ECS/RDS CPU, memory, connections, CPU credits, free storage,
   unchanged scaling and indexer applied/indexed baseline. Existing RDS storage
   autoscaling was observed enabled; do not change it under test authorization.
4. Implement/verify the monitoring bridge or assign an active observer. Live
   requests need `/watchdog` evidence at least every 90 seconds. Automatic AWS
   metric collection is NOT implemented or verified by this harness. A JSON
   assertion alone is not resource evidence.
5. Human approval must identify operator, target and a <=15-minute audit window,
   with no blockers. The running gateway also enforces expiry. Baseline and
   recovery observation (120s each) are outside synthetic stages but inside the
   shared 10-minute session. Build/setup must be finished first.

Watchdog payload is local-only and must reflect observed conditions; missing,
stale or false flags stop live forwarding:

```json
{"observedAt":"ACTUAL_UTC_ISO","cpuOk":true,"memoryOk":true,"connectionsOk":true,"storageOk":true,"creditsOk":true,"indexerOk":true,"scalingUnchanged":true}
```

Existing application/indexer RPC traffic and AWS monitoring API calls are
separate budgets. This tool does not cap them, calculate a cash bill, or prove
that free credits cover all costs. No infrastructure changes are needed to
rehearse it. A localhost URL alone is not network isolation: verify the fixture
source has no upstream client and inspect the pinned target before running.

## Frontend Timing Limits

Fixture-only telemetry captures supported EventTiming/long-task/LCP entries,
API/RPC response-header latency with gateway request ID, queue/upstream timing,
and dispatch-to-second-animation-frame delay. It does not measure the exact
DOM commit of a particular API response. The frame delay is not field INP or a
guaranteed presentation time. EventTiming omits short events below its threshold;
missing is not zero. Aborted fetches are classified separately.

Use production build, fixed viewport/device/dataset and >=20 observations per
task; keep raw samples. A 2-row local fixture smoke proves instrumentation, not
100/1000-row usability, AWS capacity, mobile-device speed or full P01-P08 success.

Primary references: [Node fetch](https://nodejs.org/api/globals.html#fetch),
[PerformanceEventTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming).
