# AWS Deployment Reason

## Purpose

AWS is introduced to show service-like operation, not to claim large-scale production maturity.

## Why AWS Helps This Project

- API and indexer can run continuously outside the developer machine.
- RDS PostgreSQL provides a managed projection database.
- CloudWatch provides logs and metrics that can be used as report evidence.
- Deployment architecture demonstrates maintainability and operations thinking.

## Candidate Services

- App Runner or ECS Fargate for the API
- ECS Fargate for the indexer worker
- RDS PostgreSQL for projection storage
- CloudWatch for logs and metrics
- Secrets Manager or SSM Parameter Store for secrets

## Report Framing

Frame AWS as operational evidence for a service-like dApp architecture: latency, error rate, indexer lag, DB metrics, and logs.

Do not overstate it as enterprise production infrastructure.
