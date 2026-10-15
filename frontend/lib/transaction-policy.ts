export function requiresProjection(label: string) {
  return !label.startsWith("Approve ") && label !== "Mint MockUSDC";
}

export function projectionIncludes(confirmed: bigint | undefined, projected: bigint | undefined) {
  return confirmed !== undefined && projected !== undefined && projected >= confirmed;
}

export function streamLifecycle(
  stream: { canceled: boolean; withdrawnAmount: bigint; depositedAmount: bigint; startTime: bigint; endTime: bigint } | undefined,
  vested: bigint | undefined,
  blockTime: bigint | undefined,
) {
  if (!stream) return "Unavailable";
  if (stream.canceled) return vested !== undefined && stream.withdrawnAmount >= vested ? "Canceled / settled" : "Canceled";
  if (stream.withdrawnAmount >= stream.depositedAmount) return "Settled";
  if (blockTime === undefined) return "Time unavailable";
  if (blockTime < stream.startTime) return "Scheduled";
  return blockTime >= stream.endTime ? "Ended" : "Active";
}

export function visiblePollInterval(visible: boolean): number | false {
  return visible ? 15_000 : false;
}

export async function refreshAfterConfirmation(refreshes: Array<() => Promise<unknown>>) {
  const results = await Promise.allSettled(refreshes.map((refresh) => Promise.resolve().then(refresh)));
  return results.some((result) => result.status === "rejected")
    ? "Transaction succeeded, but some reads could not be refreshed." : undefined;
}
