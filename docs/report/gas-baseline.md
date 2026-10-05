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
- `buyWithProtection`

## Measurement Command

```powershell
yarn contracts:gas
```

The command runs a local Hardhat in-process network, deploys fresh contracts for each scenario, executes setup transactions, and records `gasUsed` only for the target function transaction.

## Recording Format

| Date | Function | Scenario | Gas Used | Commit/Notes |
| --- | --- | --- | --- | --- |
| 2026-10-06 | `createStreamWithDuration` | fully funded stream, recipient NFT mint, non-cancelable | 231171 | Pre-optimization baseline, local Hardhat network |
| 2026-10-06 | `claim` | recipient claims halfway through active stream | 102321 | Pre-optimization baseline, local Hardhat network |
| 2026-10-06 | `cancel` | sender cancels cancelable stream halfway through active stream | 106273 | Pre-optimization baseline, local Hardhat network |
| 2026-10-06 | `list` | recipient lists approved receivable NFT | 83091 | Pre-optimization baseline, local Hardhat network |
| 2026-10-06 | `cancelListing` | seller cancels active listing | 26980 | Pre-optimization baseline, local Hardhat network |
| 2026-10-06 | `buy` | buyer purchases active listing without protection parameters | 121167 | Pre-optimization baseline, local Hardhat network |
| 2026-10-06 | `buyWithProtection` | buyer purchases active listing with latest snapshot protection | 122419 | Pre-optimization baseline, local Hardhat network |

## Optimization Rule

Do not accept optimizations that weaken security, settlement clarity, or test coverage for a minor gas improvement.
