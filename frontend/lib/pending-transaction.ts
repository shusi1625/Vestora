export type PendingTransaction = {
  version: 1; account: string; chainId: number; hash: `0x${string}`;
  label: string; streamId: string;
};
export function pendingKey(account: string, contract: string) {
  return `vestora:pending:11155111:${contract.toLowerCase()}:${account.toLowerCase()}`;
}
export function decodePending(raw: string | null, account: string): PendingTransaction | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v.version !== 1 || v.chainId !== 11155111 ||
        typeof v.account !== "string" || v.account.toLowerCase() !== account.toLowerCase() ||
        !/^0x[0-9a-f]{40}$/i.test(v.account) ||
        typeof v.hash !== "string" || !/^0x[0-9a-f]{64}$/i.test(v.hash) ||
        typeof v.label !== "string" || !v.label || v.label.length > 100 ||
        typeof v.streamId !== "string" || !/^\d*$/.test(v.streamId)) return null;
    return v;
  } catch { return null; }
}
export function readPending(key: string, account: string) {
  try { return decodePending(window.localStorage.getItem(key), account); } catch { return null; }
}
export function savePending(key: string, record: PendingTransaction) {
  try { window.localStorage.setItem(key, JSON.stringify(record)); return true; } catch { return false; }
}
export function clearPending(key: string, account: string, hash: string) {
  try {
    if (readPending(key, account)?.hash === hash) window.localStorage.removeItem(key);
  } catch { /* Keeping a completed record is safe; it can be checked again. */ }
}
