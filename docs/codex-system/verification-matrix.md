# Verification Matrix

## Purpose

Use this file to choose the smallest meaningful verification for each type of Vestora work.

## Current Commands

From the repository root:

- `pnpm contracts:compile`
- `pnpm contracts:test`
- `pnpm frontend:build`
- `pnpm frontend:dev`
- `pnpm backend:compose:up`
- `pnpm backend:prisma:generate`
- `pnpm backend:db:migrate`
- `pnpm backend:dev`
- `pnpm backend:health`
- `pnpm backend:typecheck`
- `pnpm backend:build`
- `pnpm backend:indexer:once`
- `pnpm backend:indexer:poll`
- `pnpm backend:projections:rebuild`

## Area-Based Verification

| Area | Minimum check | Stronger check |
| --- | --- | --- |
| Contracts docs only | consistency with current contract behavior | inspect matching tests |
| Contracts code | `pnpm contracts:compile` | `pnpm contracts:test` |
| Marketplace behavior | targeted marketplace tests | full contract test suite |
| Ownership consistency | external NFT transfer then claim test | Transfer indexing, projection rebuild, and ownerOf reconciliation smoke |
| Frontend docs only | route/data-flow consistency | inspect matching frontend files |
| Frontend code | `pnpm frontend:build` | manual smoke with wallet/testnet when needed |
| Backend docs only | consistency with roadmap and API/DB draft | inspect backend files once present |
| Backend foundation | health endpoint smoke | build/test/migration once scripts exist |
| Indexer | idempotency and resume reasoning | backfill/polling smoke once implemented |
| Prisma schema | migration generation/check | local DB migration |
| AWS/infra docs | architecture consistency | cost/security/deployment checklist |
| Report docs | claims backed by measured evidence | reproduce key metrics |

## Phase Completion Checks

### Phase 1 Architecture

- on-chain/off-chain boundary is clear
- backend responsibility is indexing/analytics, not settlement
- API, DB, AWS, and metrics drafts exist

### Phase 2 Backend Local Foundation

- backend starts locally
- `/health` responds
- PostgreSQL is reachable
- Prisma migration succeeds

### Phase 3 Event Indexer

- Sepolia events can be backfilled
- duplicate logs are skipped
- sync resumes from the last processed block
- indexer lag is exposed

### Phase 4 Projection DB

- active listings are queryable
- wallet-related streams/trades are queryable
- claim/trade history is queryable by stream

### Phase 4.5 Ownership Consistency

- external ERC-721 transfer moves claim rights
- Transfer events update projected current owner
- external transfer invalidates active listing projection
- `ownerOf(streamId)` reconciliation can detect projection mismatch

### Phase 5 Backend API

- listing and stream detail APIs work
- error shape is consistent
- response timing is logged

### Phase 6 Frontend Integration

- listings render from backend API
- detail view separates projection data from on-chain verification
- stale/refresh behavior is visible

### Phase 7 Buyer Protection

- remaining value, claimable amount, yield/discount, and risk labels are visible
- buy flow rechecks latest on-chain state

### Phase 8 Gas Optimization

- gas baseline exists
- before/after comparison exists
- safety/readability are not sacrificed for minor gas wins

### Phase 9 AWS Operations

- API and indexer run in AWS
- RDS stores projection data
- CloudWatch logs and metrics are visible

### Phase 10 Report

- final demo scenario is ready
- operational and performance metrics are documented
- technical differentiation is clear
