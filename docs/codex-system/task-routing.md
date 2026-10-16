# Task Routing

Optional lookup. Start with the narrowest affected files; commands live in package.json.

| Work | Read first | Verify |
| --- | --- | --- |
| Solidity | contracts/, test/, root AGENTS.md | compile + relevant contract tests |
| Backend/indexer | backend/AGENTS.md, affected source/tests | backend typecheck/build + isolated DB tests where needed |
| Frontend | frontend/AGENTS.md, affected components | typecheck/build + affected interaction |
| AWS | infra/AGENTS.md, matching rollout runbook | read-only/dry-run first; mutation requires approval |
| Phase planning | matching docs/roadmap/phases/ file | compare acceptance criteria with evidence |
| Reporting | relevant docs/report/ evidence | separate measurement, inference and deferred work |
| Harness | operating-manual.md | instruction consistency, links and diff |

Do not load all rows or invoke agents from a role list. Cross layers only when the actual change does.
