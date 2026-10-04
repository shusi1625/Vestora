# Phase 4: PostgreSQL Projection Design

## Status

Implemented as a full rebuild projection pipeline from `stream_events`.

## Goal

Create read models the frontend can query quickly.

## Candidate Tables

- `streams`
- `listings`
- `claims`
- `trades`
- `stream_events`
- `sync_state`
- `market_stats_snapshot`

## Stream Fields

- `stream_id`
- `sender`
- `recipient`
- `current_owner`
- `token`
- `deposited_amount`
- `withdrawn_amount`
- `start_time`
- `end_time`
- `cancelable`
- `canceled_at`
- `created_tx_hash`
- `updated_at`

## Listing Fields

- `stream_id`
- `seller`
- `price`
- `status`
- `listed_at`
- `sold_at`
- `canceled_at`
- `buyer`
- `listing_tx_hash`
- `bought_tx_hash`

## Completion Criteria

- active listings can be queried from DB
- wallet-related streams and trades can be queried
- claim/trade history can be queried by stream

## Implementation Notes

- `stream_events` remains the raw event source.
- `streams`, `listings`, `claims`, and `trades` are query-optimized read models.
- token amounts are stored as raw integer strings to avoid `uint256` overflow/precision issues.
- `current_owner` is currently updated from `StreamCreated.recipient` and marketplace `Purchased.buyer`.
- This ownership model is intentionally temporary. Phase 4.5 replaces it with ERC-721 `Transfer` event tracking and `ownerOf(streamId)` reconciliation so external NFT transfers are officially supported.
- MVP projection rebuild uses a full rebuild script instead of incremental projection updates.

## Phase 4.5 Dependency

Do not treat the current Phase 4 `current_owner` projection as final API behavior. Before exposing ownership-sensitive APIs, implement Phase 4.5 Ownership Consistency:

- index ERC-721 `Transfer`
- use `Transfer.to` as the projection source for `streams.current_owner`
- keep `Purchased` as trade/price history only
- invalidate active listings when ownership changes outside a completed marketplace purchase
- add `ownerOf(streamId)` reconciliation

## Commands

```powershell
pnpm --dir backend projections:rebuild
```

## Verification Record

Verified locally:

- `pnpm --dir backend prisma:generate`
- `pnpm --dir backend typecheck`
- `pnpm --dir backend exec prisma migrate dev --name add_projection_tables`
- `pnpm --dir backend projections:rebuild`

Projection rebuild result:

- processed events: 5
- streams: 2
- active listings: 0
- claims: 1
- trades: 1

Query checks:

- active listings query returned successfully with 0 rows because the current indexed listing is already sold
- wallet-related streams query returned 2 rows
- stream-specific claim history query returned 1 row

## Codex Routing

Use `backend_architect` for schema shape and query patterns. Use `verifier` for migration and query verification.
