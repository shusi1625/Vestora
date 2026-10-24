import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync, existsSync} from "node:fs";
import {resolve, dirname, basename} from "node:path";
import {createRequire} from "node:module";
import vm from "node:vm";

const root = resolve(import.meta.dirname, ".."), source = process.env.VESTORA_FRONTEND_SOURCE || (existsSync(resolve(root, "src/lib/wallet-session.ts")) ? root : "C:/GitHub/Vestora/frontend");
const require = createRequire(resolve(source, "package.json")), ts = require("typescript"), viem = require("viem");
const account = "0x1111111111111111111111111111111111111111", other = "0x2222222222222222222222222222222222222222";
const held = "0xbf9bf852225899b667aa4c73bb082e830abb9de1", stream = "0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a", usdc = "0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9";
const hash = "0x" + "a".repeat(64), hash2 = "0x" + "b".repeat(64), blockHash = "0x" + "c".repeat(64), zero = "0x" + "0".repeat(40), amount = 1234567n;
const config = {LIVE_STREAM: stream, LIVE_USDC: usdc, LIVE_RPC_URL: "https://no-network.invalid"};
function loader(overrides = {}, globals = {}) {
  const cache = new Map(), values = new Map();
  const storage = {getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k)};
  const forbidden = () => { throw Error("External network/wallet access is forbidden in focused tests"); };
  return function load(name) {
    let path = name.endsWith(".ts") ? resolve(name) : resolve(root, `${name}.ts`);
    if (!existsSync(path)) path = resolve(source, "src/lib", basename(path));
    if (cache.has(path)) return cache.get(path);
    const module = {exports: {}}; cache.set(path, module.exports);
    const code = ts.transpileModule(readFileSync(path, "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
    const get = id => id in overrides ? overrides[id] : id === "viem" ? {...viem, createPublicClient: () => new Proxy({}, {get: () => forbidden}), createWalletClient: forbidden} : id === "viem/chains" ? require(id) : id === "./live-config" ? config : load(resolve(dirname(path), id));
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {Error, BigInt, Date, console, fetch: forbidden, localStorage: storage,
      navigator: {locks: {request: async (_k, _o, fn) => fn({})}}, ...globals})(get, module, module.exports);
    return module.exports;
  };
}
const load = loader(), model = load("src/lib/mint-token-model"), storageModel = load("src/lib/mint-token-storage"), {createMintTokenEngine} = load("src/lib/mint-token-engine");
const gas = {scope: "public-rpc-direct", gasLimit: 21000n, maxFeePerGas: 2n, maxPriorityFeePerGas: 1n, maximumCost: 42000n, balance: 100000000n};
const quote = (token, n = amount) => ({amount: n, account: token.account.toLowerCase(), token, block: 120n, at: 100n, gasEstimate: gas, walletCost: "wallet-final-unknown"});
const evidence = r => ({source: "erc20-mint-transfer", tokenAddress: usdc, account: r.account, hash: r.hash, block: 121n, blockHash, amount: BigInt(r.amount), logIndex: 2});
const balance = (r, e) => ({source: "erc20-receipt-block", tokenAddress: usdc, account: r.account, block: e.block, blockHash: e.blockHash, balance: 9999999n});
function fixture(address = account) {
  const records = new Map(); let sends = 0, receipts = 0, refreshed = 0, changed = false;
  const token = {account: address, chainId: "0xaa36a7", revision: 1, provider: {request: async () => { throw Error("No real wallet"); }}};
  const session = {capture: () => token, assertCurrent: async t => { if (changed || t !== token) throw Error("claim.sessionChanged"); }};
  const ports = {session, now: () => 123000, storage: {
    read: a => records.get(a.toLowerCase()) || null, save: r => records.set(r.account, r), clear: r => {
      const saved = records.get(r.account); if (saved && !model.sameMintReservation(saved, r)) throw Error("mint.storageUnavailable"); records.delete(r.account);
    },
  }, quote: async (t, n) => quote(t, n), send: async () => { sends++; return hash; }, receipt: async r => { receipts++; return evidence(r); },
  verifyRecovery: async () => {}, balanceAt: async (r, e) => balance(r, e), refresh: async () => { refreshed++; }, lock: async (_a, fn) => fn()};
  return {ports, session, token, engine: createMintTokenEngine(ports), record: () => ports.storage.read(address.toLowerCase()), records,
    sends: () => sends, receipts: () => receipts, refreshed: () => refreshed, change: () => { changed = true; }};
}
async function reviewed(f = fixture()) { await f.engine.review(amount); assert.equal(f.engine.getSnapshot()[f.token.account.toLowerCase()].phase, "review"); return f; }
async function unresolved(withHash = false) {
  const f = fixture(); f.ports.send = async () => { if (!withHash) throw Error("transport unknown"); return hash; };
  f.ports.receipt = async () => { throw Error("timeout"); }; await f.engine.review(amount); await f.engine.execute(account); return f;
}
function adapterFixture(globals = {}) {
  const f = fixture(), calls = []; let eth = 100000000n, decimals = 6, simulated = true;
  const rpc = {
    getChainId: async () => 11155111, getBlock: async q => q ? {number: q.blockNumber, hash: blockHash, timestamp: 101n} : {number: 120n, hash: blockHash, timestamp: 100n},
    getBalance: async q => { calls.push(q); return eth; }, readContract: async q => { calls.push(q); return q.functionName === "decimals" ? decimals : 9999999n; },
    simulateContract: async q => { calls.push(q); if (!simulated) throw Error("simulation reverted"); return {result: undefined}; },
    estimateContractGas: async q => { calls.push(q); return 21000n; }, estimateFeesPerGas: async () => ({maxFeePerGas: 2n, maxPriorityFeePerGas: 1n}),
  };
  const adapter = loader({viem: {...viem, createPublicClient: () => rpc, createWalletClient: () => { throw Error("No real signing"); }}}, globals)("src/lib/mint-token-chain");
  return {...f, rpc, adapter, calls, ports: adapter.browserMintTokenPorts(f.session, async () => {}), setEth: n => { eth = n; }, setDecimals: n => { decimals = n; }, failSimulation: () => { simulated = false; }};
}
function receiptFixture() {
  const f = adapterFixture(), r = model.mintTokenRecord(quote(f.token), 123000); r.hash = hash;
  const log = {address: usdc, topics: viem.encodeEventTopics({abi: f.adapter.mintTokenAbi, eventName: "Transfer", args: {from: zero, to: account}}),
    data: viem.encodeAbiParameters([{type: "uint256"}], [amount]), transactionHash: hash, blockNumber: 121n, blockHash, logIndex: 2, removed: false};
  const receipt = {status: "success", transactionHash: hash, blockNumber: 121n, blockHash, logs: [log]};
  const tx = {hash, from: account, to: usdc, input: viem.encodeFunctionData({abi: f.adapter.mintTokenAbi, functionName: "mint", args: [account, amount]}), chainId: 11155111, value: 0n, nonce: 4, blockNumber: 121n, blockHash};
  f.rpc.getTransaction = async () => tx; f.rpc.getTransactionReceipt = async () => receipt; f.rpc.waitForTransactionReceipt = async () => receipt;
  return {...f, record: r, log, receipt, tx};
}

