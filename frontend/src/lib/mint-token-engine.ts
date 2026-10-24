import type {WalletSession} from "./wallet-session";
import {walletRejected} from "./wallet-session";
import {LIVE_STREAM, LIVE_USDC} from "./live-config";
import {assertDeploymentWriteAllowed} from "./claim-policy";
import {submissionFailure, submissionFailureMessage} from "./transaction-safety";
import {
  MintTokenNotSubmitted, assertMintTokenEvidence, assertMintTokenQuote, assertMintTokenWallet, mintTokenAddress, mintTokenHash,
  mintTokenRecord, sameMintAddress, sameMintReservation, validateMintTokenAmount,
  type MintTokenBalance, type MintTokenEvidence, type MintTokenHash, type MintTokenQuote, type PendingMintToken,
} from "./mint-token-model";

export type MintTokenPhase = "checking" | "review" | "wallet" | "submitted" | "completed" | "rejected" | "reverted" | "replaced" | "unknown" | "error";
export type MintTokenState = {
  phase: MintTokenPhase; quote?: MintTokenQuote; pending?: PendingMintToken; evidence?: MintTokenEvidence; balance?: MintTokenBalance;
  refreshStatus?: "pending" | "refreshed" | "failed"; error?: string; warning?: string;
};
export type MintTokenPorts = {
  session: WalletSession;
  storage: {read: (account: string) => PendingMintToken | null; save: (record: PendingMintToken) => void; clear: (record: PendingMintToken) => void};
  quote: (token: MintTokenQuote["token"], amount: bigint) => Promise<MintTokenQuote>;
  send: (quote: MintTokenQuote) => Promise<MintTokenHash>;
  receipt: (record: PendingMintToken, onReplacement: (hash: MintTokenHash) => void) => Promise<MintTokenEvidence | "reverted" | "replaced">;
  verifyRecovery: (record: PendingMintToken, hash: MintTokenHash) => Promise<void>;
  balanceAt: (record: PendingMintToken, evidence: MintTokenEvidence) => Promise<MintTokenBalance>;
  refresh: (account: string) => Promise<void>;
  lock: (account: string, action: () => Promise<void>) => Promise<void>;
  assertNoOtherPending?: (account: string) => void | Promise<void>;
  now?: () => number;
};
const message = (e: unknown) => e instanceof Error && /^(mint|claim|live|actions)\.[\w.-]+$/.test(e.message) ? e.message : "mint.readFailed";
export function createMintTokenEngine(ports: MintTokenPorts) {
  let states: Record<string, MintTokenState> = {}, generation = 0;
  const listeners = new Set<() => void>(), busy = new Set<string>();
  const put = (a: string, s: MintTokenState) => { states = {...states, [a]: s}; for (const fn of listeners) { try { fn(); } catch { /* A UI listener must not interrupt transaction tracking. */ } } };
  const run = async (account: string, fn: (account: string) => Promise<void>) => {
    const a = account.toLowerCase(); if (!mintTokenAddress(a) || busy.has(a)) return;
    busy.add(a); try { await fn(a); } finally { busy.delete(a); }
  };
  const active = (a: string) => {
    const s = states[a];
    return s?.pending && (["wallet", "submitted", "unknown", "error"].includes(s.phase) || s.warning === "mint.storageWarning") ? s.pending : undefined;
  };
  const read = (a: string) => {
    const saved = ports.storage.read(a), memory = active(a);
    if (!saved) return memory;
    if (memory?.hash && !saved.hash && sameMintReservation({...saved, hash: memory.hash}, memory)) return memory;
    return saved;
  };
  const unknown = (r: PendingMintToken) => put(r.account, {phase: "unknown", pending: r, error: submissionFailureMessage(r.failure)});
  const clear = async (r: PendingMintToken) => {
    try {
      await ports.lock(r.account, async () => {
        const saved = ports.storage.read(r.account);
        if (saved && !saved.hash && r.hash && sameMintReservation({...saved, hash: r.hash}, r)) ports.storage.save(r);
        ports.storage.clear(r);
      });
      return undefined;
    }
    catch { return "mint.storageWarning"; }
  };
  const update = async (prior: PendingMintToken, next: PendingMintToken) => {
    await ports.lock(prior.account, async () => {
      if (!sameMintReservation(ports.storage.read(prior.account), prior)) throw new Error("mint.storageWarning");
      ports.storage.save(next);
    });
  };
  const complete = async (r: PendingMintToken, evidence: MintTokenEvidence, initialWarning?: string) => {
    let balance: MintTokenBalance | undefined, warning: string | undefined, refreshStatus: MintTokenState["refreshStatus"] = "pending";
    put(r.account, {phase: "completed", pending: r, evidence, warning: initialWarning, refreshStatus});
    try {
      balance = await ports.balanceAt(r, evidence);
      if (balance.source !== "erc20-receipt-block" || !sameMintAddress(balance.account, r.account) || !sameMintAddress(balance.tokenAddress, LIVE_USDC) ||
          balance.block !== evidence.block || balance.blockHash.toLowerCase() !== evidence.blockHash.toLowerCase() ||
          typeof balance.balance !== "bigint" || balance.balance < 0n || balance.balance > 2n ** 256n - 1n) throw 0;
    } catch { balance = undefined; warning = warning || "mint.balanceWarning"; }
    try { await ports.refresh(r.account); refreshStatus = "refreshed"; }
    catch { refreshStatus = "failed"; warning = warning || "mint.refreshWarning"; }
    warning = await clear(r) || warning;
    put(r.account, {phase: "completed", pending: r, evidence, balance, refreshStatus, warning});
  };
  const settle = async (initial: PendingMintToken) => {
    let r = initial;
    try {
      const result = await ports.receipt(r, hash => {
        if (!mintTokenHash(hash)) throw new Error("mint.receiptUnavailable");
        r = {...r, hash}; put(r.account, {phase: "submitted", pending: r});
      });
      if (result === "reverted" || result === "replaced") {
        // A replacement hash was validated by the adapter; persist it before releasing its reservation.
        let warning: string | undefined;
        if (!sameMintReservation(initial, r)) { try { await update(initial, r); } catch { warning = "mint.storageWarning"; } }
        warning = await clear(r); put(r.account, {phase: result, pending: r, warning}); return;
      }
      assertMintTokenEvidence(r, result);
      let warning: string | undefined;
      if (!sameMintReservation(initial, r)) { try { await update(initial, r); } catch { warning = "mint.storageWarning"; } }
      await complete(r, result, warning);
    } catch (error) { put(r.account, {phase: "unknown", pending: r, error: message(error)}); }
  };
  const restore = (account: string) => {
    const a = account.toLowerCase(); if (!mintTokenAddress(a) || states[a]) return;
    try { const r = ports.storage.read(a); if (r) unknown(r); }
    catch (e) { put(a, {phase: "error", error: message(e)}); }
  };
  const review = async (amount: bigint) => {
    let token: MintTokenQuote["token"]; try { token = ports.session.capture(); } catch { return; }
    const ticket = generation;
    await run(token.account, async a => {
      try {
        const r = read(a); if (r) { unknown(r); return; }
        assertMintTokenWallet(token); assertDeploymentWriteAllowed(a, LIVE_STREAM); validateMintTokenAmount(amount);
        await ports.assertNoOtherPending?.(a);
        put(a, {phase: "checking"});
        const quote = await ports.quote(token, amount); await ports.session.assertCurrent(token);
        assertMintTokenQuote(quote, token, amount);
        if (ticket !== generation) throw new Error("claim.sessionChanged");
        await ports.assertNoOtherPending?.(a);
        if (ticket !== generation) throw new Error("claim.sessionChanged");
        put(a, {phase: "review", quote});
      } catch (e) { const pending = active(a); put(a, {pending, phase: pending ? "unknown" : "error", error: message(e)}); }
    });
  };
  const execute = async (account: string) => run(account, async a => {
    const q = states[a]?.quote; if (states[a]?.phase !== "review" || !q) return;
    const ticket = generation; let r: PendingMintToken | undefined, walletRequested = false, submitted = false;
    try {
      await ports.lock(a, async () => {
        const existing = read(a); if (existing) { unknown(existing); return; }
        assertDeploymentWriteAllowed(a, LIVE_STREAM); assertMintTokenWallet(q.token);
        if (!sameMintAddress(q.account, a) || !sameMintAddress(q.token.account, a)) throw new Error("claim.sessionChanged");
        await ports.assertNoOtherPending?.(a);
        put(a, {phase: "checking"}); await ports.session.assertCurrent(q.token);
        const latest = await ports.quote(q.token, q.amount); assertMintTokenQuote(latest, q.token, q.amount);
        if (latest.block < q.block) throw new Error("mint.conditionsChanged");
        await ports.assertNoOtherPending?.(a); await ports.session.assertCurrent(q.token);
        if (ticket !== generation) throw new Error("claim.sessionChanged");
        r = mintTokenRecord(latest, ports.now?.() ?? Date.now()); ports.storage.save(r);
        put(a, {phase: "wallet", pending: r}); walletRequested = true;
        const hash = await ports.send(latest);
        if (!mintTokenHash(hash)) throw new Error("mint.unknownHash");
        r = {...r, hash}; submitted = true;
        let warning: string | undefined;
        try { ports.storage.save(r); } catch { warning = "mint.storageWarning"; }
        put(a, {phase: "submitted", pending: r, warning});
      });
      if (submitted && r) await settle(r);
    } catch (error) {
      if (!r) { put(a, {phase: "error", error: message(error)}); return; }
      if (!walletRequested || !submitted && (walletRejected(error) || error instanceof MintTokenNotSubmitted)) {
        const warning = await clear(r);
        put(a, {phase: walletRejected(error) ? "rejected" : "error", error: walletRejected(error) ? undefined : message(error), pending: warning ? r : undefined, warning}); return;
      }
      let warning: string | undefined;
      if (!submitted) {
        const next = {...r, failure: submissionFailure(error, ports.now?.() ?? Date.now())};
        try { await update(r, next); } catch { warning = "mint.storageWarning"; }
        r = next;
      }
      put(a, {phase: "unknown", pending: r, error: submissionFailureMessage(r.failure) || message(error), warning});
    }
  });
  const resume = async (account: string) => run(account, async a => {
    const prior = states[a];
    try {
      const r = read(a) || prior?.pending; if (!r) return;
      if (prior?.phase === "completed" && prior.evidence && prior.evidence.hash === r.hash) { await complete(r, prior.evidence); return; }
      if (!r.hash) { unknown(r); return; }
      put(a, {phase: "submitted", pending: r}); await settle(r);
    } catch (e) { put(a, {...prior, phase: prior?.pending ? "unknown" : "error", error: message(e)}); }
  });
  const recover = async (account: string, hash: string) => run(account, async a => {
    const prior = states[a];
    try {
      const token = ports.session.capture(); assertMintTokenWallet(token);
      if (!sameMintAddress(token.account, a)) throw new Error("claim.sessionChanged");
      let recovered: PendingMintToken | undefined;
      await ports.lock(a, async () => {
        const before = ports.storage.read(a);
        const r = read(a); if (!r || !mintTokenHash(hash)) throw new Error("mint.recoveryMismatch");
        await ports.verifyRecovery(r, hash); await ports.session.assertCurrent(token);
        const after = ports.storage.read(a);
        if (before ? !sameMintReservation(after, before) : after !== null) throw new Error("mint.recoveryMismatch");
        recovered = {...r, hash, failure: undefined}; ports.storage.save(recovered); put(a, {phase: "submitted", pending: recovered});
      });
      if (recovered) await settle(recovered);
    } catch (e) { put(a, {...prior, phase: prior?.pending ? "unknown" : "error", error: message(e)}); }
  });
  const invalidate = () => {
    generation++;
    for (const [a, s] of Object.entries(states)) if (s.phase === "review") put(a, {phase: "error", error: "claim.sessionChanged"});
  };
  return {getSnapshot: () => states, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, review, execute, restore, resume, recover, invalidate};
}
export type MintTokenEngine = ReturnType<typeof createMintTokenEngine>;
