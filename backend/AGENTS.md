# Backend Guide

## Scope

This directory will own the off-chain indexing and analytics layer:

- Fastify API server
- Prisma schema and migrations
- PostgreSQL projection database
- viem-based event indexer
- metrics endpoints
- API response shaping for the frontend dashboard

## Architectural Boundary

The backend is not a settlement layer. It indexes events, builds read models, calculates dashboard values, exposes metrics, and helps the frontend avoid repeated RPC reads.

The smart contracts remain the final authority for ownership, approvals, claimability, cancellation, and transfers.

## Planned Stack

- Node.js
- TypeScript
- Fastify
- Prisma
- PostgreSQL
- Docker Compose for local DB
- viem for chain reads and event indexing

## Indexer Rules

The indexer should be restart-safe and idempotent:

- track the last processed block in `sync_state`
- deduplicate logs by `txHash + logIndex`
- backfill with `getLogs`
- poll new blocks after backfill
- expose indexer lag through metrics

## API Rules

Use consistent response and error shapes. Log endpoint response time once API logging exists.

API-calculated values may include remaining receivable, claimable estimate, discount rate, expected yield, risk label, listing freshness, and cancellation status. Treat these as projections, not final settlement facts.

## Verification

Backend verification commands will be added after Phase 2 creates the backend foundation. Until then, documentation-only backend changes should be checked for consistency with the implementation roadmap.
