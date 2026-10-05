# Metrics Plan

## Indexer Metrics

- latest chain block
- latest indexed block
- indexer lag
- indexed event count by active deployment
- processed events per minute over the recent local observation window
- duplicate log skipped count
- RPC error rate
- backfill duration

## API Metrics

- request count
- p50 latency
- p95 latency
- p99 latency
- 4xx rate
- 5xx rate
- endpoint response time

## DB Metrics

- connection count
- health-check query latency
- slow query count
- table row count
- index hit ratio

## Implemented Local Metrics Endpoint

`GET /metrics` currently exposes a local evidence baseline:

- `indexer`: sync id, start block, latest chain block, safe latest block, latest indexed block, block lag, active contract addresses, total indexed events, recent processed-events-per-minute estimate, event counts by name, and latest indexed event
- `api`: in-memory request sample count, recent requests per minute, status-code buckets, error rate, p50/p95/p99 latency, and per-endpoint average latency since the API process started
- `database`: PostgreSQL health-check latency and row counts for sync, event, projection, listing, claim, trade, and reconciliation tables

Known limitations:

- API latency metrics are in-memory and reset when the process restarts.
- Duplicate log skipped count, RPC error rate, slow query count, and index hit ratio still require persistent run metrics or infrastructure-level metrics.
- AWS metrics should be reported separately from local metrics once the API, worker, and RDS are deployed.

## Frontend/Product Metrics

- listing render time
- stream detail render time
- transaction confirmed to UI updated time
- RPC-only vs backend API listing load comparison

## Report Evidence

Use tables and screenshots where possible. Every performance claim should list:

- measurement date
- environment
- command or scenario
- sample size when available
- result
- limitation
