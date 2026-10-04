# Phase 3: Event Indexer

## Goal

Read contract events and transform them into database projections.

## Events

- `StreamCreated`
- `StreamClaimed`
- `StreamCanceled`
- `Listed`
- `ListingCanceled`
- `Bought`

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

## Codex Routing

Use `explorer` to map contract events and deployment addresses. Use `backend_architect` to review idempotency and projection boundaries.
