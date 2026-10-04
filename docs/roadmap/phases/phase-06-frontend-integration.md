# Phase 6: Frontend Backend Integration

## Goal

Move list, stats, and history reads to backend API while preserving on-chain verification for final authority.

## Direction

- contract reads stay for final authority and transaction preflight
- listing list comes from backend API
- user dashboard comes from backend API
- buy/claim preflight rechecks on-chain state

## Completion Criteria

- marketplace listings render from backend API
- selected stream detail shows backend data plus on-chain verification
- listing render time improves compared with RPC-only reads
- stale data warning or refresh behavior exists

## Codex Routing

Use `frontend_reviewer` for stale data and transaction UX. Use `backend_architect` when response shape changes are needed.
