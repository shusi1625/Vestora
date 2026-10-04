# Phase 5: Backend API

## Status

Implemented as backend read API foundation.

## Prerequisite

Complete Phase 4.5 Ownership Consistency before exposing ownership-sensitive APIs.

The API may use projection DB values for fast reads, but ownership-sensitive responses must be clear that:

- `streams.current_owner` is an indexed projection
- `ownerOf(streamId)` remains the source of truth
- transaction-critical frontend actions should recheck on-chain state

## Goal

Let the frontend fetch marketplace and dashboard data without repeated RPC reads.

## Implemented Endpoints

- `GET /health`
- `GET /metrics`
- `GET /streams`
- `GET /streams/:streamId`
- `GET /listings`
- `GET /users/:address/streams`
- `GET /users/:address/trades`
- `GET /market/stats`

## API Projection Values

- remaining receivable
- claimable estimate
- discount rate
- expected yield
- risk label
- listing freshness
- canceled/cancelable status

## Completion Criteria

- frontend can fetch listing data from backend: implemented via `GET /listings`
- frontend can fetch stream detail from backend: implemented via `GET /streams/:streamId`
- API response time is logged: implemented with an `onResponse` hook
- error response format is consistent: implemented with `ApiError` and common error handler

## Implementation Files

- `backend/src/api/errors.ts`
- `backend/src/api/serializers.ts`
- `backend/src/api/validation.ts`
- `backend/src/api/routes/index.ts`
- `backend/src/api/routes/streams.ts`
- `backend/src/api/routes/listings.ts`
- `backend/src/api/routes/market.ts`
- `backend/src/api/routes/users.ts`
- `backend/scripts/smoke-api.ts`

## Verification Evidence

Executed:

```powershell
pnpm --dir backend typecheck
pnpm --dir backend build
pnpm --dir backend api:smoke
```

Observed smoke results:

- `/streams` returned 2 projected streams
- `/listings` returned 1 projected listing
- `/market/stats` returned listing status counts and trade volume
- `/streams/:streamId` detail check passed
- `/users/:address/streams` and `/users/:address/trades` checks passed
- `/streams/not-a-number` returned `400 BAD_REQUEST` using the common error shape
- response time log entries were emitted for each request

## Codex Routing

Use `backend_architect` for route boundaries and response contracts. Use `frontend_reviewer` when API responses affect UI state.
