# Phase 9.6 AWS Deployment Evidence

Recorded on 2026-10-16 (Asia/Seoul) from the approved CLI deployment of source commit `f56ac76`. This is a deployment-time snapshot, not a fresh audit or a throughput benchmark.

## Deployment

| Item | Observed result |
| --- | --- |
| Profile / region | `vestora` / `ap-southeast-2` |
| Cluster / database | `vestora-cluster` / `vestora-db` (PostgreSQL) |
| Backup | `vestora-phase96-20261016-173039`, `available`, 100%; retained |
| ECR tag | `phase96-f56ac76` |
| Image digest | `sha256:fedc0cb8049bd88b835a8f0d8c818d8ffc88f8a2a84b74443e890bd5e943d8ce` |
| API service / revision | `vestora-backend-api-service-tq74fzqe` / `vestora-backend-api:3` |
| Worker service / revision | `vestora-backend-indexer` / `vestora-backend-indexer:4` |
| Final ECS state | Both `COMPLETED`, desired/running 1, pending 0, one deployment each |
| API URL | `http://15.135.223.4:3001`; replaces `http://3.24.169.190:3001` |
| Sync ID / start block | `sepolia-v4` / `11849510`, unchanged |

Docker built the backend with Prisma client generation and TypeScript compilation passing. Both task definitions pin the image digest and retain the existing network, roles and secret injection settings. No credentials or raw task-definition exports are included here.

## Database migration and preservation

Applied `20261015120000_projection_checkpoints` through a one-off ECS task after the original worker stopped. The task exited 0 and recorded successful application at `2026-10-16T08:35:59.540Z` (17:35:59.540 KST).

The migration added `sync_state.latest_indexed_block_timestamp`, `stream_events.first_projected_at` and `projection_state`. Before and after migration:

- Ingestion cursor remained `11926234`, including the original sync row creation/update timestamps.
- All 9 raw event records were preserved. Ordered row-content MD5, excluding the newly added `first_projected_at`, matched: `89ab20c21be732d27b189747aa94f1f3`.
- Projection counts remained 2 streams, 2 listings and 1 trade.
- `projection_state` was initially empty; the new worker subsequently recovered it from retained events.

A separate read-only DB audit exited 0. Two snapshots showed ingestion/projection pairs `11926251/11926251` and `11926252/11926252`. All 9 events had first-application timestamps; those timestamps and the original event fingerprint were unchanged between samples. Counts alone do not prove every projection field; the fingerprint covers raw events, while API checks below cover selected calculated values.

## Worker transition incident and corrected procedure

The original worker was fully stopped before migration. During the later service update, changing task revision and desired count from 0 to 1 together caused ECS to temporarily run old revision 3 alongside revision 4. A cycle failure was observed; its cause was not independently established. Do not claim an overlap-free rollout.

The worker service was scaled back to 0 and its remaining task stopped. We waited until the old deployment disappeared and only revision 4 remained with rollout `COMPLETED` and desired/running/pending all 0. A separate scale-up then started one revision 4 worker, which completed repeated cycles. The DB audit confirmed the preservation checks above; no events or cursors were reset.

Future worker rollouts must separate revision selection from scale-up:

1. Set desired count to 0; wait for all existing writer tasks to stop.
2. Update the task definition while desired count remains 0.
3. Wait until only the new deployment remains, `COMPLETED`, with desired/running/pending all 0.
4. In a separate operation, set desired count to 1; verify one new worker and repeated successful cycles.

## Live verification

Final recorded metrics: `status=synced`, ingestion/projection checkpoint `11926271`, `projectionStatus=applied`, `lagBlocks=0`, database `ok`. Verified block/estimate time was `2026-10-16T08:41:36Z`; projection application time was `2026-10-16T08:42:04.617Z`. These are observed timestamps, not an end-to-end latency measurement.

HTTP checks succeeded for `/health`, `/metrics`, `/streams`, `/streams/2`, `/listings`, `/market/stats`, `/users/:address/streams` and `/users/:address/trades`. Projection routes returned an applied checkpoint and verified estimate basis. Stream 2 retained deposit `5000000` and withdrawn `1933333`, with computed remaining/claimable `3066667` in token base units.

Checks performed: Docker build; ECS/RDS/ECR describe commands; one-off migration and read-only audit tasks with exit-code checks; CloudWatch worker-log inspection; HTTP requests using `Invoke-RestMethod`. The complete local failure-injection suite was not rerun as part of this deployment.

## Remaining work and limits

- Update frontend `NEXT_PUBLIC_VESTORA_API_URL` to the new URL, then restart development or rebuild/redeploy the frontend. This deployment did not change frontend configuration or hosting.
- A new user-signed frontend transaction test remains outstanding; no wallet signing or contract deployment occurred.
- The public task IP is ephemeral. Stable HTTPS, reorg recovery and other deferred work remain in the [Phase 9.6 runbook](../roadmap/phases/phase-09-6-recovery-consistency.md).
- The retained backup needs a later retention decision; it was not deleted automatically.
- This is service health and correctness smoke evidence, not sustained availability, reorg safety or production-scale performance evidence.

See [implementation verification](phase-09-6-verification.md) for local test evidence and [Phase 9.5 history](aws-indexer-operations-and-bottleneck.md) for earlier measurements.
