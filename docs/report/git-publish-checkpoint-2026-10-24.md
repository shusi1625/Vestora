# Git Publish Checkpoint

Date: 2026-10-24. Scope: reviewed uncommitted Vestora backend protection, frontend feature parity, regression tests and dated evidence. The user explicitly requested commit and push. This record is not proof of a push; verify Git log and the remote branch.

## Local Verification

Runtime: Node v24.19.0. The existing Vercel build uses Node 22; the results below are not a full Node 22 test run.

| Command | Result |
| --- | --- |
| `npm --prefix frontend run check` | Lint and TypeScript pass; 479 model/UI tests and 8 deployment-config tests pass; source audit has no missing imports |
| `npm --prefix frontend run test:load-safety` | 32 simulated safety tests pass; not a live load run |
| `npm --prefix frontend run test:ui-performance` | 180 local regression tests pass; not a new browser response-time measurement |
| `npm --prefix frontend run qa:ui-typecheck` | Pass |
| `npm --prefix frontend run build:prod` | Pass; existing large-chunk and Zod annotation warnings remain |
| `node --test frontend/tests/manual-qa/parity-smoke.test.mjs frontend/tests/manual-qa/balance-fault.test.mjs` | 11 loopback tests pass; 539/550 and 53/96 request budgets; zero outside attempts |
| `node frontend/tests/manual-qa/parity-smoke.test.mjs --typecheck` | Zero fixture/source diagnostics |
| `npm --prefix backend run typecheck` | Pass |
| `npm --prefix backend run build` | Pass |
| `npm --prefix backend run test:public-read` | 13 isolated tests pass |
| `node --experimental-vm-modules --test backend/scripts/test-local-spans.mjs` | 14 isolated tests pass |

Production build JS: `index-Bg3LFlH_.js`, 1,310.78 kB (gzip 391.25 kB), SHA256 `8dc6158edc66e9f07950b92d93a1c76a41da8bf7fe540763b5d54bd4a6298625`. This matches the previously recorded deployed asset, not a new deployment.

## Evidence Boundaries

- No new AWS deployment, database change, public RPC load, wallet transaction or manual Vercel redeploy was performed for this Git task. Contracts were unchanged and contract tests were not rerun.
- The full historical 100-scenario/DEP40 matrix remains incomplete. Passing local suites does not promote its individual case statuses.
- The latest demo read at block 11980179 confirmed listings #7 and #8. #9 remains a hashless `unknown` after a wallet insufficient-funds error; the user reported no hash or explorer link. No receipt establishes a reverted transaction, and missing evidence does not establish that resending is safe. Preserve the stored request and duplicate-submission guard.
- B's static address-level hold was explicitly lifted earlier. That does not settle the old #3 request or the new #9 request.
- Demo #6 purchase, claim and final video are not established. Raw videos, browser logs and local credentials are not part of this publication.
- Candidate path/content checks look for credentials and generated or large artifacts but cannot guarantee detection of every possible secret.

See [current handoff](../codex-system/handoff.md), [feature parity](../../frontend/docs/feature-parity-2026-10-24.md), [demo evidence](../../frontend/docs/demo-recording-plan-2026-10-24.md) and [public-read limitations](../../infra/public-read-demo.md).
