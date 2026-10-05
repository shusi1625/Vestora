# Vestora AWS Deployment Runbook

This runbook prepares a service-like AWS deployment for report evidence. It does not authorize creating real cloud resources by itself.

## Boundary

- Smart contracts remain the settlement authority.
- AWS hosts the indexing, analytics, and projection layer only.
- Do not store wallet private keys, seed phrases, or deployment keystore material in AWS services for this backend.
- Store `DATABASE_URL` and `SEPOLIA_RPC_URL` in AWS Secrets Manager or SSM Parameter Store.

## Target Topology

- API: App Runner or ECS Fargate running the backend container default command.
- Indexer worker: ECS Fargate service or scheduled task running `node dist/src/indexer/worker.js`.
- Database: RDS PostgreSQL.
- Logs and metrics: CloudWatch container logs plus `GET /metrics` snapshots.
- Container registry: ECR.

## Container Commands

Build locally:

```powershell
cd C:\GitHub\Vestora\backend
docker build -t vestora-backend:local .
```

Run API locally against an existing PostgreSQL and Sepolia RPC:

```powershell
docker run --rm --env-file .env.production.example -p 3001:3001 vestora-backend:local
```

Run indexer worker from the same image:

```powershell
docker run --rm --env-file .env.production.example vestora-backend:local node dist/src/indexer/worker.js
```

Run migrations from the same image before starting long-running services:

```powershell
docker run --rm --env-file .env.production.example vestora-backend:local pnpm db:deploy
```

## AWS Setup Checklist

1. Create or select an AWS region and cost budget.
2. Create RDS PostgreSQL with private networking where possible.
3. Store `DATABASE_URL` and `SEPOLIA_RPC_URL` in Secrets Manager or SSM Parameter Store.
4. Create an ECR repository for the backend image.
5. Build and push the backend image to ECR.
6. Run `pnpm db:deploy` through a one-off task or migration job.
7. Deploy the API container.
8. Deploy the indexer worker container with command override:

```text
node dist/src/indexer/worker.js
```

9. Confirm CloudWatch logs for both API and worker.
10. Confirm API health and metrics endpoints.

## Verification Checklist

API:

```powershell
Invoke-RestMethod https://YOUR_API_HOST/health
Invoke-RestMethod https://YOUR_API_HOST/metrics
Invoke-RestMethod https://YOUR_API_HOST/streams
Invoke-RestMethod https://YOUR_API_HOST/listings
```

Expected evidence:

- `/health.status` is `ok`.
- `/metrics.indexer.syncId` is `sepolia-v4`.
- `/metrics.indexer.lagBlocks` is low or recovering.
- `/metrics.api.latencyMs` includes p50, p95, and p99.
- `/metrics.database.status` is `ok`.
- CloudWatch shows API request logs and indexer cycle logs.

Indexer:

- The worker logs `indexer cycle completed`.
- `latestIndexedBlock` advances over time.
- Duplicate event inserts do not create duplicated projection rows.

Database:

- RDS has rows in `stream_events`, `streams`, `listings`, and `trades` after indexing.
- `sync_state` has a row for `sepolia-v4`.

## Report Evidence To Capture

- Architecture diagram or table showing API, indexer, RDS, CloudWatch, and Sepolia.
- CloudWatch screenshot for API requests.
- CloudWatch screenshot for indexer cycles.
- `/metrics` JSON excerpt with timestamp.
- RDS table row count screenshot or exported query result.
- Short limitation note: this is a service-like graduation-project deployment, not a claim of enterprise production readiness.

## Rollback

1. Stop or scale down the indexer worker.
2. Roll API service back to the previous ECR image tag.
3. Do not delete RDS data until projection correctness has been checked.
4. If a bad indexer range was processed, fix code or env, then rebuild projections from `stream_events`.

## Cost Controls

- Prefer small RDS instance classes for the demo period.
- Stop nonessential services after collecting report evidence.
- Use CloudWatch retention settings rather than indefinite log storage.
- Avoid NAT Gateway unless the final network design truly requires it.
