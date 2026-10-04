# Gas Baseline

## Purpose

Track gas cost before and after safe contract optimizations.

## Target Functions

- `createStreamWithDuration`
- `claim`
- `cancel`
- `list`
- `cancelListing`
- `buy`

## Recording Format

| Date | Function | Scenario | Gas Used | Commit/Notes |
| --- | --- | --- | --- | --- |

## Optimization Rule

Do not accept optimizations that weaken security, settlement clarity, or test coverage for a minor gas improvement.
