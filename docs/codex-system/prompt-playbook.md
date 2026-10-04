# Prompt Playbook

## Purpose

Use these prompts to keep Codex work scoped and repeatable.

## Architecture Planning

```text
Use the Vestora Codex workflow. Work in implementation mode.
Focus on Phase N: <phase name>.
Read only the relevant AGENTS.md, phase file, and architecture file.
Before editing, summarize files to change, reason, and expected result.
```

## Backend Implementation

```text
Implement the next smallest task in Phase 2 backend foundation.
Use backend/AGENTS.md and docs/roadmap/phases/phase-02-backend-local.md.
Keep settlement authority on-chain.
After editing, run the narrowest meaningful backend verification available.
```

## Indexer Implementation

```text
Implement the next smallest task in Phase 3 event indexer.
Preserve idempotency with txHash + logIndex and sync_state resume behavior.
Use backend_architect for review if the data model is unclear.
```

## Review

```text
Review this branch against the current Vestora phase goal.
Use explorer to map touched areas, then use the relevant reviewer.
Prioritize correctness, missing tests, security, stale data, and evidence gaps.
```

## Verification

```text
Use verifier to choose the smallest checks for the files changed.
Report what each check proves and what remains unverified.
```

## Report Evidence

```text
Review this report section.
Separate verified facts, user statements, and inference.
Flag any claim that needs a measurement, screenshot, log, or command output.
```

## Obsidian Context Refresh

```text
Refresh Vestora planning context from the Obsidian folder only if repository docs are insufficient.
Use the implementation roadmap, planning decisions, and 2026-10-03 critique document.
Copy durable decisions into repository docs instead of depending on private notes every turn.
```
