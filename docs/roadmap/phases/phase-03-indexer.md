# Phase 3: Event Indexer

## Status

Implemented on top of Phase 2 backend foundation.

## Goal

Read contract events and transform them into database projections.

## Events

- `StreamCreated`
- `StreamClaimed`
- `StreamCanceled`
- `Listed`
- `ListingCanceled`
- `Purchased`

Note: early planning used the name `Bought`, but the deployed marketplace contract emits `Purchased`. The indexer stores the actual contract event name.

## Required Behavior

- backfill with viem `getLogs`
- poll latest blocks
- deduplicate by `txHash + logIndex`
- store last processed block in `sync_state`
- resume from last processed block after restart
- calculate indexer lag

## Deliverables

- indexer service
- event decoder
- `sync_state` table
- `stream_events` table
- indexer logs

## Completion Criteria

- Sepolia historical events can be stored in DB
- duplicate events are not processed twice
- restart resumes from the next block
- `/metrics` exposes indexer lag

## Implementation Notes

- `stream_events` stores decoded raw events.
- `sync_state` stores the latest processed block.
- `tx_hash + log_index` is the idempotency boundary.
- `indexer:once` performs one backfill/resume cycle.
- `indexer:poll` runs the polling worker.
- Projection tables such as `streams`, `listings`, `claims`, and `trades` are deferred to Phase 4.

## Verification Record

Verified locally:

- `pnpm --dir backend indexer:once`
- `pnpm --dir backend typecheck`
- `pnpm --dir backend build`
- `GET /metrics`

Initial Sepolia backfill result:

- raw logs: 9
- decoded events: 5
- inserted events: 5
- skipped duplicates: 0

Stored event counts:

- `StreamCreated`: 2
- `StreamClaimed`: 1
- `Listed`: 1
- `Purchased`: 1

Re-running the indexer resumed from `sync_state` instead of reprocessing from the deployment block.

## Codex Routing

Use `explorer` to map contract events and deployment addresses. Use `backend_architect` to review idempotency and projection boundaries.
