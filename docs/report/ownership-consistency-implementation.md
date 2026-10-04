# Ownership Consistency Implementation

Date: 2026-10-05

## Purpose

This document records the Phase 4.5 implementation that makes Vestora officially support external ERC-721 transfers of receivable NFTs.

The core rule is:

```text
ownerOf(streamId) = current receivable claimant
```

The backend may project ownership for fast reads, but the smart contract remains the final source of truth.

## Problem

Vestora Marketplace is non-custodial. A seller keeps the receivable NFT while it is listed. This means the seller can transfer the NFT outside Vestora Marketplace before a marketplace purchase happens.

Without explicit support for this case, the off-chain database can become misleading:

```text
Listing seller = A
NFT ownerOf(streamId) = B
```

In that state, the listing is no longer executable because A no longer owns the receivable NFT.

## Design Decision

Vestora treats the ERC-721 `Transfer` event from `ReceivableStream` as the ownership event.

Event responsibilities:

| Event | Responsibility |
| --- | --- |
| `Transfer(from, to, tokenId)` | Update projected receivable owner |
| `Purchased(streamId, seller, buyer, price)` | Record marketplace trade and mark listing as sold |
| `Listed(streamId, seller, price)` | Create active listing projection |
| `ListingCanceled(streamId, seller)` | Mark listing as canceled |

`Purchased.buyer` is not used as the primary ownership source. This keeps ownership projection aligned with the ERC-721 standard and supports transfers outside the Vestora marketplace.

## Implemented Changes

### Smart Contract Invariant

`ReceivableStream.claim()` already uses the current `ownerOf(streamId)` as both the permission check and payout recipient.

The test `moves claim rights with the receivable NFT` was strengthened to verify:

- external NFT transfer updates `ownerOf`
- old owner cannot claim
- old owner receives no ERC-20 payout
- new owner can claim
- ERC-20 payout goes to the new owner

### Indexer

The backend indexer now decodes:

```solidity
Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
```

For this event, `tokenId` is treated as `streamId` because each receivable stream is represented by one ERC-721 NFT.

### Projection

Projection rebuild now applies these rules:

- `Transfer.to` updates `streams.current_owner`
- mint transfers from `0x000...000` do not invalidate listings
- marketplace purchase transfers do not invalidate listings
- external transfers invalidate active listings
- `Purchased` creates `trades` and marks listing `SOLD`, but does not directly set owner

Marketplace purchase transfers are detected by checking whether the same transaction contains a matching `Purchased` event for the same stream. This matters because ERC-721 `Transfer` can appear before `Purchased` in the same transaction log order.

### Database Schema

`ListingStatus` now includes:

```text
INVALIDATED
```

`listings` now includes:

- `invalidated_at`
- `invalidated_tx_hash`

A new `ownership_reconciliations` table records owner comparison checks:

- `stream_id`
- `projected_owner`
- `onchain_owner`
- `matched`
- `checked_at`

The reconciliation flow records mismatches instead of silently overwriting projection data. This preserves debugging evidence if the indexer misses an event.

### Commands

New backend commands:

```powershell
pnpm --dir backend ownership:reconcile
pnpm --dir backend ownership:smoke-projection
```

Root aliases:

```powershell
pnpm backend:ownership:reconcile
pnpm backend:ownership:smoke-projection
```

## Verification Evidence

Commands executed:

```powershell
pnpm --dir backend prisma:generate
pnpm --dir backend typecheck
pnpm --dir backend build
yarn test
pnpm --dir backend db:deploy
pnpm --dir backend indexer:once
pnpm --dir backend projections:rebuild
pnpm --dir backend ownership:reconcile
pnpm --dir backend ownership:smoke-projection
git diff --check
```

Observed results:

| Check | Result |
| --- | --- |
| Backend typecheck | Passed |
| Backend build | Passed |
| Contract test suite | 48 passing |
| Migration deploy | Applied `20261005000000_add_ownership_consistency` |
| Indexer backfill | Decoded 8 events, inserted 3 new events |
| Indexed Transfer events | 3 `Transfer` events present |
| Projection rebuild | Processed 8 events |
| Ownership reconciliation | 2 checked, 2 matched, 0 mismatched |
| External transfer smoke | Listing changed to `INVALIDATED` |
| Synthetic cleanup | Synthetic stream events removed |
| Whitespace check | Passed |

## Report-Ready Claims

The following claims are supported by the current implementation evidence:

- Vestora's claim right follows ERC-721 ownership, not the original recipient field.
- Vestora supports receivable NFT transfers outside the marketplace at the projection layer.
- Backend ownership projection is derived from ERC-721 `Transfer` events.
- Marketplace purchases are recorded as trades, while ownership is still tracked from ERC-721 transfer events.
- Active listings are invalidated when ownership changes outside a completed marketplace purchase.
- The backend can compare projected owner against on-chain `ownerOf(streamId)` and record mismatch evidence.

## Remaining Limitations

- Reconciliation detects mismatch but does not automatically repair projection data.
- Projection rebuild is currently a full replay script, not an incremental projection worker.
- API endpoints have not yet exposed this ownership status to the frontend.
- UI does not yet show `INVALIDATED` listing state.

These limitations are acceptable before Phase 5 because this phase focused on correctness of ownership tracking and verification boundaries.
