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

## Implementation Status

Phase 6 frontend/backend integration foundation is implemented.

- `frontend/lib/api.ts` defines typed clients for streams, listings, market stats, and user history APIs.
- `frontend/app/page.tsx` reads marketplace listings, market stats, selected stream projection data, and user stream/trade history from the backend API.
- On-chain reads remain visible in the selected stream detail view so UI projection data can be compared with contract authority.
- Backend data is refreshed with React Query and a stale-data warning appears when API reads become old.
- `frontend/.env.example` documents `NEXT_PUBLIC_VESTORA_API_URL`.

## Verification Evidence

- `yarn --cwd frontend build` passed.
- Local backend `/streams` returned HTTP 200.
- Local frontend `/` returned HTTP 200.
- Browser smoke check confirmed backend API status, marketplace list, market stats, and selected stream backend detail render on the Vestora page.

## Codex Routing

Use `frontend_reviewer` for stale data and transaction UX. Use `backend_architect` when response shape changes are needed.
