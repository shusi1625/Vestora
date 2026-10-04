import { isAddress } from "viem";

import { badRequest } from "./errors.js";

export function parseStreamId(value: string) {
  try {
    const streamId = BigInt(value);

    if (streamId <= 0n) {
      throw new Error();
    }

    return streamId;
  } catch {
    throw badRequest("streamId must be a positive integer");
  }
}

export function parseAddress(value: string) {
  if (!isAddress(value)) {
    throw badRequest("address must be a valid EVM address");
  }

  return value.toLowerCase();
}
