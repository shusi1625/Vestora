# Vestora Backend

Backend API, indexer, and projection service for Vestora.

The backend is the indexing and analytics layer. It is not the settlement authority. Smart contracts remain the source of truth for ownership, approvals, claimability, cancellation, and transfers.

## Stack

- Node.js
- TypeScript
- Fastify
- Prisma
- PostgreSQL
- Docker Compose
- viem

## Local Setup

```powershell
cd C:\GitHub\Vestora\backend
pnpm install
Copy-Item .env.example .env
pnpm compose:up
pnpm prisma:generate
pnpm db:migrate
pnpm dev
```

In another terminal:

```powershell
cd C:\GitHub\Vestora\backend
pnpm health
```

Expected health response:

```json
{
  "status": "ok",
  "service": "vestora-backend",
  "layer": "indexing-analytics",
  "database": "ok"
}
```

## Endpoints

- `GET /health`: API and PostgreSQL connectivity check
- `GET /metrics`: indexer sync status and lag against Sepolia
- `GET /streams`: projected stream list
- `GET /streams/:streamId`: projected stream detail with claims
- `GET /listings`: projected marketplace listings
- `GET /users/:address/streams`: streams where the user is sender, initial recipient, or projected current owner
- `GET /users/:address/trades`: marketplace trade history for the user
- `GET /market/stats`: aggregate stream, listing, and trade stats

API ownership fields are projections derived from indexed ERC-721 `Transfer` events. Transaction-critical UI actions should recheck the contract directly, especially `ownerOf(streamId)`.

Run an API smoke check without starting a separate server process:

```powershell
cd C:\GitHub\Vestora\backend
pnpm api:smoke
```

## Indexer

Run a one-shot backfill from the last stored sync point:

```powershell
cd C:\GitHub\Vestora\backend
pnpm indexer:once
```

Run the polling worker:

```powershell
cd C:\GitHub\Vestora\backend
pnpm indexer:poll
```

The indexer stores decoded contract events in `stream_events`, using `tx_hash + log_index` as the idempotency boundary. The current sync cursor is stored in `sync_state`.

## Projections

Rebuild query-optimized read models from `stream_events`:

```powershell
cd C:\GitHub\Vestora\backend
pnpm projections:rebuild
```

The rebuild script refreshes:

- `streams`
- `listings`
- `claims`
- `trades`

These tables are read models for dashboards and APIs. They are not settlement authority.

## Ownership Reconciliation

Compare projected owners in PostgreSQL against on-chain `ownerOf(streamId)`:

```powershell
cd C:\GitHub\Vestora\backend
pnpm ownership:reconcile
```

The command records each check in `ownership_reconciliations`. It does not overwrite projection data automatically; mismatches are evidence that the indexer or projection should be investigated.

## Boundary

This backend reads and shapes data for dashboards. It must not hold user private keys or execute user settlement actions such as claim, buy, or cancel.
