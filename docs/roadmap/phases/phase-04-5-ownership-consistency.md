# Phase 4.5: Ownership Consistency

## Status

Implemented before Phase 5 API.

Implementation evidence is recorded in `docs/report/ownership-consistency-implementation.md`.

## Goal

Officially support external ERC-721 transfers of Vestora receivable NFTs while keeping on-chain ownership and off-chain projections consistent.

## Core Principle

`ownerOf(streamId)` is the current owner of the receivable NFT and therefore the current owner of the receivable claim right.

Vestora Marketplace is not the only valid transfer path. Users may transfer the receivable NFT outside Vestora Marketplace, and the receivable right moves with the NFT.

The backend projection may track ownership for fast reads, but the smart contract remains the source of truth.

## Current Contract Check

Current `ReceivableStream.claim()` already follows the desired invariant:

- claim permission checks the current `ownerOf(streamId)`
- token payout is sent to the current `ownerOf(streamId)`
- emitted `StreamClaimed` recipient is the current owner

This means the contract-level rule "NFT owner equals receivable claimant" is already aligned with the target design.

Marketplace is currently non-custodial:

- seller keeps the NFT while listed
- marketplace checks owner and approval when listing
- marketplace checks seller ownership again on buy
- marketplace transfers NFT during buy

Because listed NFTs are not escrowed, external transfers can invalidate active listings and must be reflected off-chain.

## Required Behavior

### Contract Invariant Tests

Add or confirm tests for:

- A receives stream NFT
- A transfers NFT externally to B
- `ownerOf(streamId) == B`
- A claim fails
- B claim succeeds
- ERC-20 claim payout goes to B

This proves the core invariant:

```text
current NFT owner = current receivable claimant
```

### Indexer

Index the ERC-721 `Transfer(address indexed from, address indexed to, uint256 indexed tokenId)` event emitted by `ReceivableStream`.

Treat `Transfer` as the ownership event for receivable NFTs:

- mint: `Transfer(0x0, recipient, streamId)`
- external transfer: `Transfer(A, B, streamId)`
- marketplace transfer: `Transfer(seller, buyer, streamId)`

### Projection

Change ownership projection rules:

- `Transfer.to` updates `streams.current_owner`
- `Purchased` creates trade history only
- `Purchased.buyer` should not be the primary ownership source

This separates the meanings:

- `Transfer` says who owns the receivable
- `Purchased` says why the marketplace trade happened and at what price

### Listing Invalidation

If a stream has an `ACTIVE` listing and a `Transfer` changes ownership without a matching marketplace purchase, mark that listing as invalidated.

Recommended listing states:

- `ACTIVE`
- `SOLD`
- `CANCELED`
- `INVALIDATED`

Invalidation means the projected listing is no longer executable because the listed seller is no longer the NFT owner.

### Rebuild

Projection rebuild must replay `Transfer` events in order.

Expected replay model:

```text
StreamCreated
Transfer(0x0 -> A)
Listed
Purchased
Transfer(A -> B)
Transfer(B -> C)
StreamClaimed
```

Final projection:

```text
streams.current_owner = C
```

Given the same `stream_events`, rebuilding projections multiple times must produce the same result.

### Reconciliation

Add an `ownerOf(streamId)` verification path.

Start with detection and logging rather than silent overwrite:

```text
DB current_owner == ownerOf(streamId)
  -> OK

DB current_owner != ownerOf(streamId)
  -> mismatch record/log
  -> investigate missed event or rebuild
```

The goal is to preserve debugging evidence when projection and chain state diverge.

## Recommended Tables Or Fields

Extend projection schema as needed:

- add `INVALIDATED` to listing status
- add `invalidated_at`
- add `invalidated_tx_hash`
- add ownership mismatch/reconciliation records

Implemented in:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261005000000_add_ownership_consistency/migration.sql`
- `backend/src/indexer/contracts.ts`
- `backend/src/indexer/event-decoder.ts`
- `backend/src/projections/rebuild.ts`
- `backend/src/reconciliation/ownership.ts`
- `backend/scripts/reconcile-ownership.ts`
- `backend/scripts/smoke-ownership-projection.ts`

## Completion Criteria

- external ERC-721 `Transfer` logs are indexed into `stream_events`
- projection rebuild updates `streams.current_owner` from `Transfer`
- marketplace `Purchased` creates `trades` but does not directly set owner
- external transfer invalidates active listing projection
- contract test confirms new NFT owner can claim and old owner cannot
- reconciliation command or service can compare DB owner against `ownerOf(streamId)`

## Verification Plan

Verification commands:

```powershell
pnpm --dir backend db:deploy
pnpm --dir backend typecheck
pnpm --dir backend build
yarn test
pnpm --dir backend indexer:once
pnpm --dir backend projections:rebuild
pnpm --dir backend ownership:reconcile
pnpm --dir backend ownership:smoke-projection
```

Current verification evidence:

- contract suite: 48 passing
- backend typecheck: passed
- backend build: passed
- migration deploy: applied `20261005000000_add_ownership_consistency`
- indexer backfill: decoded 8 events, inserted 3 new events, including 3 `Transfer` events in total
- projection rebuild: processed 8 events, 2 streams, 1 claim, 1 trade
- ownership reconciliation: checked 2 streams, matched 2, mismatched 0
- projection smoke: synthetic external transfer updated `current_owner` and changed listing status to `INVALIDATED`

Stronger verification:

- full contract suite
- local scripted scenario:
  - A creates stream
  - A lists stream
  - A externally transfers NFT to B
  - rebuild projections
  - listing is `INVALIDATED`
  - B claims successfully
  - A claim fails

## Phase 5 Dependency

Ownership-sensitive API responses must wait for this phase. Phase 5 can expose read APIs after ownership projection and reconciliation rules are implemented.
