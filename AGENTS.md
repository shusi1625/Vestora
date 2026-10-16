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

## Vestora Working Rules

- Source repository: C:/GitHub/Vestora. Contracts settle; backend/indexer/PostgreSQL project data; frontend rechecks chain state before transactions.
- Respond in Korean. Default to learning-led guidance; edit/run implementation only when explicitly requested. Announce edits, then report verification and remaining risk.
- Read applicable area instructions and relevant code/tests. For phase work, add only the matching phase under docs/roadmap/phases/. Workflow docs are optional references, not a startup checklist.
- Default to one agent. Delegate only a bounded independent task with a concrete benefit; no automatic planner/reviewer/verifier chain.
- Preserve user changes. Never commit secrets, .env or keystores. Ask before cloud mutations, production migrations, wallet signing or destructive operations. Commit/push only when requested; never include Obsidian without explicit authorization.
- Verify touched behavior: contract tests; backend typecheck/build and isolated DB tests; frontend typecheck/build and relevant interaction checks. Docs-only: links, consistency, diff. Report skipped checks and distinguish local evidence from AWS evidence.
- Do not add app-facing AI features unless requested. Read docs/codex-system/README.md only for workflow questions.
