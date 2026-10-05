# Claim Evidence Register

## Purpose

Use this register to prevent the final report from sounding stronger than the evidence supports.

## Claim Table

| Claim | Evidence Needed | Current Evidence | Status |
| --- | --- | --- | --- |
| Vestora treats streams as future receivable NFTs | contract behavior, UI values, architecture docs | roadmap and contract docs | draft |
| Backend is indexing/analytics, not settlement | API/indexer implementation, architecture docs | architecture docs | draft |
| Claim rights follow ERC-721 ownership, including external transfers | ownerOf-based claim test, Transfer indexing, projection rebuild, reconciliation evidence | `docs/report/ownership-consistency-implementation.md` | implemented |
| Backend API improves listing load speed | RPC vs API measurement | missing | not measured |
| Indexer is restart-safe and idempotent | sync_state and txHash+logIndex tests | missing | not implemented |
| Buyer can judge value/risk before buy | UI feature and screenshot | missing | not implemented |
| Gas optimization is evidence-backed | gas baseline and before/after table | template exists | not measured |
| AWS provides operational evidence | deployed API/indexer, CloudWatch/RDS metrics | local metrics endpoint, backend Dockerfile, production env template, AWS runbook | draft |

## Status Values

- `draft`: document-level claim exists, implementation/evidence incomplete
- `implemented`: feature exists but measurement may be missing
- `measured`: claim has quantitative evidence
- `verified`: claim has reproducible evidence and report-ready artifact

## Rule

Before final report writing, every major technical claim should be at least `implemented`, and every performance/operation claim should be `measured` or `verified`.
