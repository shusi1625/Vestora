# Phase 9: AWS Deployment And Operational Metrics

## Goal

Deploy the API and indexer in a way that collects service-like operational evidence.

## Candidate AWS Setup

- API server: AWS App Runner or ECS Fargate
- indexer worker: ECS Fargate
- database: Amazon RDS PostgreSQL
- logs/metrics: CloudWatch
- secrets: AWS Secrets Manager or SSM Parameter Store

## Metrics

Indexer:

- latest chain block
- latest indexed block
- indexer lag
- processed logs per minute
- duplicate logs skipped count
- RPC error rate

API:

- request count
- p50/p95/p99 latency
- 4xx/5xx rate
- endpoint response time

DB:

- connection count
- query latency
- slow queries
- table row count
- index hit ratio

## Completion Criteria

- backend API runs on AWS
- indexer worker runs on AWS
- RDS stores projection data
- CloudWatch shows API and indexer logs
- operational metrics can be used in the report

## Codex Routing

Use `ops_reviewer`. Do not create cloud resources without explicit user approval.
