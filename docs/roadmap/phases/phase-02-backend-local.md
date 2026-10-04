# Phase 2: Backend Local Foundation

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

## Codex Routing

Use `backend_architect` before implementation if the shape is unclear. Use `verifier` after implementation to choose health, DB, and migration checks.
