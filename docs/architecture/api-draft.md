# API Draft

## Health And Metrics

- `GET /health`
- `GET /metrics`

## Streams

- `GET /streams`
- `GET /streams/:streamId`
- `GET /users/:address/streams`

## Marketplace

- `GET /listings`
- `GET /market/stats`

## User History

- `GET /users/:address/trades`

## Response Values

Responses may include:

- deposited amount
- withdrawn amount
- vested amount
- claimable estimate
- remaining receivable
- listing price
- discount rate
- expected yield
- cancelable/canceled status
- risk label
- listing freshness

## Error Shape

Use one consistent error shape:

```json
{
  "error": {
    "code": "STRING_CODE",
    "message": "Human-readable message"
  }
}
```

## Authority Note

API values are projections and estimates unless they are explicitly described as direct on-chain reads.

Ownership fields use indexed ERC-721 `Transfer` events:

```json
{
  "ownership": {
    "projectedOwner": "0x...",
    "source": "indexed_transfer_events",
    "sourceOfTruth": "receivableStream.ownerOf(streamId)",
    "requiresOnchainRecheckForTransactions": true
  }
}
```

Transaction-critical frontend actions such as claim, list, buy, or cancel must recheck contract state before submitting a transaction.

## Smoke Verification

Use:

```powershell
pnpm --dir backend api:smoke
```

The smoke script checks:

- stream list
- stream detail
- listing list
- market stats
- user stream/trade routes
- common error shape
