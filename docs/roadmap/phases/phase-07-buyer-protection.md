# Phase 7: Marketplace Buyer Protection

## Goal

Help buyers judge receivable value and risk before buying.

Vestora does not set an official discount rate. Listing price is formed by the
seller and buyer in a free marketplace. The product's responsibility is to show
what that price implies:

- remaining receivable
- claimable amount
- discount against remaining receivable
- implied yield at the current listing price
- listing freshness
- buyer risk labels
- latest on-chain preflight result before purchase

This keeps Vestora as the valuation and transaction dashboard while preserving
the contracts as the settlement authority.

## Candidate Features

- listing-time snapshot
- remaining receivable
- claimable amount
- discount rate
- expected yield
- cancelable risk label
- canceled-stream trade restriction or warning
- buy preflight owner, approval, and latest value recheck

## Economic Policy

- Marketplace prices are user-driven.
- The protocol does not publish a canonical fair price.
- Backend values are projections for discovery, dashboards, and valuation.
- The frontend labels backend values as estimates and shows their indexed-block
  basis.
- Buy actions must recheck current on-chain listing, owner, stream, claimable,
  and remaining receivable values before spending payment tokens.
- If the latest price is above remaining receivable, or the seller no longer
  owns the NFT, the buy flow should stop before asking for settlement.

## Implementation Scope

Completed in Phase 7A:

- backend listing valuation fields:
  - remaining receivable
  - claimable estimate
  - discount amount
  - discount bps
  - expected yield bps
  - price-to-remaining bps
  - risk labels
  - valuation basis
- frontend marketplace cards show remaining value, implied yield, and risk
  labels
- frontend marketplace action panel shows selected listing valuation and
  preflight status
- buy flow runs immediate on-chain preflight before payment approval and again
  before purchase

Completed in Phase 7B:

- contract-level protected purchase function `buyWithProtection`
- settlement-time min remaining value / max withdrawn / expected seller checks
- contract tests for seller claim or cancellation between approval and buy
- frontend buy flow now passes final preflight constraints into
  `buyWithProtection`

Deferred after Phase 7:

- Sepolia redeployment of the updated marketplace contract
- production-style route from frontend contract addresses to new deployment
- broader gas comparison between `buy` and `buyWithProtection`

## Completion Criteria

- buyer can see remaining value and risk before buying
- UI reflects value changes after claim/cancel
- buy flow rechecks latest on-chain state
- backend projections explain that pricing is market-driven and estimates are
  not settlement authority
- protected buy settlement reverts if seller, price, withdrawn amount, or
  remaining receivable no longer matches buyer constraints

## Codex Routing

Use `frontend_reviewer` for UI clarity and `contract_reviewer` for settlement and marketplace invariants.
