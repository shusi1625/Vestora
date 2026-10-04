# Codex Workflow Graph

## Purpose

This document defines the personal Codex workflow for Vestora development. It is not an app feature. Its goal is to reduce wasted context, improve task quality, and make development work easier to split by role.

## Default Graph

```text
user request
-> classify task
-> load minimal context
-> choose workflow
-> implement or guide
-> verify
-> summarize
```

## Expanded Graph For Phase Work

```text
user request
-> classify task
-> identify phase
-> read nearest AGENTS.md
-> read phase workflow
-> optionally use planner/explorer
-> implement smallest coherent change
-> optionally use focused reviewer
-> use verifier
-> summarize evidence and next step
```

## Workflow Nodes

### classify task

Decide whether the task is documentation, contracts, backend, indexer, frontend, infra, reporting, or cross-cutting architecture.

### load minimal context

Read the nearest `AGENTS.md` and only the relevant source or docs. Avoid loading the full roadmap for a small task.

### choose workflow

Use direct implementation for narrow tasks. Use a phase workflow for backend, indexer, infra, or cross-layer work.

### explore affected area

Find entry points, commands, existing patterns, and risk points before editing. Use `explorer` when this mapping can be done independently.

### plan

Use `planner` for phase-level decomposition, not for small edits.

### implement

Make the smallest coherent change that satisfies the current task.

### review

Use a focused reviewer only when review context is independent from the implementation work.

### verify

Run or identify the narrowest meaningful checks for the touched area. Use `verifier` when verification choice is non-trivial.

### summarize

Report what changed, what was verified, what remains, and the next recommended step.

## Obsidian Refresh Path

If repository docs do not contain enough planning context, consult the Obsidian planning folder and copy durable decisions back into repository docs.

Primary Obsidian sources:

- `스트리밍_수취권_dApp_구현_단계별_목표.md`
- `스트리밍_수취권_dApp_기획_결정사항.md`
- `2026-10-03 Vestora 기획 재정의 및 비판 분석.md`

## When To Stop And Ask

Ask before proceeding when:

- the task changes project scope
- secrets, paid services, or cloud resources are required
- multiple valid architectures would create different long-term costs
- destructive actions or migrations could affect existing data
- the user has not approved implementation mode
