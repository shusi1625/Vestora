import type {
  ClaimProjection,
  ListingProjection,
  StreamProjection,
  TradeProjection,
} from "@prisma/client";

type StreamWithOptionalRelations = StreamProjection & {
  listing?: ListingProjection | null;
};

type SerializeOptions = {
  estimateAt?: Date;
};

function toIso(value: Date | null) {
  return value?.toISOString() ?? null;
}

function max(value: bigint, minimum: bigint) {
  return value < minimum ? minimum : value;
}

function sameAddress(left?: string | null, right?: string | null) {
  if (!left || !right) {
    return false;
  }

  return left.toLowerCase() === right.toLowerCase();
}

function vestedAmountAt(stream: StreamProjection, at: Date) {
  const amount = BigInt(stream.depositedAmount);
  const startTimeMs = stream.startTime.getTime();
  const endTimeMs = stream.endTime.getTime();
  const currentTimeMs = at.getTime();

  if (currentTimeMs <= startTimeMs) {
    return 0n;
  }

  if (currentTimeMs >= endTimeMs) {
    return amount;
  }

  const elapsedSeconds = BigInt(
    Math.floor((currentTimeMs - startTimeMs) / 1_000),
  );
  const durationSeconds = BigInt(
    Math.floor((endTimeMs - startTimeMs) / 1_000),
  );

  if (durationSeconds <= 0n) {
    return amount;
  }

  return (amount * elapsedSeconds) / durationSeconds;
}

function basisPoints(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) {
    return null;
  }

  return Number((numerator * 10_000n) / denominator);
}

export function streamComputedValues(
  stream: StreamProjection,
  estimateAt = new Date(),
) {
  const depositedAmount = BigInt(stream.depositedAmount);
  const withdrawnAmount = BigInt(stream.withdrawnAmount);
  const vestingTime = stream.canceledAt ?? estimateAt;
  const vestedAmount = vestedAmountAt(stream, vestingTime);
  const claimableAmount = max(vestedAmount - withdrawnAmount, 0n);
  const remainingAmount = stream.canceledAt
    ? claimableAmount
    : max(depositedAmount - withdrawnAmount, 0n);

  return {
    vestedAmount: vestedAmount.toString(),
    claimableEstimate: claimableAmount.toString(),
    remainingReceivable: remainingAmount.toString(),
    fullyClaimed: remainingAmount === 0n,
    estimateTimestamp: estimateAt.toISOString(),
  };
}

function listingRiskLabels(
  listing: ListingProjection,
  stream?: StreamProjection | null,
  estimateAt = new Date(),
) {
  const labels: string[] = [];

  if (listing.status !== "ACTIVE") {
    labels.push(`listing_${listing.status.toLowerCase()}`);
  }

  if (!stream) {
    return [...labels, "stream_not_indexed"];
  }

  const streamValues = streamComputedValues(stream, estimateAt);
  const remainingAmount = BigInt(streamValues.remainingReceivable);
  const price = BigInt(listing.price);
  const listedForSeconds = Math.max(
    Math.floor((estimateAt.getTime() - listing.listedAt.getTime()) / 1_000),
    0,
  );

  if (stream.canceledAt) {
    labels.push("canceled_stream");
  }

  if (stream.cancelable && !stream.canceledAt) {
    labels.push("cancelable_stream");
  }

  if (!stream.currentOwner) {
    labels.push("owner_unverified");
  } else if (!sameAddress(stream.currentOwner, listing.seller)) {
    labels.push("seller_not_current_owner");
  }

  if (streamValues.fullyClaimed || remainingAmount === 0n) {
    labels.push("fully_claimed");
  } else if (price > remainingAmount) {
    labels.push("price_above_remaining_value");
  }

  if (listedForSeconds >= 86_400) {
    labels.push("stale_listing");
  }

  return labels.length > 0 ? labels : ["standard"];
}

export function listingComputedValues(
  listing: ListingProjection,
  stream?: StreamProjection | null,
  estimateAt = new Date(),
) {
  const streamValues = stream ? streamComputedValues(stream, estimateAt) : null;
  const remainingAmount = streamValues
    ? BigInt(streamValues.remainingReceivable)
    : null;
  const price = BigInt(listing.price);
  const discountAmount =
    remainingAmount === null ? null : max(remainingAmount - price, 0n);
  const listedForSeconds = Math.max(
    Math.floor((estimateAt.getTime() - listing.listedAt.getTime()) / 1_000),
    0,
  );

  return {
    remainingReceivable:
      remainingAmount === null ? null : remainingAmount.toString(),
    claimableEstimate: streamValues?.claimableEstimate ?? null,
    discountAmount:
      discountAmount === null ? null : discountAmount.toString(),
    discountBps:
      remainingAmount === null || discountAmount === null
        ? null
        : basisPoints(discountAmount, remainingAmount),
    expectedYieldBps:
      discountAmount === null ? null : basisPoints(discountAmount, price),
    priceToRemainingBps:
      remainingAmount === null ? null : basisPoints(price, remainingAmount),
    listedForSeconds,
    freshness:
      listedForSeconds < 3_600
        ? "fresh"
        : listedForSeconds < 86_400
          ? "same_day"
          : "stale",
    riskLabels: listingRiskLabels(listing, stream, estimateAt),
    valuationBasis: "backend_projection_at_indexed_block",
  };
}

