import {LIVE_USDC} from "./live-config";
import {validSubmissionFailure} from "./transaction-safety";
import {mintTokenAddress, mintTokenHash, sameMintAddress, sameMintReservation, validateMintTokenAmount, type PendingMintToken} from "./mint-token-model";

export const mintTokenPendingKey = (account: string) => `vestora:mint-pending:11155111:${LIVE_USDC.toLowerCase()}:${account.toLowerCase()}`;
export function decodePendingMintToken(raw: string | null, account: string): PendingMintToken | null {
  if (raw === null) return null;
  try {
    const p = JSON.parse(raw);
    if (!p || p.version !== 1 || p.chainId !== 11155111 || !mintTokenAddress(p.account) || p.account !== p.account.toLowerCase() ||
        !sameMintAddress(p.account, account) || !sameMintAddress(p.contract, LIVE_USDC) ||
        !Number.isSafeInteger(p.createdAt) || p.createdAt < 0 || typeof p.amount !== "string" || !/^[1-9]\d*$/.test(p.amount) ||
        typeof p.reviewBlock !== "string" || !/^(0|[1-9]\d*)$/.test(p.reviewBlock) ||
        (p.hash !== undefined && !mintTokenHash(p.hash)) || (p.failure !== undefined && !validSubmissionFailure(p.failure))) throw 0;
    validateMintTokenAmount(BigInt(p.amount));
    // Rebuild the record so provider payloads and unrecognized metadata cannot survive a reload.
    return {version: 1, chainId: 11155111, account: p.account, contract: LIVE_USDC, createdAt: p.createdAt, amount: p.amount, reviewBlock: p.reviewBlock,
      ...(p.hash === undefined ? {} : {hash: p.hash}), ...(p.failure === undefined ? {} : {failure: {
        stage: p.failure.stage, reason: p.failure.reason, at: p.failure.at, ...(p.failure.code === undefined ? {} : {code: p.failure.code}),
      }})};
  } catch { throw new Error("mint.pendingCorrupt"); }
}
export function browserMintTokenStorage() {
  return {
    read(account: string) {
      let raw: string | null;
      try { raw = localStorage.getItem(mintTokenPendingKey(account)); } catch { throw new Error("mint.storageUnavailable"); }
      return decodePendingMintToken(raw, account);
    },
    save(record: PendingMintToken) {
      const checked = decodePendingMintToken(JSON.stringify(record), record.account)!;
      try {
        const key = mintTokenPendingKey(checked.account), raw = JSON.stringify(checked);
        localStorage.setItem(key, raw); if (localStorage.getItem(key) !== raw) throw 0;
      } catch { throw new Error("mint.storageUnavailable"); }
    },
    clear(record: PendingMintToken) {
      try {
        const key = mintTokenPendingKey(record.account), saved = decodePendingMintToken(localStorage.getItem(key), record.account);
        if (!saved) return;
        if (!sameMintReservation(saved, record)) throw 0;
        localStorage.removeItem(key); if (localStorage.getItem(key) !== null) throw 0;
      } catch { throw new Error("mint.storageUnavailable"); }
    },
  };
}
