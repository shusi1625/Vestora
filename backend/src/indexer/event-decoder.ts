import { Prisma } from "@prisma/client";
import {
  decodeEventLog,
  type Address,
  type Hex,
  type Log,
} from "viem";

import type { IndexedContract } from "./contracts.js";

export type VestoraRawLog = Log<bigint, number, false>;

export type DecodedVestoraEvent = {
  eventName: string;
  streamId: bigint | null;
  payload: Prisma.InputJsonValue;
};

function toJsonValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]),
    );
  }

  return String(value);
}

function extractStreamId(args: unknown) {
  if (
    args !== null &&
    typeof args === "object" &&
    "streamId" in args &&
    typeof args.streamId === "bigint"
  ) {
    return args.streamId;
  }

  return null;
}

export function decodeVestoraLog(
  contract: IndexedContract,
  log: VestoraRawLog,
): DecodedVestoraEvent | null {
  try {
    const decoded = decodeEventLog({
      abi: contract.abi,
      data: log.data as Hex,
      topics: log.topics,
    });

    if (!decoded.eventName) {
      return null;
    }

    return {
      eventName: decoded.eventName,
      streamId: extractStreamId(decoded.args),
      payload: toJsonValue(decoded.args) as Prisma.InputJsonValue,
    };
  } catch {
    return null;
  }
}

export function normalizeAddress(address: Address | string) {
  return address.toLowerCase();
}
