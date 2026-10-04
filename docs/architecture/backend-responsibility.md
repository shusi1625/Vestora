# Backend Responsibility

## Role

The backend is an indexing and analytics layer for Vestora. It does not settle payments, transfer NFTs, or decide final ownership.

## Responsibilities

- expose health and metrics endpoints
- index contract events into PostgreSQL
- maintain projection tables for streams, listings, claims, and trades
- calculate dashboard values such as remaining receivable, discount rate, expected yield, and risk label
- serve marketplace and user dashboard APIs
- log request timing and operational errors

## Non-Responsibilities

- holding user funds
- signing user transactions
- replacing smart contract authorization
- overriding contract settlement state
- silently hiding stale projection data

## Design Implication

The backend can make the product faster and easier to inspect, but it cannot be the final source of financial truth.
