# Vestora Frontend

This is the Vite/React product application. The previous Next.js application is in `../frontend-legacy/`.

- Preserve the current UI, Korean translations and BigInt accounting. Backend data is projection, not settlement authority.
- Run `npm run check`, `npm run test:load-safety`, `npm run test:ui-performance`, `npm run qa:ui-typecheck` and `npm run build:prod` for relevant changes.
- Production uses the same-origin `/vestora-api` read adapter. Never expose secrets in `VITE_*`, forward wallet credentials to the backend, or deploy QA output.
- Keep unresolved reservations. The user explicitly lifted B's static address-level deployment hold on 2026-10-24 for demo reuse; do not reinstate it from historical notes. This is not evidence that the old #3 attempt settled. A new origin, timeout, missing hash or fresh balance is not proof that resending is safe; never delete pending records or retry them automatically.
- Wallet signatures, new load runs, AWS changes and deployments require explicit authorization. Do not turn disabled live marketplace/cancellation actions into sends during UI work.
- Update `CodeGuideline.md` for new/removed modules. Dated reports describe their historical build and paths, not today's deployment.
