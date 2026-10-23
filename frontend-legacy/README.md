# Vestora Legacy Frontend

This is the preserved Next.js implementation, moved from the former `frontend/` to `frontend-legacy/` in the approved frontend promotion. The primary Vite/React UI is promoted from `frontend-sample/` to [frontend/](../frontend/README.md). These paths describe the target layout; confirm the working tree while the move is in progress.

전환 진행, Vercel 배포 결과는 배포 기록 확인. This README does not establish a deployment URL or successful deployment. Folder moves, deployment settings and validation belong to the main task.

## Role And Entry Points

- [app/page.tsx](app/page.tsx) mounts the component-based live dashboard in [components/app/live-app.tsx](components/app/live-app.tsx).
- [app/design-system/page.tsx](app/design-system/page.tsx) provides the legacy `/design-system` sample gallery; it is separate from the primary Vite application.
- [hooks/use-vestora.ts](hooks/use-vestora.ts) and [lib/pending-transaction.ts](lib/pending-transaction.ts) implement the legacy controller and transaction persistence/recovery.
- [Design-system status](../docs/design-system/README.md) records the legacy components and remaining verification. [Handoff](../docs/codex-system/handoff.md) records current execution boundaries.

## Local Development And Verification

The legacy package retains its Yarn 1.22.22 declaration and lockfile. The following commands run its existing scripts via npm without changing dependencies or lockfiles. From `C:/GitHub/Vestora` after the folder move, with dependencies installed:

```powershell
npm --prefix frontend-legacy run dev

# Run separately from the development server.
npm --prefix frontend-legacy run lint
npm --prefix frontend-legacy run build
node --test frontend-legacy/tests/*.test.mjs
```

Open `http://localhost:3000/` or `http://localhost:3000/design-system` if the legacy server uses the default port. Use the actual port printed by the server when different. These commands are reference instructions; this documentation task did not run builds, application tests or a server.

Primary Vite checks use `npm --prefix frontend run check` and `npm --prefix frontend run build:prod` from the repository root. Vite output is `frontend/dist/`; legacy Next.js output is `frontend-legacy/.next/`. Keep production application output separate from QA outputs and do not use the legacy app's settings as evidence that Vite hosting is configured.

## Safety And Evidence

- Contracts remain settlement authority; backend reads are projections and transaction-critical values must be rechecked on-chain.
- Primary Vite live buy/list/unlist/payment-cancel remain disabled. A feature implemented in this legacy dashboard does not enable it in Vite.
- B-account #3's hashless claim remains blocked. Preserve pending/unknown records and duplicate-submission guards; an empty record on a new browser origin is not authorization to clear or retry the claim.
- Only public client configuration belongs in `NEXT_PUBLIC_*`; never expose secrets or commit real environment files.
- Dated reports retain their original paths: historical `frontend/` refers to this Next.js implementation, and historical `frontend-sample/` refers to the promoted Vite implementation. Local verification and deployed behavior are separate evidence levels.
