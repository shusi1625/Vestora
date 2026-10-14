# AWS Indexer Operations And Bottleneck Review

작성일: 2026-10-14

## Purpose

이 문서는 Vestora 백엔드가 AWS에서 어떤 리소스로 동작했는지, 실제 운영 중 어떤 인덱서 병목이 관측되었는지, 그리고 Phase 9.5에서 어떤 개선을 구현했는지 기록한다.

경계:

- Solidity contracts are the settlement layer and final source of truth.
- Backend API, indexer, PostgreSQL projection DB are read, indexing, analytics layers.
- AWS deployment is service-like operational evidence, not a claim of enterprise production maturity.
- Secrets, private keys, database passwords, RPC credentials, and full connection strings must not be committed.

## AWS Work Completed

| Area | Resource / Result |
| --- | --- |
| Region | `ap-southeast-2`; this account's Seoul repository creation was denied by an SCP, not a claim about every Free Plan account |
| Container image | ECR repository `vestora-backend`; initial tag `latest`, Phase 9.5 uses a pinned digest below |
| Database | RDS PostgreSQL `vestora-db`, database `vestora` |
| Runtime | ECS Fargate cluster `vestora-cluster` |
| API | `/health`, `/metrics`, `/streams` verified |
| Indexer | Sepolia event indexing reached `synced` |
| Migration | Prisma migrations applied through a one-off ECS task |

Current Sepolia contracts:

| Contract | Address |
| --- | --- |
| MockUSDC | `0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9` |
| ReceivableStream | `0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a` |
| ReceivableMarketplace | `0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7` |

## Bottleneck Observed

The initial AWS indexer backfill had to scan roughly 50,000 Sepolia blocks.

```text
Backfill range: about 50,000 blocks
Indexer batch size: 10 blocks
Indexed contracts: 2
Previous estimated eth_getLogs calls: 50,000 / 10 * 2 = about 10,000
```

This path is not expected during normal steady-state operation. It appears during first deployment, DB reset, sync id changes, contract redeployment, long indexer downtime, or replay after projection changes.

## Phase 9.5 Implementation

Implemented changes:

- Added cycle limiting with `INDEXER_MAX_BLOCKS_PER_CYCLE`.
- Added CloudWatch-friendly JSON progress logs every `INDEXER_PROGRESS_LOG_INTERVAL_BATCHES` batches.
- Merged Stream and Marketplace event reads into one `eth_getLogs` request using an address array.
- Added timing and throughput fields to `runIndexerOnce()` results.
- Added `/metrics` cache for indexer and database metrics via `INDEXER_METRICS_CACHE_TTL_MS`.
- Added `INDEXER_RPC_CONCURRENCY` as a reserved setting, defaulting to `1`.

New indexer run result fields:

- `cycleLimited`
- `remainingBlocks`
- `durationMs`
- `blocksPerSecond`
- `rpcCalls`
- `getLogsDurationMs`
- `dbWriteDurationMs`

New `/metrics` cache fields:

- `cache.operationalMetricsHit`
- `cache.operationalMetricsTtlMs`
- `cache.operationalMetricsAgeMs`
- `cache.operationalMetricsCollectedAt`
- `cache.operationalMetricsExpiresAt`

## Expected Improvement Metrics

| Scenario | Batch Size | Contract Read Strategy | Estimated `eth_getLogs` Calls For 50,000 Blocks | Expected Effect |
| --- | ---: | --- | ---: | --- |
| Before Phase 9.5 | 10 | separate contract reads | about 10,000 | baseline |
| After address merge | 10 | one address-array read | about 5,000 | about 50% fewer RPC calls |
| Larger provider range | 1,000 | one address-array read | about 50 | requires provider support |
| Larger provider range | 2,000 | one address-array read | about 25 | requires provider support |

These are expected metrics. Final report claims still require measured evidence from repeatable runs.

## Measurement Plan

Record the following during local and AWS runs:

- scanned blocks
- batches
- `rpcCalls`
- `durationMs`
- `blocksPerSecond`
- `getLogsDurationMs`
- `dbWriteDurationMs`
- projection duration (separate instrumentation still required)
- `/metrics` cache hit status and response time
- indexer lag before and after each cycle

Recommended command checks:

```powershell
corepack pnpm --dir backend typecheck
corepack pnpm --dir backend build
corepack pnpm --dir backend indexer:once
```

## 2026-10-15 Deployment Record

Verified through AWS CLI using profile `vestora`, region `ap-southeast-2`:

