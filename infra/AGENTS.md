# Infra Guide

## Scope

This directory owns deployment and operations planning for the service-like architecture:

- AWS App Runner or ECS Fargate for the API
- ECS Fargate or equivalent worker runtime for the indexer
- Amazon RDS PostgreSQL
- CloudWatch logs and metrics
- AWS Secrets Manager or SSM Parameter Store

## Boundaries

Do not create or modify real cloud resources without explicit user approval.

Infrastructure work should support reportable operational evidence: API latency, error rates, indexer lag, DB behavior, logs, and deployment screenshots or tables.

## Safety

- Never commit real AWS credentials, RPC keys, database passwords, or secret ARNs that expose private infrastructure.
- Prefer least-privilege IAM notes in docs.
- Treat cost as a design constraint.
- Keep local development possible before requiring AWS.

## Verification

For documentation-only infra work, verify consistency with `docs/architecture/metrics-plan.md` and Phase 9 docs.

For future infrastructure code, prefer dry-runs, validation commands, and documented manual checks before deployment.
