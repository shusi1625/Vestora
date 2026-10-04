# Codex Operating Manual

## Purpose

This is the practical operating manual for using Codex as a personal development system on Vestora.

## Default Start

1. Classify the request.
2. Read the nearest `AGENTS.md`.
3. Use `docs/codex-system/task-routing.md`.
4. Read only the relevant phase or architecture file.
5. Decide whether subagents are worth the coordination cost.

## Learning-Led Mode

When the user wants to learn or asks for guidance only:

- do not edit files
- explain purpose, files, commands, success criteria, and common errors
- keep tasks small

## Implementation Mode

When the user explicitly asks Codex to implement:

- state files to change, why, and expected result
- make focused edits
- run targeted verification
- summarize changes and remaining risk

## Long-Running Phase Work

For phase-level work:

1. Read the matching phase file under `docs/roadmap/phases/`.
2. Read architecture docs only if the phase references them.
3. Use `planner` if the task needs decomposition.
4. Use role reviewers only for independent review.
5. Use `verifier` after implementation.

## Obsidian Source Notes

The Obsidian folder `C:\Obsidian\snakes0625\26 여름방학\26 졸업프로젝트` contains planning history and deeper rationale. Use it when the repository docs are insufficient or when report framing needs original context.

Most relevant source documents:

- `스트리밍_수취권_dApp_구현_단계별_목표.md`
- `스트리밍_수취권_dApp_기획_결정사항.md`
- `2026-10-03 Vestora 기획 재정의 및 비판 분석.md`

Prefer copying durable decisions into repository docs instead of making every task reread the Obsidian folder.

## Anti-Patterns

- loading every document before a small edit
- creating subagents for one-file changes
- letting several agents edit the same files
- treating backend projections as settlement truth
- making report claims before measurement evidence exists
