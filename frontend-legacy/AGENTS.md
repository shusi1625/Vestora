<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:vestora-frontend-codex-guide -->

## Vestora Frontend Guide

The frontend is a valuation and transaction dashboard. It should help users answer:

- how much remains receivable
- how much is claimable now
- how much has already been claimed
- whether a listing appears stale
- whether cancelable/canceled risk exists
- what should be rechecked on-chain before a transaction

Use backend API data for fast lists, dashboards, history, metrics, and projection views. Use on-chain reads for final authority, especially before buy, claim, cancel, or list transactions.

When backend data may be stale, show refresh or stale-state handling rather than pretending it is final settlement state.

Keep wallet, network, pending, success, and error states explicit. Do not expose secrets or private RPC credentials in client code.

<!-- END:vestora-frontend-codex-guide -->
