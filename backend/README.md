# Vestora Backend

Backend API, indexer, and projection service for Vestora.

The backend is the indexing and analytics layer. It is not the settlement authority. Smart contracts remain the source of truth for ownership, approvals, claimability, cancellation, and transfers.

## Stack

- Node.js
- TypeScript
- Fastify
- Prisma
- PostgreSQL
- Docker Compose
- viem

## Local Setup

```powershell
cd C:\GitHub\Vestora\backend
pnpm install
Copy-Item .env.example .env
pnpm compose:up
pnpm prisma:generate
pnpm db:migrate
pnpm dev
```

In another terminal:

```powershell
cd C:\GitHub\Vestora\backend
pnpm health
```

Expected health response:

```json
{
  "status": "ok",
  "service": "vestora-backend",
  "layer": "indexing-analytics",
  "database": "ok"
}
```

## Endpoints

- `GET /health`: API and PostgreSQL connectivity check
- `GET /metrics`: indexer sync status, API latency counters, and DB row-count metrics
- `GET /streams`: projected stream list
- `GET /streams/:streamId`: projected stream detail with claims
- `GET /listings`: projected marketplace listings
- `GET /users/:address/streams`: streams where the user is sender, initial recipient, or projected current owner
- `GET /users/:address/trades`: marketplace trade history for the user
- `GET /market/stats`: aggregate stream, listing, and trade stats

API ownership fields are projections derived from indexed ERC-721 `Transfer` events. Transaction-critical UI actions should recheck the contract directly, especially `ownerOf(streamId)`.

Run an API smoke check without starting a separate server process:

```powershell
cd C:\GitHub\Vestora\backend
pnpm api:smoke
```

## Public Read Demo Mode

`PUBLIC_READ_MODE=true` enables `src/api/public-read.ts` before internet ingress is opened. It allows only exact, query-free GET requests for `/health`, `/streams`, `/streams/:streamId` and `/users/:address/trades`. Other paths, including `/metrics`, `/listings`, `/market/stats` and user-stream diagnostics, are blocked even when callers bypass the Vercel proxy. Browser CORS reflection is disabled. Internal/local mode defaults off; invalid flag spellings fail startup.

The Fastify rate-limit plugin enforces 90 requests per real socket IP per minute and 300 total requests per process per minute. Forwarded headers do not define the key. At most two admitted public reads execute at once; excess requests receive 429 or 503 with Retry-After before DB/RPC handlers. Only real socket-loopback GET `/health` bypasses public budgets, for container health checks. Public responses are no-store. Request logging is suppressed in this mode to avoid per-request log amplification; errors still use the existing handler.

This is a small public-read demo, not authentication, a distributed limiter, an edge DDoS defense, a spending cap or end-to-end TLS. Budgets reset on process restart and multiply across API replicas. The Vercel function is a shared source, not the original user's identity. Do not scale replicas, open database ports, or send credentials over the HTTP origin hop. Task replacement can change the public origin IP. Revoke the added internet ingress before rolling back to an image without this guard.

Offline checks (no sockets, DB, RPC or AWS):

```powershell
corepack pnpm test:public-read
node --experimental-vm-modules --test scripts/test-local-spans.mjs
```

The guard has 13 focused tests; the app harness adds two public-mode integration cases to the 12 existing cases. Real deployment/ingress and wallet behavior require separate evidence.

## Indexer

Run a one-shot backfill from the last stored sync point:

```powershell
cd C:\GitHub\Vestora\backend
pnpm indexer:once
```

Run the polling worker:

```powershell
cd C:\GitHub\Vestora\backend
pnpm indexer:poll
```

The indexer stores decoded contract events in `stream_events`, using `tx_hash + log_index` as the idempotency boundary. The current sync cursor is stored in `sync_state`.

Indexer performance settings:

- `INDEXER_BATCH_SIZE`: block range per `eth_getLogs` request
- `INDEXER_MAX_BLOCKS_PER_CYCLE`: maximum blocks scanned by one `runIndexerOnce()` cycle
- `INDEXER_PROGRESS_LOG_INTERVAL_BATCHES`: batch interval for CloudWatch-friendly progress logs
- `INDEXER_RPC_CONCURRENCY`: reserved setting for limited parallel RPC reads; keep `1` until measured

## Metrics

`GET /metrics` is intended for local and AWS operational evidence. It currently reports:

- indexer sync state, indexed event counts, active contract addresses, and recent processed-events-per-minute estimate
- API request count, 2xx/3xx/4xx/5xx buckets, error rate, p50/p95/p99 latency, and per-endpoint average latency since the API process started
- PostgreSQL health-check latency and projection table row counts
- operational metrics cache status for indexer and database metrics

These metrics are observability evidence for the indexing/analytics layer. They are not settlement data; transaction-critical actions must still recheck the smart contracts.

### Local Request Spans

`LOCAL_API_SPANS` is off by default. Set it to the exact string `true` before starting an already-authorized local API process to enable request spans. Responses then include the server-generated `x-request-id` header. Span logs contain only a fixed route label, request ID, allowlisted span name, duration and status, plus the standard logger envelope. Raw URL/error logs are suppressed while enabled; response JSON, query order, transaction timeout and RPC/cache policies are unchanged.

Run the offline regression from the repository root (Node 24 and existing backend dependencies required):

```powershell
node --experimental-vm-modules --test backend/scripts/test-local-spans.mjs
```

The script resolves sources and `node_modules` from its backend directory, independent of the working directory. For a partial staging tree, set `VESTORA_BACKEND_ROOT` to the backend directory providing installed dependencies and missing allowlisted source files; files beside the script take priority. Both off/on runs use the same current source. No prepublish manifest or old checkout is required. The fixed module allowlist rejects unexpected imports.

The 14 tests use real `Fastify.inject` with fake RPC/DB/metrics dependencies, block server listen and outbound socket/fetch calls, and check current-source off/on JSON/calls, delays, failures, concurrent IDs and cache sharing, plus public-mode rejection/response compatibility. They do not prove equivalence to an older release, TypeScript type correctness, real Prisma isolation, RPC transport/cache behavior or deployed performance. VM Modules emits an experimental warning. Snapshot acquisition includes transaction setup; nested/parallel durations overlap and must not be summed. Server and client clocks must not be subtracted. The ID header is not added to CORS exposed headers.

## Container Runtime

Build the backend container from this directory:

```powershell
cd C:\GitHub\Vestora\backend
docker build -t vestora-backend:local .
```

The default container command runs the API:

```text
node dist/src/server.js
```

Use the same image for the indexer worker by overriding the command:

```text
node dist/src/indexer/worker.js
```

For AWS deployment planning, see `infra/aws-deployment-runbook.md`.

## Projections

Rebuild query-optimized read models from `stream_events`:

```powershell
cd C:\GitHub\Vestora\backend
pnpm projections:rebuild
```

The rebuild script refreshes:

- `streams`
- `listings`
- `claims`
- `trades`

These tables are read models for dashboards and APIs. They are not settlement authority.

## Ownership Reconciliation

Compare projected owners in PostgreSQL against on-chain `ownerOf(streamId)`:

```powershell
cd C:\GitHub\Vestora\backend
pnpm ownership:reconcile
```

The command records each check in `ownership_reconciliations`. It does not overwrite projection data automatically; mismatches are evidence that the indexer or projection should be investigated.

## Boundary

This backend reads and shapes data for dashboards. It must not hold user private keys or execute user settlement actions such as claim, buy, or cancel.
