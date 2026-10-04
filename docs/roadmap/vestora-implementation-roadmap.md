# Vestora Implementation Roadmap

Last updated from Obsidian planning source: 2026-10-03

## Final Target

Vestora is not only an ERC-20 streaming dApp. The target is a service-like dApp architecture that represents ERC-20 future receivables as ERC-721 NFTs and supports them as tradable financial objects.

The final system should include:

- MockUSDC ERC-20 token
- ReceivableStream contract
- ReceivableMarketplace contract
- Next.js dApp frontend
- Node.js/TypeScript backend API
- viem event indexer
- PostgreSQL off-chain projection DB
- AWS deployment and operational metrics
- Sepolia or L2 testnet deployment
- final report with performance and operations evidence

## Differentiation Criteria

### Future Receivable As A Financial NFT

The project should explain each NFT as a time-varying receivable, not merely an ERC-20 stream wrapper.

Important values:

- deposited amount
- withdrawn amount
- vested amount
- claimable amount
- remaining receivable
- time to maturity
- listing price
- discount rate
- expected yield
- cancelable/canceled risk

### Gas-Aware Service Architecture

Core settlement state belongs on-chain. Lists, history, risk labels, statistics, and rendering data belong in the backend and projection DB.

Operating principle:

- on-chain is the settlement layer
- backend is the indexing/analytics layer
- frontend is the valuation dashboard
- smart contracts are the final authority

### Performance-Centered UI/UX

Before buying a receivable NFT, the user should quickly understand:

- how much remains receivable
- how much has already been claimed
- whether the current price appears cheap
- whether cancel risk exists
- whether value is claimable immediately
- how owner and balance change after a trade

## Competitive Framing

The project should not be framed as a Sablier Lockup clone. Vestora's differentiator is the combination of future receivable trading, risk disclosure, buyer protection, gas-aware architecture, and service-like operational evidence.

## Completed Scope

- Hardhat contract project
- MockUSDC
- ReceivableStream
- ReceivableMarketplace
- Sepolia deployment and smoke testing
- Next.js frontend MVP

## Remaining Phases

1. Phase 1: planning and architecture finalization
2. Phase 2: backend local foundation
3. Phase 3: event indexer
4. Phase 4: PostgreSQL projection design
5. Phase 4.5: ownership consistency
6. Phase 5: backend API
7. Phase 6: frontend/backend integration
8. Phase 7: marketplace buyer protection
9. Phase 8: gas and code-level optimization
10. Phase 9: AWS deployment and operational metrics
11. Phase 10: performance measurement and final report

## Current Decisions

- Contract settlement authority stays on-chain.
- Backend is indexing/analytics, not settlement.
- Frontend owns dashboard and transaction UI.
- Sepolia remains the public testnet validation target.
- L2 deployment can be discussed as a future expansion path.
- Backend stack is Node.js, TypeScript, Fastify, Prisma, PostgreSQL.
- Local DB starts with Docker Compose PostgreSQL.
- Cloud DB candidate is Amazon RDS PostgreSQL.
- API/indexer deployment candidates are AWS App Runner or ECS Fargate.
- Metrics are collected through CloudWatch.
- The Graph remains a long-term comparison or migration candidate.
- External ERC-721 transfers are officially supported. The current `ownerOf(streamId)` is the current receivable owner, and backend projections must track or reconcile against that source of truth.
