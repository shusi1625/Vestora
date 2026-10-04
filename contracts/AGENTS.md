# Contracts Guide

## Scope

This directory owns the on-chain settlement layer:

- `MockUSDC`
- `ReceivableStream`
- `ReceivableMarketplace`
- deployment scripts
- Hardhat tests

## Core Invariants

- A receivable stream is fully funded on creation.
- The stream ID and ERC-721 token ID represent the same receivable object.
- Claim rights follow the current NFT owner.
- Marketplace listings are non-custodial.
- `buy` must re-check seller ownership and NFT approval before settlement.
- Cancellation, claiming, and buying must preserve the contract as the final source of truth.

## Editing Guidance

Prefer small contract changes with focused tests. When changing settlement behavior, update or add tests for ownership, approvals, claimability, cancellation, and edge timestamps.

Do not optimize gas by weakening readability, safety, or test coverage. Record gas optimization decisions in documentation when they affect report evidence.

## Useful Commands

From the repository root:

- `pnpm contracts:compile`
- `pnpm contracts:test`

From this directory:

- `pnpm compile`
- `pnpm test`

## Documentation Links

For architecture-level decisions, use `docs/architecture/` once those files exist. For phase-level implementation context, use the relevant file under `docs/roadmap/phases/`.
