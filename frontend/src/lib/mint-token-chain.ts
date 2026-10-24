import {createPublicClient, createWalletClient, custom, http, parseAbi, encodeFunctionData, decodeEventLog, type Address, type Hash, type Transaction, type TransactionReceipt} from "viem";
import {sepolia} from "viem/chains";
import {LIVE_RPC_URL, LIVE_STREAM, LIVE_USDC} from "./live-config";
import type {WalletSession, WalletToken} from "./wallet-session";
import {gasEstimate} from "./transaction-safety";
import {assertDeploymentWriteAllowed} from "./claim-policy";
import {browserMintTokenStorage, decodePendingMintToken} from "./mint-token-storage";
import {MintTokenNotSubmitted, assertMintTokenEvidence, assertMintTokenWallet, mintTokenHash, sameMintAddress as eq, validateMintTokenAmount, type MintTokenEvidence, type MintTokenQuote, type PendingMintToken} from "./mint-token-model";
import type {MintTokenPorts} from "./mint-token-engine";

export const mintTokenAbi = parseAbi([
  "function mint(address to,uint256 amount)", "function decimals() view returns (uint8)", "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
const zero = "0x0000000000000000000000000000000000000000";
const client = createPublicClient({chain: sepolia, transport: http(LIVE_RPC_URL, {timeout: 12_000, retryCount: 1})});
const request = (account: string, amount: bigint) => ({address: LIVE_USDC, abi: mintTokenAbi, functionName: "mint" as const, args: [account as Address, amount] as const});
async function assertChain() { if (await client.getChainId() !== sepolia.id) throw new Error("claim.chainUnavailable"); }
function checked(record: PendingMintToken) { return decodePendingMintToken(JSON.stringify(record), record.account)!; }
export async function quoteMintToken(token: WalletToken, amount: bigint): Promise<MintTokenQuote> {
  assertMintTokenWallet(token); validateMintTokenAmount(amount); assertDeploymentWriteAllowed(token.account, LIVE_STREAM); await assertChain();
  const block = await client.getBlock();
  if (block.number === null) throw new Error("claim.chainUnavailable");
  const account = token.account as Address, blockNumber = block.number;
  const [decimals, balance] = await Promise.all([
    client.readContract({address: LIVE_USDC, abi: mintTokenAbi, functionName: "decimals", blockNumber, authorizationList: undefined}),
    client.getBalance({address: account, blockNumber}),
  ]);
  if (decimals !== 6) throw new Error("mint.decimalsMismatch");
  await client.simulateContract({...request(account, amount), account, blockNumber, authorizationList: undefined});
  const [gasLimit, fees] = await Promise.all([
    client.estimateContractGas({...request(account, amount), account, blockNumber, authorizationList: undefined}),
    client.estimateFeesPerGas({chain: sepolia, type: "eip1559"}),
  ]);
  return {amount, account: account.toLowerCase(), token, block: blockNumber, at: block.timestamp, gasEstimate: gasEstimate(gasLimit, fees, balance), walletCost: "wallet-final-unknown"};
}
function sender(tx: Transaction, hash: Hash, record: PendingMintToken) {
  return eq(tx.hash, hash) && eq(tx.from, record.account) && tx.value === 0n && Boolean(tx.to) && (tx.chainId === undefined || tx.chainId === sepolia.id);
}
function direct(tx: Transaction, record: PendingMintToken) {
  return !eq(tx.to, LIVE_USDC) || tx.input.toLowerCase() === encodeFunctionData(request(record.account, BigInt(record.amount))).toLowerCase();
}
function mintEvidence(record: PendingMintToken, receipt: TransactionReceipt): MintTokenEvidence | undefined {
  if (!mintTokenHash(receipt.transactionHash) || !mintTokenHash(receipt.blockHash) || typeof receipt.blockNumber !== "bigint" || receipt.blockNumber <= BigInt(record.reviewBlock)) return;
  const matches: MintTokenEvidence[] = []; let conflicting = false;
  for (const log of receipt.logs) {
    if (!eq(log.address, LIVE_USDC)) continue;
    try {
      const topics=(log as {topics?:unknown}).topics;
      if (!Array.isArray(topics) || topics.length !== 3 || topics.some(t => typeof t!=="string"||!/^0x[\da-f]{64}$/i.test(t)) || !/^0x[\da-f]{64}$/i.test(log.data)) continue;
      const {args} = decodeEventLog({abi: mintTokenAbi, eventName: "Transfer", topics: topics as [Hash, Hash, Hash], data: log.data, strict: true});
      if (!eq(args.from, zero) || !eq(args.to, record.account)) continue;
      if (args.value !== BigInt(record.amount) || log.removed || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0 ||
          topics[1].toLowerCase() !== `0x${"0".repeat(64)}` || topics[2].toLowerCase() !== `0x${record.account.slice(2).toLowerCase().padStart(64, "0")}` ||
          !eq(log.transactionHash, receipt.transactionHash) || log.blockNumber !== receipt.blockNumber || !eq(log.blockHash, receipt.blockHash)) { conflicting = true; continue; }
      matches.push({source: "erc20-mint-transfer", tokenAddress: LIVE_USDC, account: record.account, hash: receipt.transactionHash, block: receipt.blockNumber, blockHash: receipt.blockHash, amount: args.value, logIndex: log.logIndex});
    } catch { /* Only a strictly decoded mint Transfer can prove the requested amount. */ }
  }
  return !conflicting && matches.length === 1 ? matches[0] : undefined;
}
async function receiptIdentity(record: PendingMintToken, hash: Hash, receipt: TransactionReceipt) {
  await assertChain();
  if (!eq(receipt.transactionHash, hash) || typeof receipt.blockNumber !== "bigint" || receipt.blockNumber <= BigInt(record.reviewBlock) || !mintTokenHash(receipt.blockHash)) throw new Error("mint.receiptUnavailable");
  const tx = await client.getTransaction({hash});
  if (!sender(tx, hash, record) || tx.blockNumber !== receipt.blockNumber || !eq(tx.blockHash, receipt.blockHash)) throw new Error("mint.recoveryMismatch");
  return tx;
}
export function browserMintTokenPorts(session: WalletSession, refresh: MintTokenPorts["refresh"]): MintTokenPorts {
  return {session, storage: browserMintTokenStorage(), quote: quoteMintToken, refresh,
    lock: async (account, fn) => {
      if (typeof navigator === "undefined" || !navigator.locks) throw new Error("claim.lockUnavailable");
      await navigator.locks.request(`vestora:claim:${LIVE_STREAM.toLowerCase()}:${account.toLowerCase()}`, {ifAvailable: true}, async lock => {
        if (!lock) throw new Error("claim.tabBusy"); await fn();
      });
    },
    send: async q => {
      try {
        assertMintTokenWallet(q.token); validateMintTokenAmount(q.amount); assertDeploymentWriteAllowed(q.account, LIVE_STREAM);
        if (!eq(q.account, q.token.account)) throw new Error("claim.sessionChanged");
        await assertChain(); await session.assertCurrent(q.token);
      } catch (e) { throw new MintTokenNotSubmitted(e instanceof Error ? e.message : "claim.sessionChanged"); }
      const wallet = createWalletClient({chain: sepolia, account: q.account as Address, transport: custom(q.token.provider, {retryCount: 0})});
      // Nonpayable ABI disallows a native value; viem submits the call with zero ETH.
      return wallet.writeContract({...request(q.account, q.amount), account: q.account as Address, chain: sepolia, authorizationList: undefined});
    },
    receipt: async (input, onReplacement) => {
      const r = checked(input); if (!r.hash) throw new Error("mint.unknownHash"); await assertChain();
      let expected = r.hash, replacement = false;
      const receipt = await client.waitForTransactionReceipt({hash: r.hash, confirmations: 2, timeout: 120_000, pollingInterval: 4_000,
        onReplaced: info => {
          if (!eq(info.replacedTransaction.hash, expected) || !sender(info.replacedTransaction, expected, r) ||
              !sender(info.transaction, info.transactionReceipt.transactionHash, r) ||
              info.transaction.nonce !== info.replacedTransaction.nonce || !Number.isSafeInteger(info.transaction.nonce)) throw new Error("mint.recoveryMismatch");
          expected = info.transactionReceipt.transactionHash; replacement = true;
        },
      });
      const tx = await receiptIdentity(r, expected, receipt);
      if (replacement) onReplacement(expected);
      if (receipt.status === "reverted") return "reverted";
      if (receipt.status !== "success") throw new Error("mint.receiptUnavailable");
      if (replacement && eq(tx.to, r.account) && tx.input === "0x" && receipt.logs.length === 0) return "replaced";
      if (!direct(tx, r)) { if (replacement) return "replaced"; throw new Error("mint.recoveryMismatch"); }
      const evidence = mintEvidence(r, receipt); if (!evidence) throw new Error("mint.receiptUnavailable"); return evidence;
    },
    verifyRecovery: async (input, hash) => {
      const r = checked(input); if (!mintTokenHash(hash)) throw new Error("mint.recoveryMismatch");
      const receipt = await client.getTransactionReceipt({hash}), tx = await receiptIdentity(r, hash, receipt);
      if (r.hash && !eq(r.hash, hash)) {
        const original = await client.getTransaction({hash: r.hash});
        if (!sender(original, r.hash, r) || original.nonce !== tx.nonce || !Number.isSafeInteger(tx.nonce)) throw new Error("mint.recoveryMismatch");
      }
      if (receipt.status !== "success" || !direct(tx, r) || !mintEvidence(r, receipt)) throw new Error("mint.recoveryMismatch");
    },
    balanceAt: async (input, evidence) => {
      const r = checked(input); await assertChain();
      assertMintTokenEvidence(r, evidence);
      const block = await client.getBlock({blockNumber: evidence.block});
      if (!eq(block.hash, evidence.blockHash)) throw new Error("mint.receiptUnavailable");
      const balance = await client.readContract({address: LIVE_USDC, abi: mintTokenAbi, functionName: "balanceOf", args: [r.account as Address], blockNumber: evidence.block, authorizationList: undefined});
      const after = await client.getBlock({blockNumber: evidence.block});
      if (!eq(after.hash, evidence.blockHash)) throw new Error("mint.receiptUnavailable");
      return {source: "erc20-receipt-block", tokenAddress: LIVE_USDC, account: r.account, block: evidence.block, blockHash: evidence.blockHash, balance};
    },
  };
}
