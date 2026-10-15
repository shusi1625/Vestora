# Phase 9.6 Verification Record

Date: 2026-10-16. Scope: local implementation only; no AWS migration or redeployment.

## Changes

Additive migration separates ingestion and projection checkpoints and stores their block times. Raw events retain creation time as first ingestion evidence and gain nullable firstProjectedAt, set once on successful replay. A schema-scoped advisory transaction lock protects writes. Replay captures an upper bound, commits the projection and checkpoint together, and retries missing work before fresh ingestion.

API reads use repeatable-read snapshots. RPC failure affects freshness, not the stored estimate basis. Missing basis returns unavailable time-dependent estimates. Listing yield is signed; discount remains nonnegative. Frontend distinguishes projection-required actions from mint/approval, keeps successful receipts successful after read failures, and polls selected stream reads only while visible.

## Evidence

- `backend/scripts/test-recovery.ts`: local schema guard, recovery without new events, first-application retention, rollback/retry, empty ranges, writer contention, cursor protection, RPC outage, all API routes, row/checkpoint snapshot consistency, legacy bootstrap, bounded replay, separate worker process startup.
- `frontend/tests/transaction-policy.test.mjs`: five passing tests for completion boundary, transaction classes, lifecycle, polling interval and post-confirmation read failures.
- `frontend/tests/browser-polling.cjs`: passed with installed Edge and fixture RPC; real page refreshes while visible, stops while hidden and shows resumed read failure.
- Backend typecheck/build and frontend typecheck/production build passed during this implementation. Final commands are recorded alongside the completion message.

These are correctness tests, not throughput benchmarks. Recovery durations in logs are fixture-specific and must not be advertised as AWS performance.

## Operations

See [Phase 9.6 runbook](../roadmap/phases/phase-09-6-recovery-consistency.md) for migration and rollout order, rollback cautions, and deferred work. Existing AWS data is untouched. Do not run the destructive fixture reset against an operating schema; the test refuses anything except localhost:5433/vestora schema phase96_test.
