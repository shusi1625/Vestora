# Context Budget

Optional guidance, not a hard limit that overrides correctness.

- Default context: applicable AGENTS.md, affected source and direct tests.
- Phase work adds one phase document. Search headings before opening long history.
- Use rg with paths and bounded output. Read relevant sections, not entire logs, generated ABI or dependencies.
- Do not reread unchanged files or rerun successful checks without a changed dependency or concrete uncertainty.
- Report failures with the relevant excerpt; summarize successful checks.
- Use one agent normally. Give delegated work file paths, a bounded question and short evidence output, not full conversation history.
- Keep current handoff small: objective, completed evidence, remaining work, approvals and pointers.
- New chat at a phase boundary; do not automatically fork/copy the long conversation.
- Preserve security checks and risk-scaled testing. Fewer tokens is not evidence of correctness.

Measure file bytes/lines separately from model tokens. Neither a smaller document nor a goal counter proves billing savings; use comparable task usage including cache/subagent accounting when available.
