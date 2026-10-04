# Subagent Policy

## Purpose

This document defines when to use subagents for the personal Vestora development workflow. Subagents are for development task division, not for app-facing AI features.

## When To Use Subagents

Use subagents when work can be split into independent, bounded tasks:

- one agent maps relevant files while another reviews risk
- backend architecture and frontend integration can be inspected separately
- a verifier can check commands and completion criteria after implementation
- multiple docs or phases need independent review
- report claims need evidence review separate from implementation

## When Not To Use Subagents

Do not use subagents when:

- the task is small enough for one direct edit
- every step depends on the previous step
- multiple agents would edit the same files at the same time
- the coordination cost is larger than the likely benefit
- the user is in learning-led mode and wants step-by-step guidance

## Active Agent Files

The active custom agents are intentionally role-scoped:

- `.codex/agents/planner.toml`
- `.codex/agents/explorer.toml`
- `.codex/agents/backend-architect.toml`
- `.codex/agents/contract-reviewer.toml`
- `.codex/agents/frontend-reviewer.toml`
- `.codex/agents/ops-reviewer.toml`
- `.codex/agents/report-reviewer.toml`
- `.codex/agents/verifier.toml`

## Roles

### planner

Breaks phase-level goals into small implementation tasks. Does not edit.

### explorer

Read-only mapper. Finds relevant files, data flow, commands, and risks. Does not edit.

### contract_reviewer

Reviews Solidity settlement behavior, ownership, approvals, claim/cancel behavior, marketplace invariants, and missing tests.

### backend_architect

Reviews Fastify, Prisma, PostgreSQL, viem indexer, metrics, and API boundaries.

### frontend_reviewer

Reviews wallet state, transaction UX, backend projection usage, stale data handling, and on-chain verification boundaries.

### ops_reviewer

Reviews AWS deployment, secrets, metrics, logs, costs, and operational evidence.

### report_reviewer

Reviews report material for evidence, overclaims, missing metrics, and alignment with the final project narrative.

### verifier

Runs or recommends focused verification and checks phase completion criteria.

## Expansion Rule

Add more agents only when repeated tasks show a real need. If an agent is rarely useful, prefer updating `task-routing.md` or a phase document instead of creating another role.

## Parent Agent Rule

The main agent owns final decisions. Subagents provide evidence and recommendations. The main agent reconciles conflicts, chooses the change, and reports the final result to the user.
