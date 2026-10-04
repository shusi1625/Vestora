# Phase 8: Gas And Code Optimization

## Goal

Measure gas baseline and apply safe improvements.

## Measurement Targets

- `createStreamWithDuration`
- `claim`
- `cancel`
- `list`
- `cancelListing`
- `buy`

## Improvement Candidates

- custom errors
- cached storage reads
- struct packing review
- event field review
- optimizer comparison
- removal of unnecessary state writes

## Completion Criteria

- gas baseline table exists
- before/after gas comparison exists
- optimizations do not weaken security or readability

## Codex Routing

Use `contract_reviewer` before and after optimization. Use `verifier` to define gas measurement commands.
