# DB Schema Draft

## Tables

Initial projection tables:

- `streams`
- `listings`
- `claims`
- `trades`
- `stream_events`
- `sync_state`
- `market_stats_snapshot`

## streams

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

## listings

- `stream_id`
- `seller`
- `price`
- `status` (`ACTIVE`, `SOLD`, `CANCELED`, `INVALIDATED`)
- `listed_at`
- `sold_at`
- `canceled_at`
- `invalidated_at`
- `buyer`
- `listing_tx_hash`
- `bought_tx_hash`
- `invalidated_tx_hash`

## stream_events

- `chain_id`
- `contract_address`
- `event_name`
- `block_number`
- `block_hash`
- `tx_hash`
- `log_index`
- `stream_id`
- `payload`
- `created_at`

Use `tx_hash + log_index` as the idempotency boundary.

## sync_state

- `chain_id`
- `contract_name`
- `last_processed_block`
- `updated_at`

## Design Notes

Use raw integer/string representations for token amounts. Format decimal display in the API or frontend with explicit token metadata.

Ownership projection should be driven by ERC-721 `Transfer` events from `ReceivableStream`. Marketplace `Purchased` events should create trade history, but should not be the primary source for `streams.current_owner`.

If indexed ownership and `ownerOf(streamId)` disagree, the on-chain value is authoritative. Prefer mismatch detection and logging before silent database overwrite.
