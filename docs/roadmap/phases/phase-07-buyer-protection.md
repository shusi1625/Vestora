# Phase 7: Marketplace Buyer Protection

## Goal

Help buyers judge receivable value and risk before buying.

## Candidate Features

- listing-time snapshot
- remaining receivable
- claimable amount
- discount rate
- expected yield
- cancelable risk label
- canceled-stream trade restriction or warning
- buy preflight owner, approval, and latest value recheck

## Completion Criteria

- buyer can see remaining value and risk before buying
- UI reflects value changes after claim/cancel
- buy flow rechecks latest on-chain state

## Codex Routing

Use `frontend_reviewer` for UI clarity and `contract_reviewer` for settlement and marketplace invariants.
