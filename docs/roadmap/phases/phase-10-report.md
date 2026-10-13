# Phase 10: Performance Measurement And Report

## Goal

Prove the project differentiation through architecture, measurements, and final demo evidence.

## Comparisons

- direct RPC reads vs backend API reads
- on-chain transaction gas
- backend API latency
- indexer lag
- listing render time
- UI reflection time after transaction confirmation

## Report Topics

- differentiation from prior services
- economic meaning of receivable NFTs
- on-chain/off-chain architecture
- backend indexer design
- AWS operational metrics
- gas optimization results
- UI/UX performance results
- limitations and future work

## Completion Criteria

- final demo scenario is ready
- contracts, backend, and frontend work together
- operational and performance metrics can be shown in tables
- technical differentiation is clear

## Current Local Preparation

Implemented before final measurement capture:

- backend performance measurement harness: `backend/scripts/measure-performance.ts`
- root script: `yarn backend:performance:measure`
- backend script: `pnpm --dir backend performance:measure`
- report measurement instructions: `docs/report/performance-measurement.md`

Still requires a running local PostgreSQL environment before numeric results can be recorded:

- `pnpm --dir backend compose:up`
- `pnpm --dir backend db:migrate`
- `pnpm --dir backend indexer:once`
- `pnpm --dir backend projections:rebuild`
- `pnpm --dir backend performance:measure`

## Codex Routing

Use `report_reviewer` to separate verified evidence from claims and inference.
