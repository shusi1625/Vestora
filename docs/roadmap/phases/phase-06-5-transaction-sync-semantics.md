# Phase 6.5: Transaction State And Backend Sync Semantics

## Goal

Make transaction progress and backend projection freshness explicit before moving deeper into marketplace buyer protection.

This phase exists because Vestora has two different truth layers:

- contracts are the settlement authority
- backend projections are read models for lists, history, analytics, and estimates

The UI must not imply that backend estimates are final settlement values.

## Finalized Policies

### Transaction Status

Frontend transaction UX is split into explicit phases:

- waiting for wallet confirmation
- transaction submitted and hash available
- waiting for block confirmation
- on-chain confirmed and reads refreshed
- backend indexing pending
- backend indexed when the indexer reaches the confirmed transaction block

The transaction hash is displayed as soon as the wallet submits the transaction, before block confirmation.

### Backend Indexing

On-chain confirmation and backend indexing are separate states.

After a transaction is confirmed:

1. frontend refreshes on-chain reads immediately
2. backend projection remains marked as pending until the indexer reaches the transaction block
3. backend values are refreshed independently

The backend is not considered failed merely because a newly created stream is not projected yet.

### Estimate Semantics

Backend `claimableEstimate` is an estimate only.

- It is not used as the final claimable amount.
- It is calculated using the latest indexed block timestamp, not the API server wall clock.
- It is displayed with an estimate basis timestamp.
- On-chain `claimableAmount(streamId)` remains the primary value for transaction decisions.

### API Sync Metadata

Backend API responses expose projection sync metadata:

- latest indexed block
- latest indexed block timestamp
- safe latest block
- lag blocks
- estimate basis timestamp

This metadata lets the frontend explain stale or pending projection states without confusing them with contract failure.

## Implementation Notes

- `backend/src/api/sync-context.ts` centralizes projection sync metadata.
- API serializers accept an `estimateAt` timestamp so computed values do not drift with server wall-clock time.
- `backend/src/indexer/worker.ts` rebuilds projections automatically when a polling cycle inserts new events.
- `frontend/lib/api.ts` exposes `/metrics` and typed API errors.
- `frontend/app/page.tsx` separates backend API unavailable, backend not indexed, on-chain confirmation, and backend indexing states.

## Completion Criteria

- transaction hash is visible immediately after submission
- transaction status shows wallet, submitted, block confirmation, on-chain refresh, and backend indexing phases
- backend 404 for a selected stream is shown as indexing pending, not API outage
- backend estimates show their basis timestamp
- backend estimate calculation uses latest indexed block time rather than `Date.now()`
- frontend and backend builds pass

## Expected Effect

Users can tell whether they are waiting on their wallet, the chain, or the indexer.

The service can explain slow Sepolia confirmations and backend lag without making settlement values look unreliable.

For the final report, this phase demonstrates the operational boundary between on-chain settlement and off-chain read models.
