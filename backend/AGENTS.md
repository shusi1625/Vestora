# Backend Guide

Fastify + Prisma/PostgreSQL + viem provide indexing/analytics, never settlement authority.

- Separate ingestion and projection checkpoints; persist each with its data atomically.
- Deduplicate events; protect writers; replay only a captured ingested range. Recover unapplied ranges after restart, including empty ranges.
- Read projection rows and checkpoint in one consistent snapshot. Estimate only at verified projected block time; unknown basis is null, never wall-clock fallback.
- Current ownership, approvals and transaction validity remain on-chain. Expose lag, stale state and failures honestly.
- Preserve raw events and first-observed evidence. Use isolated local schemas for destructive/failure-injection tests; never reset operating cursors.
- Commands from repo root: corepack pnpm --dir backend typecheck; corepack pnpm --dir backend build.
- For recovery tests and migration rollout, consult docs/roadmap/phases/phase-09-6-recovery-consistency.md only when relevant. Production migration/deployment needs approval.
