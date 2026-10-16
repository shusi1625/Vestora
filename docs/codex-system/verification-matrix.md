# Verification Matrix

Optional reference when verification scope is unclear. Use applicable AGENTS.md and current package.json scripts first.

| Changed area | Evidence to collect |
| --- | --- |
| Contracts | Compile and relevant tests; cover ownership, approvals, settlement and timestamp boundaries affected by the change. |
| Backend/API | Typecheck/build and affected route tests; check row/checkpoint consistency where relevant. |
| Indexer/projection | Isolated local DB tests for changed ingestion, recovery, replay and concurrency behavior. |
| Prisma schema | Validate schema and apply migration to an isolated local database; verify affected reads/writes. |
| Frontend | Typecheck/build and affected interactions, including stale data and transaction states. |
| AWS/infra | Local validation and read-only inspection first; cloud changes require explicit approval. |
| Documentation | Diff, local links and consistency with current source/evidence; no application build for prose-only changes. |
| Report | Trace claims to measurements; distinguish local fixtures from live deployment evidence. |

Phase acceptance criteria live in [roadmap phases](../roadmap/phases/). Read only the matching phase.
For checkpoint recovery tests and deployment order, use the [Phase 9.6 runbook](../roadmap/phases/phase-09-6-recovery-consistency.md).

Use disposable local schemas for destructive tests; never reset operating events/cursors. Production migrations and wallet signing require approval.
Report actual commands, results, skipped checks and evidence limits. Broaden checks when failures or unresolved risks justify it.
