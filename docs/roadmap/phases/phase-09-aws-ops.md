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

## Current Local Preparation

Implemented before real AWS resource creation:

- backend container image definition: `backend/Dockerfile`
- secret-safe container ignore rules: `backend/.dockerignore`
- production environment template: `backend/.env.production.example`
- deployment and verification runbook: `infra/aws-deployment-runbook.md`
- local `/metrics` endpoint with indexer, API, and DB observability fields
- API and indexer share the same image; the indexer uses command override `node dist/src/indexer/worker.js`

Still requires explicit approval before execution:

- ECR repository creation
- RDS PostgreSQL creation
- App Runner or ECS service creation
- CloudWatch evidence capture
- any real AWS cost-incurring command

## Codex Routing

Use `ops_reviewer`. Do not create cloud resources without explicit user approval.
