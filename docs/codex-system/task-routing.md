# Task Routing

## Purpose

Use this file to decide which project area, documents, and custom agents are relevant before starting a task.

## Routing Table

| User request type | Primary area | Context to read | Useful agents | Typical verification |
| --- | --- | --- | --- | --- |
| Contract behavior, claim, cancel, buy, listing | `contracts/` | `contracts/AGENTS.md`, relevant Solidity/test files | `contract_reviewer`, `verifier` | `pnpm contracts:test` |
| Gas measurement or optimization | `contracts/`, `docs/report/` | Phase 8, `docs/report/gas-baseline.md` | `contract_reviewer`, `verifier` | gas snapshot/test command when available |
| Architecture planning | `docs/architecture/`, `docs/roadmap/` | Phase 1, architecture docs | `planner`, `backend_architect`, `ops_reviewer` | doc consistency check |
| Backend foundation | `backend/` | `backend/AGENTS.md`, Phase 2 | `backend_architect`, `verifier` | backend dev/build/migration checks once present |
| Event indexer | `backend/` | Phase 3, DB draft, contract events | `explorer`, `backend_architect`, `verifier` | indexer backfill/polling checks once present |
| Projection DB schema | `backend/prisma/`, `docs/architecture/` | Phase 4, DB schema draft | `backend_architect`, `verifier` | Prisma migration/checks once present |
| Backend API | `backend/` | Phase 5, API draft | `backend_architect`, `frontend_reviewer`, `verifier` | API tests or endpoint smoke checks |
| Frontend API integration | `frontend/`, `backend/` | Phase 6, frontend/backend guides | `frontend_reviewer`, `backend_architect`, `verifier` | frontend build plus API smoke if available |
| Buyer protection UI | `frontend/`, `contracts/` | Phase 7, frontend/contracts guides | `frontend_reviewer`, `contract_reviewer`, `verifier` | frontend build, targeted transaction checks |
| AWS deployment or metrics | `infra/`, `backend/` | Phase 9, `infra/AGENTS.md`, metrics plan | `ops_reviewer`, `backend_architect`, `verifier` | dry-run/checklist; real cloud needs approval |
| Report or presentation | `docs/report/` | Phase 10, measurement docs | `report_reviewer`, `verifier` | evidence and claim consistency check |
| Codex workflow tuning | `docs/codex-system/`, `.codex/` | operating manual, subagent policy | `planner`, `verifier` | file placement and consistency check |

## Routing Principles

- Start with the narrowest matching area.
- Load cross-area context only when the change crosses an actual boundary.
- Prefer phase docs over the full roadmap when phase docs exist.
- Prefer source files over generated build outputs.
- For documentation-only requests, avoid reading implementation files unless the document claims exact implementation behavior.
- Use Obsidian notes only when repository docs are insufficient or report framing needs original rationale.

## Active Subagent Routing

Use subagents only when their focused context is likely to save time or improve quality:

- `planner`: break phase-level goals into ordered tasks
- `explorer`: map files, commands, data flow, and risks before a larger task
- `backend_architect`: review backend, indexer, Prisma, PostgreSQL, API, and metrics design
- `contract_reviewer`: review Solidity settlement and marketplace invariants
- `frontend_reviewer`: review dashboard, wallet, stale data, and transaction UX
- `ops_reviewer`: review AWS, logs, metrics, secrets, and cost
- `report_reviewer`: review evidence-backed reporting and claims
- `verifier`: choose or interpret focused verification steps

Keep small one-file edits in the main agent. Avoid assigning multiple agents to edit the same files.
