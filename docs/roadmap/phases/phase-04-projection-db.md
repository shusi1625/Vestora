# Phase 4: PostgreSQL Projection Design

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

## Codex Routing

Use `backend_architect` for schema shape and query patterns. Use `verifier` for migration and query verification.
