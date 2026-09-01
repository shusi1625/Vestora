import { formatUnits, type Address } from "viem";

export function shortenAddress(address?: Address | string) {
  if (!address) {
    return "-";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTokenAmount(
  amount?: bigint,
  decimals = 6,
  fallback = "-",
) {
  if (amount === undefined) {
    return fallback;
  }

  return formatUnits(amount, decimals);
}

export function formatTimestamp(timestamp?: bigint) {
  if (timestamp === undefined || timestamp === BigInt(0)) {
    return "-";
  }

  return new Date(Number(timestamp) * 1000).toLocaleString();
}

export function sameAddress(left?: Address | string, right?: Address | string) {
  if (!left || !right) {
    return false;
  }

  return left.toLowerCase() === right.toLowerCase();
}
