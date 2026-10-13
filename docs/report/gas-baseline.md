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

For production optimizer comparison, force-compile the production profile first and then run the production gas script:

```powershell
yarn hardhat compile --force --build-profile production
yarn contracts:gas:production
```

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

## Applied Optimizations

The Phase 8 optimization pass applied only changes that preserve the existing settlement model:

- replaced revert strings with custom errors
- reduced repeated storage reads during `claim` and `cancel`
- packed stream timestamp and cancellation fields with `uint64`
- used an unchecked stream ID increment after assigning the current ID
- short-circuited marketplace NFT approval checks during `list`
- split the unprotected `buy` fast path from `buyWithProtection` so regular purchases do not run protected snapshot calculations

The following candidates were intentionally not applied:

- removing `SafeERC20`, `ReentrancyGuard`, or `_safeMint`
- removing seller ownership rechecks from marketplace purchase settlement
- shrinking ERC-20 amount fields without a formal maximum receivable policy
- removing event fields that feed the indexer and report evidence

## Before And After

Measured after `yarn hardhat compile --force`, followed by `yarn contracts:gas`.

| Function | Baseline Gas | Optimized Gas | Delta | Change |
| --- | ---: | ---: | ---: | ---: |
| `createStreamWithDuration` | 231171 | 207326 | -23845 | -10.31% |
| `claim` | 102321 | 95599 | -6722 | -6.57% |
| `cancel` | 106273 | 79737 | -26536 | -24.97% |
| `list` | 83091 | 78942 | -4149 | -4.99% |
| `cancelListing` | 26980 | 26980 | 0 | 0.00% |
| `buy` | 121167 | 103128 | -18039 | -14.89% |
| `buyWithProtection` | 122419 | 119621 | -2798 | -2.29% |

## Production Optimizer Comparison

Measured after `yarn hardhat compile --force --build-profile production`, followed by `yarn contracts:gas:production`.

| Function | Optimized Default Gas | Optimized Production Gas | Delta | Change |
| --- | ---: | ---: | ---: | ---: |
| `createStreamWithDuration` | 207326 | 203875 | -3451 | -1.66% |
| `claim` | 95599 | 93130 | -2469 | -2.58% |
| `cancel` | 79737 | 76889 | -2848 | -3.57% |
| `list` | 78942 | 76994 | -1948 | -2.47% |
| `cancelListing` | 26980 | 26751 | -229 | -0.85% |
| `buy` | 103128 | 100636 | -2492 | -2.42% |
| `buyWithProtection` | 119621 | 114264 | -5357 | -4.48% |

## Optimization Rule

Do not accept optimizations that weaken security, settlement clarity, or test coverage for a minor gas improvement.
