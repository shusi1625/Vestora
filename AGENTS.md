# Hardhat + viem project

## Project layout

```
contracts/        Solidity source files (*.sol) and unit tests (*.t.sol)
test/             TypeScript integration tests and Solidity unit tests (*.sol)
ignition/         Hardhat Ignition deployment modules
scripts/          Standalone scripts run with `hardhat run`
hardhat.config.ts
```

## Working in this project

When writing or modifying tests, configuring `hardhat.config.ts`, or interacting with the network from TypeScript, invoke the **`hardhat`** skill. It covers Solidity and TypeScript testing, how to choose between them, `forge-std` cheatcodes, the `network.create()` API, `networkHelpers`, and the compile-then-typecheck workflow. The skill itself points to the matching `hardhat-toolbox-*` skill for toolbox-specific guidance (clients, contract interaction, assertions).

## Docs

- Hardhat 3 — https://hardhat.org/llms.txt
- viem — https://viem.sh/llms.txt

<!-- BEGIN:vestora-codex-workflow -->

## Vestora Codex Workflow

Vestora is a graduation-project dApp for tokenizing ERC-20 future receivables as ERC-721 NFTs and treating them as tradable financial objects.

Keep these boundaries clear:

- contracts are the settlement layer
- backend API and indexer are indexing/analytics layers
- PostgreSQL is the off-chain projection store
- frontend is the valuation and transaction dashboard
- AWS is for service-like operational evidence, not an overclaim of production maturity

For Codex workflow routing, start with:

- `docs/codex-system/README.md`
- `docs/codex-system/operating-manual.md`
- `docs/codex-system/task-routing.md`
- `docs/codex-system/phase-workflows.md`

For phase work, use `docs/roadmap/phases/` and load only the relevant phase file. Use Obsidian notes only when repository docs are insufficient, then copy durable decisions back into repository docs.

Do not add app-facing AI/ML features unless explicitly requested. The `.codex/agents` setup is for personal development workflow, role-based review, context reduction, and verification.

<!-- END:vestora-codex-workflow -->
