# Phase 2: Backend Local Foundation

## Status

Implemented with Phase 3 backend work.

The backend foundation now includes:

- Fastify server under `backend/src`
- `GET /health`
- Docker Compose PostgreSQL
- Prisma schema and migrations
- local `.env.example`
- root/backend package scripts

## Goal

Create a locally runnable backend API server and database environment.

## Stack

- Node.js
- TypeScript
- Fastify
- Prisma
- PostgreSQL
- Docker Compose
- viem

## Deliverables

- `backend/package.json`
- `backend/tsconfig.json`
- Fastify server
- `GET /health`
- Docker Compose PostgreSQL
- initial Prisma schema
- `.env.example`

## Completion Criteria

- backend runs with a documented dev command
- `GET /health` returns a normal response
- local PostgreSQL connection works
- Prisma migration succeeds

## Verification Record

Verified locally:

- `pnpm --dir backend prisma:generate`
- `pnpm --dir backend typecheck`
- `pnpm --dir backend build`
- `pnpm --dir backend exec prisma migrate dev --name init_backend_foundation`
- `pnpm --dir backend health`

`GET /health` returned `status: ok` with PostgreSQL connectivity.

## Codex Routing

Use `backend_architect` before implementation if the shape is unclear. Use `verifier` after implementation to choose health, DB, and migration checks.
