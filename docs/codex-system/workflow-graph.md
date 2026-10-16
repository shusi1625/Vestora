# Codex Workflow Graph

Optional overview; working-mode and approval rules live in the root [AGENTS.md](../../AGENTS.md).

```text
bounded user goal
-> applicable instructions + affected source/tests
-> matching phase only when relevant
-> guide by default, implement when explicitly requested
-> verify affected behavior
-> report evidence and remaining work
```

One agent is the default. Delegation is optional for independent work; see [subagent policy](subagent-policy.md) only when needed.
Ask about unresolved decisions that change scope or behavior. Follow existing approval boundaries before external or destructive actions.
For resuming work, use the [handoff](handoff.md) and verify current Git state.
