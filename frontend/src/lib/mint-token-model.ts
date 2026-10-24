import {LIVE_USDC} from "./live-config";
import type {WalletToken} from "./wallet-session";
import type {GasEstimate, SubmissionFailure} from "./transaction-safety";

export type MintTokenHash = `0x${string}`;
export type MintTokenQuote = {
  amount: bigint; account: string; token: WalletToken; block: bigint; at: bigint;
  gasEstimate: GasEstimate; walletCost: "wallet-final-unknown";
};
export type MintTokenEvidence = {
  hash: MintTokenHash; block: bigint; blockHash: MintTokenHash; amount: bigint; logIndex: number;
  account: string; tokenAddress: typeof LIVE_USDC; source: "erc20-mint-transfer";
};
export type MintTokenBalance = {
  source: "erc20-receipt-block"; account: string; tokenAddress: typeof LIVE_USDC;
  block: bigint; blockHash: MintTokenHash; balance: bigint;
};
export type PendingMintToken = {
  version: 1; createdAt: number; account: string; contract: typeof LIVE_USDC; chainId: 11155111;
  amount: string; reviewBlock: string; hash?: MintTokenHash; failure?: SubmissionFailure;
};
export class MintTokenNotSubmitted extends Error {}
export const mintTokenAddress = (value: unknown): value is string => typeof value === "string" && /^0x[\da-f]{40}$/i.test(value) && !/^0x0{40}$/i.test(value);
export const mintTokenHash = (value: unknown): value is MintTokenHash => typeof value === "string" && /^0x[\da-f]{64}$/i.test(value) && !/^0x0{64}$/i.test(value);
export const sameMintAddress = (a?: string | null, b?: string | null) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
export function validateMintTokenAmount(amount: bigint) {
  if (typeof amount !== "bigint" || amount <= 0n || amount > 2n ** 256n - 1n) throw new Error("mint.invalidAmount");
}
export function assertMintTokenWallet(token: WalletToken) {
  if (!mintTokenAddress(token.account)) throw new Error("mint.invalidAccount");
  if (token.chainId?.toLowerCase() !== "0xaa36a7") throw new Error("claim.network");
}
export function assertMintTokenQuote(quote: MintTokenQuote, token: WalletToken, amount: bigint) {
  validateMintTokenAmount(amount); assertMintTokenWallet(token);
  if (quote.amount !== amount || !sameMintAddress(quote.account, token.account) ||
      quote.token.account !== token.account || quote.token.provider !== token.provider || quote.token.revision !== token.revision || quote.token.chainId !== token.chainId ||
      typeof quote.block !== "bigint" || quote.block < 0n || typeof quote.at !== "bigint" || quote.at < 0n ||
      quote.walletCost !== "wallet-final-unknown" || !quote.gasEstimate || quote.gasEstimate.scope !== "public-rpc-direct") throw new Error("mint.conditionsChanged");
}
export function mintTokenRecord(quote: MintTokenQuote, now: number): PendingMintToken {
  assertMintTokenQuote(quote, quote.token, quote.amount);
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("mint.storageUnavailable");
  return {version: 1, createdAt: now, account: quote.account.toLowerCase(), contract: LIVE_USDC, chainId: 11155111, amount: quote.amount.toString(), reviewBlock: quote.block.toString()};
}
export const sameMintReservation = (a: PendingMintToken | null | undefined, b: PendingMintToken) => Boolean(a &&
  a.version === b.version && a.chainId === b.chainId && sameMintAddress(a.account, b.account) && sameMintAddress(a.contract, b.contract) &&
  a.createdAt === b.createdAt && a.amount === b.amount && a.reviewBlock === b.reviewBlock && a.hash?.toLowerCase() === b.hash?.toLowerCase());
export function assertMintTokenEvidence(record: PendingMintToken, evidence: MintTokenEvidence) {
  if (!mintTokenHash(evidence.hash) || !record.hash || evidence.hash.toLowerCase() !== record.hash.toLowerCase() ||
      !mintTokenHash(evidence.blockHash) || typeof evidence.block !== "bigint" || evidence.block <= BigInt(record.reviewBlock) ||
      evidence.amount !== BigInt(record.amount) || !Number.isSafeInteger(evidence.logIndex) || evidence.logIndex < 0 ||
      !sameMintAddress(evidence.account, record.account) || !sameMintAddress(evidence.tokenAddress, LIVE_USDC) || evidence.source !== "erc20-mint-transfer") throw new Error("mint.receiptUnavailable");
}