test("uint256 and six-decimal base units are exact, never rounded", () => {
  for (const n of [1n, amount, 2n ** 256n - 1n]) model.validateMintTokenAmount(n);
  for (const n of [0n, -1n, 2n ** 256n, 1, "1.000001"]) assert.throws(() => model.validateMintTokenAmount(n), /invalidAmount/);
  assert.equal(viem.parseUnits("1.234567", 6), amount);
});
test("storage and lock keys normalize the account and use the fixed deployment", async () => {
  assert.equal(storageModel.mintTokenPendingKey(account.toUpperCase()), `vestora:mint-pending:11155111:${usdc.toLowerCase()}:${account}`);
  let key, options, count = 0;
  const f = adapterFixture({navigator: {locks: {request: async (k, o, fn) => { key = k; options = o; return fn({}); }}}});
  await f.ports.lock(account.toUpperCase(), async () => { count++; });
  assert.equal(key, `vestora:claim:${stream.toLowerCase()}:${account}`); assert.equal(options.ifAvailable, true); assert.equal(count, 1);
  for (const navigator of [{}, {locks: {request: async (_k, _o, fn) => fn(null)}}]) {
    const blocked = adapterFixture({navigator}); await assert.rejects(() => blocked.ports.lock(account, async () => { count++; }), /lockUnavailable|tabBusy/);
  } assert.equal(count, 1);
});
test("pending decoder rejects corrupt/cross-account/deployment records, preserving fail closed", () => {
  const f = fixture(), r = model.mintTokenRecord(quote(f.token), 123000);
  assert.equal(storageModel.decodePendingMintToken(null, account), null);
  assert.equal(storageModel.decodePendingMintToken(JSON.stringify(r), account).amount, amount.toString());
  for (const raw of ["", "null", "{}", "{", JSON.stringify({...r, amount: "0"}), JSON.stringify({...r, amount: (2n ** 256n).toString()})]) assert.throws(() => storageModel.decodePendingMintToken(raw, account), /pendingCorrupt/);
  for (const patch of [{version: 2}, {account: other}, {chainId: 1}, {contract: stream}, {amount: "01"}, {amount: "1.1"}, {amount: 1}, {reviewBlock: "-1"}, {reviewBlock: undefined}, {createdAt: -1}, {hash: "bad"}, {failure: {stage: "wallet", reason: "retry", at: 1}}]) {
    assert.throws(() => storageModel.decodePendingMintToken(JSON.stringify({...r, ...patch}), account), /pendingCorrupt/);
  }
});
test("storage verifies writes and never clears another reservation", () => {
  const values = new Map(), localStorage = {getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k)};
  const store = loader({}, {localStorage})("src/lib/mint-token-storage").browserMintTokenStorage(), r = model.mintTokenRecord(quote(fixture().token), 123000);
  store.save(r); assert.equal(store.read(account).amount, r.amount);
  assert.throws(() => store.clear({...r, createdAt: 124000}), /storageUnavailable/); assert.ok(store.read(account));
  store.clear(r); assert.equal(store.read(account), null);
  localStorage.setItem = () => {}; assert.throws(() => store.save(r), /storageUnavailable/);
  localStorage.getItem = () => { throw Error("denied"); }; assert.throws(() => store.read(account), /storageUnavailable/);
});
test("review checks decimals, pinned block, simulation, gas and connected recipient without sending", async () => {
  const f = adapterFixture(), q = await f.adapter.quoteMintToken(f.token, amount);
  assert.equal(q.amount, amount); assert.equal(q.block, 120n); assert.equal(q.at, 100n); assert.equal(q.walletCost, "wallet-final-unknown"); assert.equal(q.gasEstimate.maximumCost, 42000n);
  for (const call of f.calls.filter(c => ["decimals", "mint"].includes(c.functionName) && c.blockNumber !== undefined)) assert.equal(call.blockNumber, 120n);
  const simulated = f.calls.find(c => c.functionName === "mint" && c.blockNumber === 120n);
  assert.equal(simulated.address, usdc); assert.equal(simulated.account, account); assert.deepEqual([...simulated.args], [account, amount]); assert.equal(f.sends(), 0);
  f.setDecimals(18); await assert.rejects(() => f.adapter.quoteMintToken(f.token, amount), /decimalsMismatch/);
  f.setDecimals(6); f.failSimulation(); await assert.rejects(() => f.adapter.quoteMintToken(f.token, amount), /simulation reverted/);
});
test("wrong RPC/wallet chain, uint256 overflow and unavailable maximum fees stop pre-wallet", async () => {
  const f = adapterFixture(); f.rpc.getChainId = async () => 1;
  await assert.rejects(() => f.adapter.quoteMintToken(f.token, amount), /chainUnavailable/);
  f.rpc.getChainId = async () => 11155111;
  await assert.rejects(() => f.adapter.quoteMintToken({...f.token, chainId: "0x1"}, amount), /network/);
  await assert.rejects(() => f.adapter.quoteMintToken(f.token, 2n ** 256n), /invalidAmount/);
  f.setEth(41999n); await assert.rejects(() => f.adapter.quoteMintToken(f.token, amount), /gasInsufficient/);
  f.setEth(42000n); assert.equal((await f.adapter.quoteMintToken(f.token, amount)).gasEstimate.maximumCost, 42000n);
  f.rpc.estimateFeesPerGas = async () => ({maxFeePerGas: 1n, maxPriorityFeePerGas: 2n}); await assert.rejects(() => f.adapter.quoteMintToken(f.token, amount), /gasEstimateUnavailable/);
});
test("explicit B reuse reaches mint preflight without sending", async () => {
  const f = fixture(held); let quotes = 0; f.ports.quote = async () => { quotes++; throw Error("mint.readFailed"); };
  await f.engine.review(amount); await f.engine.execute(held);
  assert.equal(f.engine.getSnapshot()[held].error, "mint.readFailed"); assert.equal(quotes, 1); assert.equal(f.sends(), 0);
});
test("review is read only; execute reserves before wallet and permits one send under double click", async () => {
  const f = await reviewed(); assert.equal(f.record(), null); assert.equal(f.sends(), 0);
  const send = f.ports.send; f.ports.send = async q => { assert.equal(f.record().hash, undefined); assert.equal(f.engine.getSnapshot()[account].phase, "wallet"); return send(q); };
  await Promise.all([f.engine.execute(account), f.engine.execute(account)]); await f.engine.execute(account);
  const state = f.engine.getSnapshot()[account]; assert.equal(f.sends(), 1); assert.equal(state.phase, "completed"); assert.equal(state.evidence.amount, amount); assert.equal(state.evidence.logIndex, 2); assert.equal(f.record(), null);
});
test("parent pending callback runs before review and twice under execution lock", async () => {
  const f = fixture(); let calls = 0; f.ports.assertNoOtherPending = () => { calls++; if (calls === 4) throw Error("mint.otherPending"); };
  await reviewed(f); await f.engine.execute(account); assert.equal(f.sends(), 0); assert.equal(f.record(), null); assert.equal(calls, 4); assert.equal(f.engine.getSnapshot()[account].error, "mint.otherPending");
  f.ports.assertNoOtherPending = () => { throw Error("mint.otherPending"); }; await f.engine.review(amount); assert.equal(f.sends(), 0);
});
test("a raw corrupt pending kind is rejected by the supplied parent guard", async () => {
  for (const raw of ["", "{", "null", "0"]) {
    const f = fixture(); f.ports.assertNoOtherPending = () => { if (raw !== null) throw Error("mint.otherPending"); };
    await f.engine.review(amount); assert.equal(f.engine.getSnapshot()[account].error, "mint.otherPending"); assert.equal(f.sends(), 0);
  }
});
test("parent common guard excludes only mint and preserves actions.* diagnostics", async () => {
  const {assertNoOtherLivePending, livePendingKeys} = load("src/lib/transaction-guard"), keys = livePendingKeys(account);
  assert.equal(keys.mint, storageModel.mintTokenPendingKey(account));
  for (const kind of ["claim", "create", "market", "cancel"]) for (const raw of ["", "null", "{"]) {
    const f = fixture(); f.ports.assertNoOtherPending = a => assertNoOtherLivePending(a, "mint", {getItem: k => k === keys[kind] ? raw : null});
    await f.engine.review(amount); assert.equal(f.engine.getSnapshot()[account].error, "actions.otherPending"); assert.equal(f.sends(), 0);
  }
  assert.doesNotThrow(() => assertNoOtherLivePending(account, "mint", {getItem: k => k === keys.mint ? "{" : null}));
  const f = fixture(); f.ports.assertNoOtherPending = a => assertNoOtherLivePending(a, "mint", {getItem: () => { throw Error("storage denied"); }});
  await f.engine.review(amount); assert.equal(f.engine.getSnapshot()[account].error, "actions.storageUnavailable"); assert.equal(f.sends(), 0);
});
test("invalid amounts, session drift, quote mismatch and failed reservation prevent sending", async () => {
  for (const n of [0n, -1n, 2n ** 256n]) { const f = fixture(); await f.engine.review(n); assert.equal(f.sends(), 0); assert.equal(f.record(), null); }
  const f = await reviewed(); f.change(); await f.engine.execute(account); assert.equal(f.sends(), 0); assert.equal(f.engine.getSnapshot()[account].error, "claim.sessionChanged");
  const q = await reviewed(); q.ports.quote = async t => quote(t, amount + 1n); await q.engine.execute(account); assert.equal(q.sends(), 0);
  const s = await reviewed(); s.ports.storage.save = () => { throw Error("mint.storageUnavailable"); }; await s.engine.execute(account); assert.equal(s.sends(), 0); assert.equal(s.engine.getSnapshot()[account].phase, "error");
});
test("maximum gas changes at execution are checked again before wallet", async () => {
  const f = adapterFixture(), core = fixture(); core.ports.quote = f.adapter.quoteMintToken;
  await core.engine.review(amount); f.setEth(41999n); await core.engine.execute(account); assert.equal(core.sends(), 0); assert.equal(core.record(), null); assert.equal(core.engine.getSnapshot()[account].error, "claim.gasInsufficient");
});
test("invalidate cancels both reviewed and in-flight review results", async () => {
  const f = await reviewed(); f.engine.invalidate(); await f.engine.execute(account); assert.equal(f.sends(), 0); assert.equal(f.engine.getSnapshot()[account].error, "claim.sessionChanged");
  const g = fixture(); let release; g.ports.quote = async t => { await new Promise(r => { release = r; }); return quote(t); };
  const pending = g.engine.review(amount); while (!release) await new Promise(r => setImmediate(r)); g.engine.invalidate(); release(); await pending;
  assert.equal(g.engine.getSnapshot()[account].phase, "error"); assert.equal(g.sends(), 0);
});
test("account snapshots and subscriptions remain isolated through wallet changes", async () => {
  const f = fixture(); let seen = 0; const unsubscribe = f.engine.subscribe(() => { seen++; }); const before = f.engine.getSnapshot();
  await f.engine.review(amount); assert.notEqual(f.engine.getSnapshot(), before); assert.ok(seen > 0); const count = seen; unsubscribe();
  f.token.account = other; await f.engine.review(amount); assert.equal(seen, count); assert.equal(f.engine.getSnapshot()[account].quote.account, account); assert.equal(f.engine.getSnapshot()[other].quote.account, other);
  await f.engine.execute(account); assert.equal(f.sends(), 0);
});
test("explicit user rejection and proven pre-wallet failure release their own reservations", async () => {
  for (const error of [{code: 4001}, new model.MintTokenNotSubmitted("claim.sessionChanged")]) {
    const f = await reviewed(); f.ports.send = async () => { throw error; }; await f.engine.execute(account); assert.equal(f.record(), null); assert.ok(["rejected", "error"].includes(f.engine.getSnapshot()[account].phase));
  }
});
test("provider gas error or missing/invalid hash never permits an automatic retry, including reload", async () => {
  for (const response of [undefined, "0x1234", new viem.InsufficientFundsError({}), Error("provider private secret")]) {
    const f = await reviewed(); f.ports.send = async () => { if (response instanceof Error) throw {code: -32603, cause: response, privateData: "secret"}; return response; };
    await f.engine.execute(account); assert.equal(f.engine.getSnapshot()[account].phase, "unknown"); assert.ok(f.record()); assert.doesNotMatch(JSON.stringify(f.record()), /secret/);
    const next = createMintTokenEngine(f.ports); next.restore(account); await next.resume(account); await next.review(amount); await next.execute(account); assert.equal(f.sends(), 0); assert.equal(f.receipts(), 0); assert.equal(next.getSnapshot()[account].phase, "unknown");
  }
});
test("hashless pending remains blocked indefinitely and corrupt storage is not erased", async () => {
  const f = await unresolved(); const r = f.record(); f.ports.now = () => 9999999999999; await f.engine.review(amount); await f.engine.resume(account); assert.equal(f.record(), r); assert.equal(f.receipts(), 0);
  const g = fixture(); g.ports.storage.read = () => { throw Error("mint.pendingCorrupt"); }; await g.engine.review(amount); await g.engine.execute(account); assert.equal(g.sends(), 0); assert.equal(g.engine.getSnapshot()[account].error, "mint.pendingCorrupt");
});
test("receipt timeout reload resumes receipt only, without another wallet request", async () => {
  const f = await unresolved(true); assert.equal(f.record().hash, hash); const next = createMintTokenEngine(f.ports); next.restore(account);
  f.ports.receipt = async r => evidence(r); await next.resume(account); assert.equal(next.getSnapshot()[account].phase, "completed"); assert.equal(f.record(), null); assert.equal(f.sends(), 0);
});
test("manual recovery validates the exact hash before attaching it and never sends", async () => {
  const f = await unresolved(); const original = f.record(); f.ports.verifyRecovery = async () => { throw Error("mint.recoveryMismatch"); };
  await f.engine.recover(account, hash); assert.equal(f.record(), original); assert.equal(f.record().hash, undefined);
  f.ports.verifyRecovery = async () => {}; f.ports.receipt = async r => evidence(r); await f.engine.recover(account, hash);
  assert.equal(f.engine.getSnapshot()[account].phase, "completed"); assert.equal(f.record(), null); assert.equal(f.sends(), 0);
});
test("recovery holds lock, rechecks concurrent storage, and aborts after session change", async () => {
  const f = await unresolved(); let checks = 0;
  f.ports.lock = async () => { throw Error("claim.tabBusy"); }; f.ports.verifyRecovery = async () => { checks++; };
  await f.engine.recover(account, hash); assert.equal(checks, 0);
  f.ports.lock = async (_a, fn) => fn(); f.ports.verifyRecovery = async r => { checks++; f.ports.storage.save({...r, hash: hash2}); };
  await f.engine.recover(account, hash); assert.equal(f.record().hash, hash2); assert.equal(f.receipts(), 0);
  const g = await unresolved(); g.ports.verifyRecovery = async () => g.change(); await g.engine.recover(account, hash); assert.equal(g.record().hash, undefined); assert.equal(g.receipts(), 0);
});
test("late provider diagnostics do not overwrite another tab's recovered hash", async () => {
  const f = await reviewed(); f.ports.send = async () => { f.ports.storage.save({...f.record(), hash: hash2}); throw Error("response lost"); };
  await f.engine.execute(account); assert.equal(f.record().hash, hash2); assert.equal(f.record().failure, undefined); assert.equal(f.engine.getSnapshot()[account].warning, "mint.storageWarning");
});
test("successful mint completes independently of API projection and retains receipt-block balance provenance", async () => {
  const f = await reviewed(); f.ports.projected = async () => { throw Error("Mint must never await API projection"); };
  await f.engine.execute(account); const s = f.engine.getSnapshot()[account];
  assert.equal(s.phase, "completed"); assert.equal(s.refreshStatus, "refreshed"); assert.equal(s.balance.source, "erc20-receipt-block"); assert.equal(s.balance.block, s.evidence.block); assert.equal(f.refreshed(), 1);
});
test("receipt success is published before slow reads and survives balance/API failures", async () => {
  const f = await reviewed(); let release;
  f.ports.balanceAt = async () => { assert.equal(f.engine.getSnapshot()[account].phase, "completed"); await new Promise(r => { release = r; }); throw Error("historical state unavailable"); };
  f.ports.refresh = async () => { throw Error("API offline"); };
  const p = f.engine.execute(account); while (!release) await new Promise(r => setImmediate(r));
  assert.equal(f.engine.getSnapshot()[account].refreshStatus, "pending"); release(); await p;
  const s = f.engine.getSnapshot()[account]; assert.equal(s.phase, "completed"); assert.equal(s.evidence.amount, amount); assert.equal(s.balance, undefined); assert.equal(s.warning, "mint.balanceWarning"); assert.equal(s.refreshStatus, "failed"); assert.equal(f.record(), null);
});
test("API refresh failure alone never downgrades successful receipt or chain balance", async () => {
  const f = await reviewed(); f.ports.refresh = async () => { throw Error("API offline"); }; await f.engine.execute(account);
  const s = f.engine.getSnapshot()[account]; assert.equal(s.phase, "completed"); assert.equal(s.warning, "mint.refreshWarning"); assert.equal(s.balance.balance, 9999999n); assert.equal(s.refreshStatus, "failed");
});
test("mismatched balance provenance is discarded without turning mint success into failure", async () => {
  for (const patch of [{block: 122n}, {account: other}, {tokenAddress: stream}, {balance: -1n}, {source: "api-projection"}]) {
    const f = await reviewed(); f.ports.balanceAt = async (r, e) => ({...balance(r, e), ...patch}); await f.engine.execute(account);
    assert.equal(f.engine.getSnapshot()[account].phase, "completed"); assert.equal(f.engine.getSnapshot()[account].balance, undefined); assert.equal(f.engine.getSnapshot()[account].warning, "mint.balanceWarning");
  }
});
test("receipt rejects wrong/missing event, non-mint transfer, emitter, amount, duplicated logs and metadata", async () => {
  const mutations = [f => { f.receipt.logs = []; }, f => { f.receipt.logs.push({...f.log}); }, f => { f.log.address = stream; },
    f => { f.log.data = viem.encodeAbiParameters([{type: "uint256"}], [amount + 1n]); }, f => { f.log.removed = true; }, f => { f.log.logIndex = -1; },
    f => { f.log.transactionHash = hash2; }, f => { f.log.blockHash = hash2; }, f => { f.log.blockNumber = 122n; }, f => { f.log.data = "0x00"; },
    f => { f.log.topics = viem.encodeEventTopics({abi: f.adapter.mintTokenAbi, eventName: "Transfer", args: {from: other, to: account}}); },
    f => { f.log.topics = viem.encodeEventTopics({abi: f.adapter.mintTokenAbi, eventName: "Transfer", args: {from: zero, to: other}}); },
  ];
  for (const mutate of mutations) { const f = receiptFixture(); mutate(f); await assert.rejects(() => f.ports.receipt(f.record, () => {}), /receiptUnavailable/); }
});
test("exact direct calldata OR wrapper with exact authoritative mint event proves success", async () => {
  const f = receiptFixture(); const e = await f.ports.receipt(f.record, () => {}); assert.equal(e.amount, amount); assert.equal(e.logIndex, 2); assert.equal(e.hash, hash); await f.ports.verifyRecovery(f.record, hash);
  f.tx.to = other; f.tx.input = "0x12345678"; assert.equal((await f.ports.receipt(f.record, () => {})).amount, amount); await f.ports.verifyRecovery(f.record, hash);
  f.receipt.logs.push({...f.log, data: viem.encodeAbiParameters([{type: "uint256"}], [amount + 1n]), logIndex: 3}); await assert.rejects(() => f.ports.verifyRecovery(f.record, hash), /recoveryMismatch/);
});
test("direct calldata and transaction hash/from/value/chain/block mismatches never become success", async () => {
  for (const patch of [{from: other}, {hash: hash2}, {value: 1n}, {chainId: 1}, {blockNumber: 122n}, {blockHash: hash2}, {input: "0x12345678"}]) {
    const f = receiptFixture(); Object.assign(f.tx, patch); await assert.rejects(() => f.ports.receipt(f.record, () => {}), /recoveryMismatch/);
  }
  const f = receiptFixture(); f.receipt.transactionHash = hash2; await assert.rejects(() => f.ports.receipt(f.record, () => {}), /receiptUnavailable/);
});
test("unknown wrapper mint, malformed receipts and ambiguous original identity preserve the reservation", async () => {
  const f = receiptFixture(); f.tx.to = other; f.receipt.logs = []; await assert.rejects(() => f.ports.receipt(f.record, () => {}), /receiptUnavailable/);
  const g = receiptFixture(); g.receipt.status = "reverted"; g.tx.from = other; await assert.rejects(() => g.ports.receipt(g.record, () => {}), /recoveryMismatch/);
});
test("receipt block before/equal reviewed block cannot recover an earlier identical mint", async () => {
  for (const n of [119n, 120n]) { const f = receiptFixture(); f.receipt.blockNumber = n; f.tx.blockNumber = n; f.log.blockNumber = n;
    await assert.rejects(() => f.ports.verifyRecovery(f.record, hash), /receiptUnavailable/);
  }
});
test("reverted receipt clears pending only after exact transaction identity is verified", async () => {
  const f = receiptFixture(); f.receipt.status = "reverted"; assert.equal(await f.ports.receipt(f.record, () => {}), "reverted");
  const core = await reviewed(); core.ports.receipt = async () => "reverted"; await core.engine.execute(account); assert.equal(core.engine.getSnapshot()[account].phase, "reverted"); assert.equal(core.record(), null);
});
test("fee replacement follows only same-sender same-nonce transaction and exact mint proof", async () => {
  const f = receiptFixture(), original = {...f.tx}; f.tx.hash = hash2; f.receipt.transactionHash = hash2; f.log.transactionHash = hash2; let changed;
  f.rpc.waitForTransactionReceipt = async options => { options.onReplaced({reason: "repriced", replacedTransaction: original, transaction: f.tx, transactionReceipt: f.receipt}); return f.receipt; };
  const e = await f.ports.receipt(f.record, h => { changed = h; }); assert.equal(e.hash, hash2); assert.equal(changed, hash2);
  f.tx.nonce = 5; await assert.rejects(() => f.ports.receipt(f.record, () => {}), /recoveryMismatch/);
});
test("replacement receipt without replacement proof, wrong original hash or sender is unresolved", async () => {
  for (const mutation of ["missing", "wrong-original", "wrong-sender"]) {
    const f = receiptFixture(), original = {...f.tx}; f.tx.hash = hash2; f.receipt.transactionHash = hash2; f.log.transactionHash = hash2;
    if (mutation === "wrong-original") original.hash = hash2; if (mutation === "wrong-sender") f.tx.from = other;
    f.rpc.waitForTransactionReceipt = async o => { if (mutation !== "missing") o.onReplaced({replacedTransaction: original, transaction: f.tx, transactionReceipt: f.receipt}); return f.receipt; };
    await assert.rejects(() => f.ports.receipt(f.record, () => {}), /receiptUnavailable|recoveryMismatch/);
  }
});
test("proven different direct nonce replacement is terminal, but a wrapper lacking exact proof stays unresolved", async () => {
  const f = receiptFixture(), original = {...f.tx}; f.tx.hash = hash2; f.tx.input = "0x12345678"; f.receipt.transactionHash = hash2; f.receipt.logs = [];
  f.rpc.waitForTransactionReceipt = async o => { o.onReplaced({replacedTransaction: original, transaction: f.tx, transactionReceipt: f.receipt}); return f.receipt; };
  assert.equal(await f.ports.receipt(f.record, () => {}), "replaced");
  f.tx.to = other; await assert.rejects(() => f.ports.receipt(f.record, () => {}), /receiptUnavailable/);
});
test("same-nonce zero-value empty self-send proves cancellation, not mint success", async () => {
  const f = receiptFixture(), original = {...f.tx}; f.tx.hash = hash2; f.tx.to = account; f.tx.input = "0x"; f.receipt.transactionHash = hash2; f.receipt.logs = [];
  f.rpc.waitForTransactionReceipt = async o => { o.onReplaced({reason: "cancelled", replacedTransaction: original, transaction: f.tx, transactionReceipt: f.receipt}); return f.receipt; };
  assert.equal(await f.ports.receipt(f.record, () => {}), "replaced");
  f.tx.nonce = original.nonce + 1; await assert.rejects(() => f.ports.receipt(f.record, () => {}), /recoveryMismatch/);
});
test("recovery of a different known hash requires matching original nonce", async () => {
  const f = receiptFixture(), original = {...f.tx}; f.tx.hash = hash2; f.receipt.transactionHash = hash2; f.log.transactionHash = hash2;
  f.rpc.getTransaction = async ({hash: h}) => h === hash ? original : f.tx;
  await f.ports.verifyRecovery(f.record, hash2); original.nonce = 3; await assert.rejects(() => f.ports.verifyRecovery(f.record, hash2), /recoveryMismatch/);
});
test("replacement engine preserves exact amount/hash/block/log index and does not resend", async () => {
  const f = await reviewed(); f.ports.receipt = async (r, replacement) => { replacement(hash2); return {...evidence({...r, hash: hash2}), logIndex: 8}; };
  await f.engine.execute(account); const s = f.engine.getSnapshot()[account]; assert.equal(s.phase, "completed"); assert.equal(s.evidence.hash, hash2); assert.equal(s.evidence.logIndex, 8); assert.equal(f.record(), null); assert.equal(f.sends(), 1);
});
test("receipt-block balance checks canonical block before and after ERC20 read", async () => {
  const f = receiptFixture(), e = await f.ports.receipt(f.record, () => {}), b = await f.ports.balanceAt(f.record, e);
  assert.equal(b.source, "erc20-receipt-block"); const read = f.calls.find(c => c.functionName === "balanceOf"); assert.equal(read.blockNumber, 121n); assert.equal(read.args[0], account);
  let reads = 0; f.rpc.getBlock = async () => ({hash: ++reads === 1 ? blockHash : hash2}); await assert.rejects(() => f.ports.balanceAt(f.record, e), /receiptUnavailable/);
});
test("send adapter binds LIVE_USDC, zero native value, connected account, exact mint and no transport retry", async () => {
  const f = fixture(); let sent, transportOptions;
  const adapter = loader({viem: {...viem, createPublicClient: () => ({getChainId: async () => 11155111}), custom: (_p, options) => { transportOptions = options; return {}; }, createWalletClient: () => ({writeContract: async q => { sent = q; return hash; }})}})("src/lib/mint-token-chain");
  const ports = adapter.browserMintTokenPorts(f.session, async () => {}); await ports.send(quote(f.token));
  assert.equal(sent.address, usdc); assert.equal(sent.functionName, "mint"); assert.deepEqual([...sent.args], [account, amount]); assert.equal(sent.value ?? 0n, 0n); assert.equal(sent.account, account); assert.equal(sent.chain.id, 11155111); assert.equal(transportOptions.retryCount, 0);
  sent = null; await assert.rejects(() => ports.send({...quote(f.token), account: other}), /sessionChanged/); assert.equal(sent, null);
  f.change(); await assert.rejects(() => ports.send(quote(f.token)), /sessionChanged/); assert.equal(sent, null);
});
test("stored failure metadata is sanitized and strictly validated", () => {
  const r = model.mintTokenRecord(quote(fixture().token), 123000); r.failure = {stage: "wallet", reason: "provider-response", at: 1, code: -32603, privateData: "secret"};
  const decoded = storageModel.decodePendingMintToken(JSON.stringify(r), account); assert.doesNotMatch(JSON.stringify(decoded), /secret/);
  for (const failure of [{stage: "wallet", reason: "provider-response", at: -1}, {stage: "server", reason: "provider-response", at: 1}]) assert.throws(() => storageModel.decodePendingMintToken(JSON.stringify({...r, failure}), account), /pendingCorrupt/);
});
test("a proven pre-wallet failure allows a fresh explicit review after its reservation is cleared", async () => {
  const f = await reviewed(), send = f.ports.send;
  f.ports.send = async () => { throw new model.MintTokenNotSubmitted("claim.sessionChanged"); }; await f.engine.execute(account);
  assert.equal(f.record(), null); f.ports.send = send; await reviewed(f); await f.engine.execute(account); assert.equal(f.sends(), 1);
});
test("hash persistence failure preserves in-memory hash, blocks duplicate, and heals when storage returns", async () => {
  const f = await reviewed(), save = f.ports.storage.save; let fail = true;
  f.ports.storage.save = r => { if (r.hash && fail) throw Error("mint.storageUnavailable"); save(r); };
  await f.engine.execute(account); let s = f.engine.getSnapshot()[account]; assert.equal(s.phase, "completed"); assert.equal(s.evidence.hash, hash); assert.equal(s.warning, "mint.storageWarning"); assert.equal(f.record().hash, undefined);
  await f.engine.review(amount); assert.equal(f.engine.getSnapshot()[account].phase, "unknown"); assert.equal(f.engine.getSnapshot()[account].pending.hash, hash); await f.engine.execute(account); assert.equal(f.sends(), 1);
  fail = false; await f.engine.resume(account); s = f.engine.getSnapshot()[account]; assert.equal(s.phase, "completed"); assert.equal(f.record(), null); assert.equal(f.sends(), 1);
});
test("failed terminal clear stays reserved on reload and requires another verified receipt", async () => {
  const f = await reviewed(), clear = f.ports.storage.clear; f.ports.storage.clear = () => { throw Error("mint.storageUnavailable"); };
  await f.engine.execute(account); assert.equal(f.engine.getSnapshot()[account].phase, "completed"); assert.equal(f.engine.getSnapshot()[account].warning, "mint.storageWarning"); assert.ok(f.record());
  const next = createMintTokenEngine(f.ports); next.restore(account); assert.equal(next.getSnapshot()[account].evidence, undefined);
  f.ports.receipt = async () => { throw Error("RPC offline"); }; await next.resume(account); assert.equal(next.getSnapshot()[account].phase, "unknown"); await next.review(amount); await next.execute(account); assert.equal(f.sends(), 1);
  f.ports.storage.clear = clear; f.ports.receipt = async r => evidence(r); await next.resume(account); assert.equal(next.getSnapshot()[account].phase, "completed"); assert.equal(f.record(), null);
});
test("mismatched evidence never releases an unresolved reservation", async () => {
  for (const patch of [{hash: hash2}, {amount: amount + 1n}, {account: other}, {tokenAddress: stream}, {logIndex: -1}, {block: 120n}]) {
    const f = await reviewed(); f.ports.receipt = async r => ({...evidence(r), ...patch}); await f.engine.execute(account);
    assert.equal(f.engine.getSnapshot()[account].phase, "unknown"); assert.ok(f.record()); await f.engine.review(amount); await f.engine.execute(account); assert.equal(f.sends(), 1);
  }
});
test("read-only resume works without connected wallet and never invokes new-send guard", async () => {
  const f = await unresolved(true); f.ports.session.capture = () => { throw Error("claim.walletRequired"); };
  f.ports.assertNoOtherPending = () => { throw Error("mint.otherPending"); }; f.ports.receipt = async r => evidence(r);
  const next = createMintTokenEngine(f.ports); next.restore(account); await next.resume(account); assert.equal(next.getSnapshot()[account].phase, "completed"); assert.equal(f.sends(), 0);
});
test("invalidation during the execution requote stops before persistence and wallet", async () => {
  const f = await reviewed(); let release;
  f.ports.quote = async t => { await new Promise(r => { release = r; }); return quote(t); };
  const execution = f.engine.execute(account); while (!release) await new Promise(r => setImmediate(r)); f.engine.invalidate(); release(); await execution;
  assert.equal(f.sends(), 0); assert.equal(f.record(), null); assert.equal(f.engine.getSnapshot()[account].error, "claim.sessionChanged");
});
test("manual recovery can persist a known in-memory hash after a failed hash write", async () => {
  const f = await reviewed(), save = f.ports.storage.save;
  f.ports.storage.save = r => { if (r.hash) throw Error("mint.storageUnavailable"); save(r); }; f.ports.receipt = async () => { throw Error("RPC offline"); };
  await f.engine.execute(account); assert.equal(f.record().hash, undefined); assert.equal(f.engine.getSnapshot()[account].pending.hash, hash);
  f.ports.storage.save = save; f.ports.receipt = async r => evidence(r); await f.engine.recover(account, hash);
  assert.equal(f.engine.getSnapshot()[account].phase, "completed"); assert.equal(f.record(), null); assert.equal(f.sends(), 1);
});
test("a recovered replacement storage read-back failure is not a permanent in-memory hold after verified clear", async () => {
  const f = await reviewed(), save = f.ports.storage.save; let failed = false;
  f.ports.storage.save = r => { save(r); if (r.hash === hash2 && !failed) { failed = true; throw Error("mint.storageUnavailable"); } };
  f.ports.receipt = async (r, replacement) => { replacement(hash2); return evidence({...r, hash: hash2}); };
  await f.engine.execute(account); assert.equal(f.record(), null); assert.equal(f.engine.getSnapshot()[account].warning, undefined);
  await f.engine.review(amount); assert.equal(f.engine.getSnapshot()[account].phase, "review");
});
test("focused TypeScript compile resolves shared modules read-only and emits no files", () => {
  const options = {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, lib: ["lib.es2020.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"], strict: true, skipLibCheck: true, noEmit: true};
  const host = ts.createCompilerHost(options), files = ["mint-token-model", "mint-token-storage", "mint-token-engine", "mint-token-chain"].map(n => resolve(root, "src/lib", `${n}.ts`));
  host.resolveModuleNames = (names, containing) => names.map(name => {
    const local = ts.resolveModuleName(name, containing, options, host).resolvedModule; if (local) return local;
    const fallback = resolve(source, "src/lib", basename(containing)); return ts.resolveModuleName(name, fallback, options, host).resolvedModule;
  });
  host.writeFile = () => { throw Error("Typecheck must never write"); };
  const program = ts.createProgram([...files, resolve(source, "src/env.d.ts")], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {getCanonicalFileName: p => p, getCurrentDirectory: () => root, getNewLine: () => "\n"}));
});
