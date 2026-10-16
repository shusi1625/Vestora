# Prompt Playbook

Replace placeholders with one bounded task. Applicable AGENTS.md supplies shared safety and working-mode rules.

## Learning

```text
Guide me through <goal>; I will edit files and run commands.
Scope: <files or behavior>. Success: <observable result>.
Explain one small task with its purpose, code/command and success criterion.
```

## Implementation

```text
Implement <goal> in <files or behavior>.
Success: <observable result>. Relevant phase, if any: <path>.
Announce the changes, implement and verify affected behavior.
Report results and remaining risks.
```

## Review

```text
Review <diff or report> against <goal> without editing.
Prioritize correctness, missing tests, security, stale data and unsupported claims.
Give actionable findings with evidence; distinguish verified facts from inference.
```

## Verification

```text
Verify <behavior> within <local environment or approved target>.
Use relevant source/tests and current package scripts to choose checks.
Report what passed, failed or remains unverified.
```
