# Phase 9.6: Recovery, Consistency And Accurate UI

Status: local implementation verified on 2026-10-16. Not deployed to AWS.

## Invariants

- Contracts remain the settlement authority.
- Raw events and the ingestion checkpoint commit together.
- Full replay is bounded by the captured ingestion checkpoint.
- Projection rows and the applied checkpoint commit together.
- A PostgreSQL transaction advisory lock serializes ingestion commits and rebuilds within a schema. Concurrent RPC reads are possible; stale ingestion commits are rejected.
- Recovery runs before ingestion and after every cycle, including empty-event cycles.
- API rows and projection metadata use a repeatable-read snapshot.
- Estimates use the persisted projection block timestamp, not server time or updatedAt.
- UI completion uses the projection checkpoint, not the ingestion cursor.

## Current Evidence

Validated in the disposable local PostgreSQL schema `phase96_test`:

- Missing projection recovery with no new events.
- Rebuild rollback and retry after a malformed event.
- Empty range checkpoint advancement and repeated recovery.
- Concurrent writer rejection and ingestion cursor protection.
- A separate worker process recovers saved ingestion before an unavailable RPC.
- Repeatable-read checkpoint isolation during concurrent writes.
- RPC outage preserves the saved verified timestamp.
- First projection application time survives replay.
- Negative implied yield and undefined zero-price yield.

Frontend policy tests cover projection completion, transaction categories, lifecycle labels, visible-only interval selection and post-confirmation refresh failure.
Backend typecheck/build and frontend typecheck/build have passed during implementation; rerun final checks after remaining edits.

## Additional Verification

- Headless Edge exercised the real Next.js page against intercepted RPC responses: visible polling, hidden suspension, and resumed read-error display passed. No wallet or external RPC transaction was used.
- Snapshot tests verify projection rows and checkpoint remain from one snapshot during a concurrent commit.
- All projection API routes and `/metrics` return saved verified checkpoint metadata during RPC outage.
- Legacy checkpoint timestamp bootstrap and exclusion of events beyond the replay upper bound passed.
- Transaction completion/category/error handling is tested at the policy-function layer; this is not evidence of a new signed Sepolia end-to-end run.

## Browser Test

With Playwright available in the module search path (or `PLAYWRIGHT_MODULE` set to its installed absolute module path):

```powershell
$env:PLAYWRIGHT_CHANNEL="msedge"
node frontend/tests/browser-polling.cjs
```

Requires Node 24 and installed Edge, starts a temporary local Next server on port 3196, intercepts external traffic, and closes its browser/server afterward. Visibility is simulated through the document visibility event. A real wallet is never connected.

## Residual Risks

- One active chain/contract configuration and sync ID per database schema is required. Shared projection tables are not multi-tenant.
- Full rebuild still scales with total event history and has a 30-second transaction timeout. Large histories need later incremental projection work; failures retain the old snapshot and retry.
- Two workers may duplicate RPC reads before one loses the DB commit race. This phase guarantees serialized DB writes, not globally single-flight RPC.
- Browser fixture checks and local PostgreSQL tests do not establish AWS deployment health or chain reorg safety.

## Deliberately Deferred

Reorg recovery, pagination, scheduled ownership reconciliation, RPC error-rate and DB slow-query metrics, stable HTTPS endpoint, limited RPC concurrency, incremental projection, and separate backfill/live-tail scheduling are not completed by this phase.

## Local Verification

Use an explicit process-level DATABASE_URL, never the saved production connection:

```powershell
$env:DATABASE_URL="postgresql://vestora:vestora@127.0.0.1:5433/vestora?schema=phase96_test"
corepack pnpm --dir backend db:deploy
corepack pnpm --dir backend exec tsx scripts/test-recovery.ts
corepack pnpm --dir backend typecheck
corepack pnpm --dir backend build
node --test frontend/tests/transaction-policy.test.mjs
```

The integration script refuses any host/port/database/schema other than the dedicated local target. It clears only that schema's test data.

The older `ownership:smoke-projection` command now requires a separate local schema `phase96_ownership` and `INDEXER_SYNC_ID=phase96-ownership`. Migrate that schema first. It creates a synthetic checkpoint so bounded replay can test external NFT transfers safely. The Phase 9.5 comparison schema must also be migrated before rerunning its harness; it now clears the disposable projection checkpoint between samples.

## Deployment Runbook (Approval Required)

1. Record deployed image digest, task revisions, sync ID and ingestion cursor. Take an approved RDS backup.
2. Stop all old indexer writers before deploying the new writer-lock protocol; old binaries do not participate in the lock.
3. Apply additive migration `20261015120000_projection_checkpoints` to the approved target database.
4. Deploy the new API and worker. Existing ingestion cursors/events remain unchanged.
5. Legacy checkpoint timestamps are fetched from their exact block. If RPC is unavailable, recovery must wait; do not substitute wall-clock time.
6. Verify projection checkpoint catches up, repeated cycles are stable, estimates have a verified basis and `/metrics` distinguishes both checkpoints.
7. Deploy the matching frontend and perform a user-signed test transaction only with approval.

If rebuild fails, inspect the stage/retry logs and malformed event before retrying. Transaction rollback preserves the last complete projection. Never delete operating events/cursors to make recovery appear successful.
Do not roll back to an old writer while the new worker is active. No automatic destructive down-migration is provided.
