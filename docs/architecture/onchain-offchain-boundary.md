# On-Chain And Off-Chain Boundary

## Principle

The smart contracts are the settlement layer. The backend and database are read-model and analytics infrastructure.

## On-Chain Responsibilities

- stream creation and funding
- vested and claimable settlement logic
- claim execution
- cancellation and refund behavior
- NFT ownership and transfer
- marketplace list/cancel/buy settlement
- ownership and approval verification

## Off-Chain Responsibilities

- event indexing
- projection tables for fast reads
- marketplace list and dashboard query optimization
- historical claim/trade views
- valuation display helpers
- risk labels and freshness indicators
- operational metrics

## Frontend Responsibility

The frontend presents projected data quickly, but rechecks on-chain state before important transactions.

## Rule

If a backend projection and on-chain read disagree, transaction-critical UI must treat the on-chain value as authoritative.
