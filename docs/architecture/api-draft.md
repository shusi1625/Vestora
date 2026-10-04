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

Use one consistent error shape once the backend exists:

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
