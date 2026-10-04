# Context Budget

## Purpose

This document keeps Codex work focused by defining what should be loaded into context for different task sizes.

## Hot Context

Read for most tasks:

- nearest applicable `AGENTS.md`
- files directly edited or inspected
- direct tests for the edited code
- the smallest relevant phase or architecture doc

## Warm Context

Read only when the task needs it:

- roadmap phase documents
- API or DB schema drafts
- deployment notes
- metrics/reporting docs
- previous implementation notes

## Cold Context

Avoid by default:

- full generated artifacts
- full dependency directories
- broad build outputs
- every roadmap phase at once
- unrelated frontend/backend/contracts files

## Practical Rules

- Use `rg` before opening many files.
- For small bug fixes, read code paths and tests, not every architecture document.
- For architecture tasks, read docs first, then inspect source only where claims need verification.
- For cross-layer tasks, load one layer at a time and summarize the boundary before moving to the next layer.
- Keep `AGENTS.md` files short. Put long explanations in `docs/` and reference them only when needed.

## Token Saving Goal

The goal is not to minimize context blindly. The goal is to avoid repeated irrelevant context while preserving enough evidence to make correct changes.

Good context is:

- local to the task
- current
- source-backed
- small enough to keep reasoning clear

Bad context is:

- loaded only because it exists
- stale or generated
- too broad for the request
- duplicated across multiple instruction files
