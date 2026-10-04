# Vestora Backend

Phase 2 backend local foundation for Vestora.

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
- `GET /metrics`: Phase 2 placeholder metrics; indexer metrics are added in Phase 3

## Boundary

This backend reads and shapes data for dashboards. It must not hold user private keys or execute user settlement actions such as claim, buy, or cancel.