| Item | Verified value |
| --- | --- |
| Cluster | `vestora-cluster` |
| API service | `vestora-backend-api-service-tq74fzqe` |
| API task definition | `vestora-backend-api:2` (previous revision: 1) |
| Indexer service | `vestora-backend-indexer` |
| Indexer task definition | `vestora-backend-indexer:3` (previous revision: 2) |
| Both deployments | `COMPLETED`, running 1, pending 0 |
| Container name | `vestora-backend` for both services |
| Image tag | `phase95-20261015` |
| Pinned image digest | `sha256:04abf60f13973fad76b1b214396c65f376e1e8d99557212dda3a7fcc2ae24faa` |
| API base URL | `http://3.24.169.190:3001` |
| Previous API IP | `13.239.233.161` (do not use for this deployment) |
| Sync ID / start block | `sepolia-v4` / `11849510`, unchanged |

Deployment preserved database schema and existing operational cursor. API used a rolling update. Indexer was stopped to desired count 0 before starting revision 3 with desired count 1, avoiding simultaneous writers during this deployment. A max-percent=100 deployment-config attempt was rejected due to availability-zone rebalancing; that config change was not applied. Future indexer updates still need a single-writer deployment procedure.

Runtime settings: batch size 10, max blocks per cycle 1000, progress interval 50 batches, metrics TTL 10000 ms, reserved RPC concurrency 1. Actual parallel RPC fetching is not implemented.

Task replacement can change this public IP. Update the frontend environment and restart development / rebuild production when it changes. This is an HTTP demo endpoint restricted by the existing security group, not a stable HTTPS production API. No new security-group exposure was added in Phase 9.5.

## Measurement Evidence

The following are smoke measurements, not a statistically controlled performance benchmark. Local and AWS results use different network paths and must not be compared as equivalent environments.

| Test | Result |
| --- | --- |
| Local 1-block cycle | 325.74 ms total, 1 getLogs call, 68.70 ms getLogs, 9.39 ms DB writes, cycleLimited=true |
| Local event-range cycle | blocks 11849510-11849619 inclusive; 110 blocks, 11 batches/calls; 1191.46 ms total; 92.32 blocks/s; getLogs 644.49 ms; DB writes 51.59 ms |
| Event decoding | 6 raw logs, 5 supported events; all 5 duplicates in the existing local DB; 0 new inserts |
| Projection replay | 2 rebuilds returned equal counts: 5 events, 1 stream, 1 trade, no active listing; API returned stream #1 with SOLD listing |
| Local metrics injection | miss 607 ms then hit 1 ms; two samples, excludes browser/network |
| Earlier AWS metrics smoke | miss 3223 ms then hit 421 ms; two desktop-to-Sydney requests |
| AWS recheck at 2026-10-15 03:00 KST | hit 722 ms then hit 415 ms, identical collectedAt=2026-10-14T17:59:59.397Z; cache ages 1380/1816 ms; DB ok; cursor 11914904; lag 0 |

Local event-range test used publicNode, a separate verification sync ID and local PostgreSQL, not the AWS operating cursor. Rebuild equality above refers to returned counts, not an exhaustive row-by-row assertion. AWS live-cycle evidence showed 1-4 block cycles, not a 50,000-block backfill benchmark.

`rpcCalls` currently counts logical `getLogs` invocations only. It excludes block-number reads, block timestamp lookups, transport retries and provider billing units. `dbWriteDurationMs` includes event insertion and cursor upsert, but excludes projection rebuild. Total duration also includes other reads, decoding and overhead; it is not simply the sum of those two timing fields.

## Frontend Connection Verification

- Local `frontend/.env.local`: `NEXT_PUBLIC_VESTORA_API_URL=http://3.24.169.190:3001`; ignored by Git. Example configuration remains local-development oriented.
- Development server started at `http://localhost:3000`.
- Direct `/streams` response: HTTP 200; CORS allowed `http://localhost:3000`.
- Actual browser view: Backend API OK, streams/listings/trades each 1, stream #1 SOLD, backend owner and remaining value loaded; on-chain contract checks both OK.
- Wallet was disconnected. No create/list/claim transaction was signed or claimed as tested in this verification.
- Backend typecheck and build passed again; `git diff --check` passed (CRLF conversion warnings only).

## Remaining Gates And Next Experiment

1. In a MetaMask-enabled browser, create a small test stream, list it and claim. For each transaction record hash, receipt block/time, first API projection visibility and first UI visibility. Keep wallet confirmation delay separate from indexing delay. No measured end-to-end latency is claimed yet.
2. Compare separate-address and merged-address reads over the SAME fixed block interval, batch size and RPC provider, alternating run order. Use an isolated local test database/schema and verification cursor, never reset `sepolia-v4` in AWS. Check decoded event identities and projection outputs as well as call counts and elapsed/DB times.
3. The 10000-to-5000 getLogs reduction over 50000 blocks is arithmetic, not proof of a 2x speedup. Measure timestamp calls, retries and projection cost before choosing limited parallelism, incremental projection or separate live/backfill workers.

