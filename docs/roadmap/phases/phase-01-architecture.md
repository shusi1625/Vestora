# Phase 1: Planning And Architecture

## Goal

Finalize the backend-included target architecture.

## Deliverables

- `docs/architecture/onchain-offchain-boundary.md`
- `docs/architecture/backend-responsibility.md`
- `docs/architecture/aws-deployment-reason.md`
- `docs/architecture/api-draft.md`
- `docs/architecture/db-schema-draft.md`
- `docs/architecture/metrics-plan.md`

## Completion Criteria

- The backend is clearly described as indexing/analytics, not settlement.
- On-chain data and DB projection data are separated.
- AWS is justified as a way to collect service-like operational evidence.

## Codex Routing

Use `planner` for task breakdown, `backend_architect` for architecture review, and `ops_reviewer` for AWS/metrics review.
