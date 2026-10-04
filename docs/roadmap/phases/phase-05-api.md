# Phase 5: Backend API

## Goal

Let the frontend fetch marketplace and dashboard data without repeated RPC reads.

## Candidate Endpoints

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

- frontend can fetch listing data from backend
- frontend can fetch stream detail from backend
- API response time is logged
- error response format is consistent

## Codex Routing

Use `backend_architect` for route boundaries and response contracts. Use `frontend_reviewer` when API responses affect UI state.