export function riskLabel(
  stream: StreamProjection,
  listing?: ListingProjection | null,
  estimateAt = new Date(),
) {
  if (listing?.status === "INVALIDATED") {
    return "ownership_changed";
  }

  if (stream.canceledAt) {
    return "canceled";
  }

  if (!stream.currentOwner) {
    return "owner_unverified";
  }

  if (streamComputedValues(stream, estimateAt).fullyClaimed) {
    return "fully_claimed";
  }

  return "standard";
}

export function serializeStream(
  stream: StreamWithOptionalRelations,
  options: SerializeOptions = {},
) {
  const computed = streamComputedValues(stream, options.estimateAt);

  return {
    streamId: stream.streamId.toString(),
    sender: stream.sender,
    recipient: stream.recipient,
    currentOwner: stream.currentOwner,
    ownership: {
      projectedOwner: stream.currentOwner,
      source: "indexed_transfer_events",
      sourceOfTruth: "receivableStream.ownerOf(streamId)",
      requiresOnchainRecheckForTransactions: true,
    },
    token: stream.token,
    depositedAmount: stream.depositedAmount,
    withdrawnAmount: stream.withdrawnAmount,
    startTime: stream.startTime.toISOString(),
    endTime: stream.endTime.toISOString(),
    cancelable: stream.cancelable,
    canceledAt: toIso(stream.canceledAt),
    createdTxHash: stream.createdTxHash,
    updatedAt: stream.updatedAt.toISOString(),
    computed,
    riskLabel: riskLabel(stream, stream.listing, options.estimateAt),
    listing: stream.listing
      ? serializeListing(stream.listing, stream, options)
      : null,
  };
}

export function serializeListing(
  listing: ListingProjection,
  stream?: StreamProjection | null,
  options: SerializeOptions = {},
) {
  return {
    streamId: listing.streamId.toString(),
    seller: listing.seller,
    price: listing.price,
    status: listing.status,
    listedAt: listing.listedAt.toISOString(),
    soldAt: toIso(listing.soldAt),
    canceledAt: toIso(listing.canceledAt),
    invalidatedAt: toIso(listing.invalidatedAt),
    buyer: listing.buyer,
    listingTxHash: listing.listingTxHash,
    boughtTxHash: listing.boughtTxHash,
    canceledTxHash: listing.canceledTxHash,
    invalidatedTxHash: listing.invalidatedTxHash,
    updatedAt: listing.updatedAt.toISOString(),
    computed: listingComputedValues(listing, stream, options.estimateAt),
    stream: stream ? serializeStreamSummary(stream, options) : null,
  };
}

export function serializeStreamSummary(
  stream: StreamProjection,
  options: SerializeOptions = {},
) {
  return {
    streamId: stream.streamId.toString(),
    sender: stream.sender,
    recipient: stream.recipient,
    currentOwner: stream.currentOwner,
    token: stream.token,
    depositedAmount: stream.depositedAmount,
    withdrawnAmount: stream.withdrawnAmount,
    remainingReceivable: streamComputedValues(stream, options.estimateAt)
      .remainingReceivable,
    startTime: stream.startTime.toISOString(),
    endTime: stream.endTime.toISOString(),
    cancelable: stream.cancelable,
    canceledAt: toIso(stream.canceledAt),
    riskLabel: riskLabel(stream, undefined, options.estimateAt),
  };
}

export function serializeTrade(trade: TradeProjection) {
  return {
    id: trade.id,
    streamId: trade.streamId.toString(),
    seller: trade.seller,
    buyer: trade.buyer,
    price: trade.price,
    tradedAt: trade.tradedAt.toISOString(),
    transactionHash: trade.transactionHash,
    logIndex: trade.logIndex,
    createdAt: trade.createdAt.toISOString(),
  };
}

export function serializeClaim(claim: ClaimProjection) {
  return {
    id: claim.id,
    streamId: claim.streamId.toString(),
    recipient: claim.recipient,
    amount: claim.amount,
    claimedAt: claim.claimedAt.toISOString(),
    transactionHash: claim.transactionHash,
    logIndex: claim.logIndex,
    createdAt: claim.createdAt.toISOString(),
  };
}