Rollback candidates are API revision 1 and indexer revision 2; any rollback requires explicit approval, preserves the cursor and must avoid overlapping indexer writers. No rollback was performed.

## Controlled Read Comparison (2026-10-15)

Runner: `backend/scripts/compare-indexer-reads.ts`. Raw evidence: [phase95-read-comparison.json](phase95-read-comparison.json).

Fixed range 11849510-11849619 (110 blocks), batch 10, publicNode Sepolia RPC, local PostgreSQL schema `phase95_benchmark`, three runs per strategy. Order was separate/merged, merged/separate, separate/merged. Each run inserted the same five events from an empty event table; timestamp lookup caching, decoding, persistence and cursor logic remained identical. This isolates the read strategy rather than replaying an entire historical release.

| Per-run metric (mean unless noted) | Separate addresses | Merged addresses |
| --- | ---: | ---: |
| Logical getLogs calls (every run) | 22 | 11 |
| Cycle total ms (excludes projection) | 1626.80 | 854.42 |
| getLogs duration ms | 1310.18 | 619.77 |
| DB writes ms | 51.80 | 52.91 |
| Separate full projection rebuild ms | 36.00 | 28.72 |
| Logical timestamp / head calls | 3 / 1 | 3 / 1 |

Observed cycle reduction: 47.48%, about 1.90x throughput for this small sample. Logical getLogs calls decreased 50%; DB work did not decrease. These are not production percentiles or proof of the same speedup on Alchemy/AWS. Provider caching, first-run warmup and network variability were not eliminated; alternating order only reduces order bias. Three samples per strategy are insufficient for tail-latency claims.

The runner's `getLogsCalls` is the strategy-level counter. The inherited production `rpcCalls` remains 11 in both modes because it sees 11 batch-level wrapper invocations. Neither counter measures wire-level retries or billable requests; getBlockNumber can also be cached by viem.

All six runs matched normalized event hashes and stream/listing/trade projection hashes, excluding generated IDs and ingestion timestamps. No claim event exists in this interval, so claim projection correctness is not proved by this fixture. AWS's `sepolia-v4` cursor was not read or written by the benchmark; the runner refuses non-loopback DBs, other schema names and operational sync IDs. Local public schema was untouched.

### Reproduce

Run from the repository root. The migration and cleanup target a disposable local schema. The runner clears that schema's event/cursor tables before each run and replaces its projections, so never store unrelated test data there.

```powershell
$env:DATABASE_URL="postgresql://vestora:vestora@127.0.0.1:5433/vestora?schema=phase95_benchmark"
$env:SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com"
$env:INDEXER_SYNC_ID="phase95-benchmark"
$env:INDEXER_START_BLOCK="11849510"
$env:INDEXER_BATCH_SIZE="10"
$env:INDEXER_MAX_BLOCKS_PER_CYCLE="110"
corepack pnpm --dir backend db:deploy
$env:INDEXER_COMPARISON_OUTPUT="$PWD/docs/report/phase95-read-comparison.json"
corepack pnpm --dir backend exec tsx scripts/compare-indexer-reads.ts
```

Use a dedicated terminal, then close it so benchmark environment overrides cannot leak into normal operations. This example contains local disposable credentials only.

## Next Optimization Decision

1. **Limited RPC concurrency first, as a measured opt-in experiment.** In the merged samples, getLogs accounts for about 73% of cycle time, versus about 6% DB writes. Test concurrency 2 against 1 on a larger fixed interval under the actual provider limits before enabling it in AWS. Fetching can overlap, but writes/cursor commits must remain block-ordered; failed ranges must never be skipped. Record retries, throttling and wire-level requests, not only logical calls.
2. **Incremental projection second.** Five events rebuild in about 29ms here; this does not demonstrate a current bottleneck, but full replay cost grows with history. Benchmark synthetic event-volume scaling and implement atomic projection checkpoints plus replay equivalence before replacing full rebuild. Also cover restart after event insertion but before successful rebuild.
3. **Separate live tail/backfill last, gated by freshness requirements.** Current operating lag reached zero and bounded cycles already expose partial progress. Introduce separate cursors/workers only if catch-up prevents the required live freshness; out-of-order projection correctness and a single authoritative read-model checkpoint must be designed first. Moving this earlier requires measured persistent freshness failures.

This is an evidence-based implementation order, not a claim that any of these three optimizations is already deployed. End-to-end browser create/list/claim latency still requires wallet interaction and remains open.
