# Performance Measurement Plan

## Purpose

Collect evidence that backend projections improve dashboard and marketplace usability compared with repeated direct RPC reads.

## Measurements

- RPC-only listing load time
- backend API listing load time
- stream detail load time
- API p50/p95/p99 latency
- indexer lag
- transaction confirmed to UI reflected time
- indexer backfill blocks per second
- `eth_getLogs` calls per indexed range
- projection rebuild or update duration
- metrics endpoint latency before and after cache

## Recording Format

| Date | Scenario | Environment | Sample Size | Result | Notes |
| --- | --- | --- | --- | --- | --- |

## Reproducible Command

Prerequisites:

```powershell
pnpm --dir backend compose:up
pnpm --dir backend db:migrate
pnpm --dir backend indexer:once
pnpm --dir backend projections:rebuild
```

Then run:

```powershell
pnpm --dir backend performance:measure
```

or from the repository root:

```powershell
yarn backend:performance:measure
```

The command measures:

- local backend API response time through Fastify injection
- direct Sepolia RPC event-log reads for the indexed Vestora contracts

Set `PERFORMANCE_SAMPLE_SIZE` to change the number of samples per scenario. The default is `20`.

## Interpretation Rule

The direct RPC scenarios are event-log query measurements from the active indexer start block to the latest safe block. They are not a full frontend render benchmark. Use them as evidence for the cost of repeated raw chain reads compared with reading the backend projection API.

## Evidence Rule

Do not include claims in the final report unless they are backed by a measurement, screenshot, log, or reproducible command.

## Related Operations Record

- `docs/report/aws-indexer-operations-and-bottleneck.md`
