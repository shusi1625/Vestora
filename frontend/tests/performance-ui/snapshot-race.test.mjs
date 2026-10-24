import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {test} from "node:test";
import vm from "node:vm";
import {transformSync} from "esbuild";
import {isAddress} from "viem";
import {z} from "zod";
import {scaledStream} from "../manual-qa/scaled-data.mjs";

const root = resolve(import.meta.dirname, "../..");
const snapshotActionHookStubs={
  "./use-market-action":{useMarketAction:()=>({})},
  "./use-cancel-payment":{useCancelPayment:()=>({})},
  "./use-mint-token":{useMintToken:()=>({})},
  "./use-live-action-history":{useLiveActionHistory:(_address,apiRows,_engines)=>{
    if(!Array.isArray(apiRows))throw new TypeError("Expected useLiveActionHistory API rows argument");
    return {records:apiRows,warning:undefined};
  }},
};
const addressA = "0x1111111111111111111111111111111111111111";
const addressB = "0x2222222222222222222222222222222222222222";
const usdc = "0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9";
const at = 1800000000n;
const iso = seconds => new Date(Number(seconds) * 1000).toISOString();
const tick = () => new Promise(done => setImmediate(done));
const keyOf = config => JSON.stringify(config.queryKey);
const compiled = new Map();

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

function dto(address, streamId) {
  const stream = scaledStream("P01-10", at, String(streamId));
  assert.ok(stream);
  stream.recipient = address;
  stream.currentOwner = address;
  stream.listing.seller = address;
  stream.withdrawnAmount = "7";
  stream.computed.claimableEstimate = String(BigInt(stream.computed.vestedAmount) - 7n);
  stream.computed.remainingReceivable = String(BigInt(stream.depositedAmount) - 7n);
  stream.claims = [{
    id: `claim-${streamId}`, streamId: String(streamId), recipient: address, amount: "7",
    claimedAt: iso(at - 30n), transactionHash: stream.createdTxHash, logIndex: 0,
  }];
  const projection = {
    chainId: 11155111, syncId: "sepolia-v4", status: "synced", projectionStatus: "applied",
    latestProjectedBlock: "100", latestIndexedBlock: "100",
    latestProjectedBlockTimestamp: iso(at), estimateAt: iso(at),
  };
  const {claims: _claims, ...listed} = stream;
  return {
    list: {data: [listed], meta: {projection}},
    detail: {data: stream, meta: {projection}},
    trades: {data: [{
      id: `trade-${streamId}`, streamId: String(streamId), seller: address === addressA ? addressB : addressA,
      buyer: address, price: "900", tradedAt: iso(at - 60n), transactionHash: stream.createdTxHash, logIndex: 1,
    }], meta: {projection}},
    balance: {balances: [{token: "MockUSDC", raw: 123000n + BigInt(streamId)}], gasRaw: 1000n + BigInt(streamId)},
  };
}

function fixture({qa = true} = {}) {
  const configurations = [], apiCalls = [], balanceCalls = [], bindings = [], failures = [], spans = [], attempts = [];
  const plans = [], plansBySignal = new Map(), queryCache = new Map(), modules = new Map();
  let initialized = false, watched = null, serial = 0, queryState = {};
  const deny = name => () => { attempts.push(name); throw new Error(`Unexpected external access: ${name}`); };
  const telemetry = {
    watchedAddress: addressA,
    beginBatch: () => `batch-${++serial}`,
    span: (batchId, name, run) => { spans.push({batchId, name}); return run(); },
    bindSnapshot: (data, batchId) => { bindings.push({data, batchId}); },
    failBatch: (batchId, kind) => { failures.push({batchId, kind}); },
  };
  const wallet = {
    address: null, session: {}, chainId: null, state: "disconnected", error: "", switching: false,
    disconnect() {}, connect() {}, switchChain() {},
  };
  const imports = {
    ...snapshotActionHookStubs,
    react: {useState: initial => {
      if (!initialized) { watched = initial; initialized = true; }
      return [watched, value => { watched = value; }];
    }},
    "@tanstack/react-query": {useQuery: config => {
      configurations.push(config);
      const data = queryCache.get(keyOf(config));
      return {data, isPending: data === undefined, isError: false, isFetching: false, refetch: async () => ({data, isError: false}), ...queryState};
    }},
    viem: {isAddress}, zod: {z},
    "./use-injected-wallet": {useInjectedWallet: () => wallet},
    "./use-claim-transaction": {useClaimTransaction: () => ({})},
    "./use-create-payment": {useCreatePayment: () => ({})},
    "@/lib/ui-measurement": {uiMeasurement: qa ? telemetry : null, runUiAction: (_action, run) => run()},
    "@/lib/live-config": {LIVE_API_BASE: "http://fixture.invalid/api", LIVE_USDC: usdc, LIVE_SYNC_ID: "sepolia-v4"},
    "@/lib/live-chain": {readBalances: async (address, block) => {
      const plan = plans.find(item => item.address === address && !item.balanceStarted);
      assert.ok(plan, `unexpected balance read for ${address}`);
      plan.balanceStarted = true;
      balanceCalls.push({address, block});
      return plan.gates.balance.promise;
    }},
  };
  imports["./live-config"] = imports["@/lib/live-config"];
  const Clock = class extends Date { static now() { return Number(at) * 1000; } };
  const sandbox = {Date: Clock, Error, URL, AbortSignal, AbortController, structuredClone,
    fetch: deny("fetch"), XMLHttpRequest: deny("XMLHttpRequest"), WebSocket: deny("WebSocket")};
  for (const name of ["localStorage", "sessionStorage", "indexedDB", "ethereum"]) {
    Object.defineProperty(sandbox, name, {get: deny(name)});
  }
  function load(file) {
    const path = resolve(root, file.endsWith(".ts") ? file : `${file}.ts`);
    if (modules.has(path)) return modules.get(path).exports;
    const module = {exports: {}};
    modules.set(path, module);
    if (!compiled.has(path)) compiled.set(path, transformSync(readFileSync(path, "utf8"), {loader: "ts", format: "cjs"}).code);
    const require = id => {
      if (Object.hasOwn(imports, id)) return imports[id];
      if (id.startsWith("@/")) return load(resolve(root, "src", id.slice(2)));
      if (id.startsWith(".")) return load(resolve(dirname(path), id));
      throw new Error(`Unexpected dependency ${id}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${compiled.get(path)}\n})`, sandbox, {timeout: 5000})(require, module, module.exports);
    return module.exports;
  }
  const schemas = load("src/lib/live-api.ts");
  imports["@/lib/live-api"] = {...schemas, readApi: async (path, schema, signal, batchId) => {
    const plan = plansBySignal.get(signal);
    assert.ok(plan, `unexpected API read for ${path}`);
    apiCalls.push({path, signal, batchId});
    plan.batchId ??= batchId;
    const stage = path === "/streams" ? "list" : path === `/users/${plan.address}/trades` ? "trades" : path === `/streams/${plan.streamId}` ? "detail" : null;
    assert.ok(stage, `unexpected path ${path}`);
    // This mock deliberately ignores abort; the production query must enforce it.
    const response = await plan.gates[stage].promise;
    const result = schema.parse(response);
    plan.delivered.push(stage);
    return result;
  }};
  const {useLiveSnapshot} = load("src/hooks/use-live-snapshot.ts");
  return {
    configurations, apiCalls, balanceCalls, bindings, failures, spans, attempts, queryCache,
    queryState: value => { queryState = value; },
    render: () => {
      const view = useLiveSnapshot();
      return {view, config: configurations.at(-1)};
    },
    start: (config, streamId = 4) => {
      const address = config.queryKey[2];
      assert.ok(isAddress(address));
      const data = dto(address, streamId);
      schemas.streamListSchema.parse(data.list);
      schemas.detailSchema.parse(data.detail);
      schemas.tradeListSchema.parse(data.trades);
      const gates = Object.fromEntries(["list", "balance", "trades", "detail"].map(stage => [stage, deferred()]));
      const plan = {address, streamId, data, gates, controller: new AbortController(), balanceStarted: false, delivered: [], outcome: "pending"};
      plans.push(plan);
      plansBySignal.set(plan.controller.signal, plan);
      plan.promise = config.queryFn({signal: plan.controller.signal});
      plan.settled = plan.promise.then(result => {
        plan.outcome = "fulfilled";
        queryCache.set(keyOf(config), result);
      }, error => { plan.outcome = "rejected"; plan.error = error; });
      plan.resolveAll = () => {
        for (const [stage, gate] of Object.entries(gates)) gate.resolve(data[stage]);
      };
      return plan;
    },
  };
}

function assertMapped(result, address, streamId) {
  assert.deepEqual(Array.from(result.claims, claim => claim.id), [String(streamId)]);
  assert.equal(result.claims[0].owner, address);
  assert.equal(result.claims[0].deposited, 1000000n + BigInt(streamId) * 1000n);
  assert.equal(result.claims[0].claimed, 7n);
  assert.equal(result.claims[0].token, "MockUSDC");
  assert.equal(result.listings.length, 1);
  assert.equal(result.listings[0].claimId, String(streamId));
  assert.equal(result.listings[0].status, "active");
  assert.equal(result.history.length, 2);
  assert.ok(result.history.every(record => record.accountKey === address));
  assert.deepEqual(Array.from(result.history, record => record.amountRaw), [900n, 7n]);
  assert.equal(result.balance.gasRaw, 1000n + BigInt(streamId));
  assert.equal(result.unsupported, 0);
}

for (const delayed of ["list", "balance", "trades", "detail"]) {
  test(`an old account query delayed at ${delayed} cannot return or bind after abort and a newer result`, async () => {
    const f = fixture();
    const first = f.render();
    assert.equal(first.view.accountKey, addressA);
    const old = f.start(first.config, 4);
    for (const [stage, gate] of Object.entries(old.gates)) {
      if (stage !== delayed) gate.resolve(old.data[stage]);
    }
    await tick();
    assert.equal(old.outcome, "pending");
    assert.equal(old.balanceStarted, delayed !== "list");
    const oldCalls = f.apiCalls.filter(call => call.signal === old.controller.signal);
    assert.equal(oldCalls.length, delayed === "list" ? 1 : delayed === "trades" ? 2 : 3);
    assert.equal(first.view.watchAddress(addressB), true);
    const second = f.render();
    assert.deepEqual(Array.from(first.config.queryKey), ["live-workspace", "http://fixture.invalid/api", addressA]);
    assert.deepEqual(Array.from(second.config.queryKey), ["live-workspace", "http://fixture.invalid/api", addressB]);
    assert.notEqual(keyOf(first.config), keyOf(second.config));
    assert.equal(second.view.accountKey, addressB);
    const current = f.start(second.config, 5);
    old.controller.abort();
    current.resolveAll();
    const result = await current.promise;
    assertMapped(result, addressB, 5);
    assert.equal(old.outcome, "pending");
    assert.equal(f.bindings.length, 1);
    assert.equal(f.bindings[0].batchId, current.batchId);
    assert.equal(f.bindings[0].data, result.claims);
    old.resolveAll();
    await assert.rejects(old.promise, error => error === old.controller.signal.reason);
    await old.settled;
    assert.equal(old.outcome, "rejected");
    assert.equal(old.error.name, "AbortError");
    const expectedDelivered=delayed==="list"?["list"]:delayed==="trades"?["list","trades"]:["detail","list","trades"];
    assert.deepEqual(old.delivered.sort(), expectedDelivered);
    assert.equal(f.apiCalls.filter(call=>call.signal===old.controller.signal).length,oldCalls.length);
    assert.equal(f.bindings.length, 1);
    assert.ok(!f.queryCache.has(keyOf(first.config)));
    assert.ok(f.failures.some(failure => failure.batchId === old.batchId && failure.kind === "AbortError"));
    const active = f.render().view;
    assert.equal(active.accountKey, addressB);
    assert.deepEqual(Array.from(active.claims, claim => claim.id), ["5"]);
    assert.ok(active.records.every(record => record.accountKey === addressB));
    assert.ok(f.apiCalls.filter(call => call.signal === old.controller.signal).every(call => call.batchId === old.batchId));
    assert.ok(f.apiCalls.filter(call => call.signal === current.controller.signal).every(call => call.batchId === current.batchId));
    assert.deepEqual(f.balanceCalls.map(call => [call.address, call.block]).sort(([a], [b]) => a.localeCompare(b)), [[addressA, 100n], [addressB, 100n]]);
    assert.deepEqual(f.attempts, []);
  });
}

test("list and balance completion cannot publish a snapshot before deferred trades and detail history settle", async () => {
  const f = fixture();
  const {config} = f.render();
  const plan = f.start(config);
  plan.gates.list.resolve(plan.data.list);
  plan.gates.balance.resolve(plan.data.balance);
  await tick();
  assert.equal(plan.outcome, "pending");
  assert.equal(f.bindings.length, 0);
  assert.ok(!f.apiCalls.some(call => call.path === "/streams/4"));
  plan.gates.trades.resolve(plan.data.trades);
  await tick();
  assert.ok(f.apiCalls.some(call => call.path === "/streams/4"));
  assert.equal(plan.outcome, "pending");
  assert.equal(f.bindings.length, 0);
  plan.gates.detail.resolve(plan.data.detail);
  const result = await plan.promise;
  assertMapped(result, addressA, 4);
  assert.equal(f.bindings.length, 1);
  assert.equal(f.bindings[0].data, result.claims);
  assert.ok(f.spans.some(span => span.batchId === plan.batchId && span.name === "map-streams"));
  assert.ok(f.spans.some(span => span.batchId === plan.batchId && span.name === "map-history"));
  assert.deepEqual(f.attempts, []);
});

for (const stage of ["trades", "detail"]) {
  test(`failed ${stage} history is null and not a measured empty or zero history`, async () => {
    const f = fixture();
    const {config} = f.render();
    const plan = f.start(config);
    plan.gates.list.resolve(plan.data.list);
    plan.gates.balance.resolve(plan.data.balance);
    if (stage === "detail") plan.gates.trades.resolve(plan.data.trades);
    await tick();
    plan.gates[stage].reject(new Error("history unavailable"));
    const result = await plan.promise;
    assert.equal(result.history, null);
    assert.equal(result.balance, plan.data.balance);
    assert.equal(result.claims.length, 1);
    const {view} = f.render();
    assert.equal(view.historyReady, false);
    assert.deepEqual(Array.from(view.records), []);
    assert.equal(view.balancesReady, true);
    assert.equal(view.gasRaw, 1004n);
    assert.equal(f.bindings.length, 1);
    assert.deepEqual(f.attempts, []);
  });
}

test("failed balance reads remain null with unavailable gas instead of fabricated zero balances", async () => {
  const f = fixture();
  const {config} = f.render();
  const plan = f.start(config);
  plan.gates.list.resolve(plan.data.list);
  plan.gates.trades.resolve(plan.data.trades);
  plan.gates.detail.resolve(plan.data.detail);
  await tick();
  plan.gates.balance.reject(new Error("balances unavailable"));
  const result = await plan.promise;
  assert.equal(result.balance, null);
  assert.equal(result.history.length, 2);
  const {view} = f.render();
  assert.equal(view.balancesReady, false);
  assert.deepEqual(Array.from(view.balances), []);
  assert.equal(view.gasRaw, null);
  assert.equal(view.historyReady, true);
  assert.equal(view.records.length, 2);
  assert.equal(f.bindings.length, 1);
  assert.deepEqual(f.attempts, []);
});

test("account query keys keep completed snapshots separate while a different watched account loads", async () => {
  const f = fixture();
  const first = f.render();
  const a = f.start(first.config, 4);
  a.resolveAll();
  assertMapped(await a.promise, addressA, 4);
  const loadedA = f.render();
  assert.equal(loadedA.view.accountKey, addressA);
  assert.equal(loadedA.view.claims[0].id, "4");
  assert.equal(loadedA.view.watchAddress(addressB), true);
  const loadingB = f.render();
  assert.equal(loadingB.view.accountKey, addressB);
  assert.deepEqual(Array.from(loadingB.view.claims), []);
  assert.deepEqual(Array.from(loadingB.view.records), []);
  assert.equal(loadingB.view.gasRaw, null);
  assert.equal(loadingB.view.balancesReady, false);
  assert.equal(loadingB.view.historyReady, false);
  const b = f.start(loadingB.config, 5);
  b.resolveAll();
  assertMapped(await b.promise, addressB, 5);
  const loadedB = f.render();
  assert.equal(loadedB.view.accountKey, addressB);
  assert.equal(loadedB.view.claims[0].id, "5");
  assert.ok(loadedB.view.records.every(record => record.accountKey === addressB));
  assert.equal(loadedB.view.watchAddress(addressA), true);
  const restoredA = f.render();
  assert.equal(restoredA.view.accountKey, addressA);
  assert.equal(restoredA.view.claims[0].id, "4");
  assert.ok(restoredA.view.records.every(record => record.accountKey === addressA));
  assert.equal(f.queryCache.size, 2);
  assert.deepEqual(f.attempts, []);
});

for (const [isFetching, expected] of [[true, "loading"], [false, "failure"]]) {
  test(`a no-data error ${isFetching ? "still fetching remains loading" : "with no fetch is terminal failure"}`, () => {
    const f = fixture();
    f.queryState({isPending: false, isError: true, isFetching});
    const {view} = f.render();
    assert.equal(view.scenario.dataCondition, expected);
    assert.equal(view.isRefreshing, isFetching);
    assert.deepEqual(Array.from(view.claims), []);
    assert.deepEqual(Array.from(view.records), []);
    assert.equal(view.gasRaw, null);
    assert.equal(view.balancesReady, false);
    assert.equal(view.historyReady, false);
    assert.equal(f.bindings.length, 0);
    assert.deepEqual(f.attempts, []);
  });
}

test("failed background refreshes retain the completed account data while pending and after stopping", async () => {
  const f = fixture();
  const first = f.render();
  const plan = f.start(first.config);
  plan.resolveAll();
  const result = await plan.promise;
  assertMapped(result, addressA, 4);
  for (const isFetching of [true, false]) {
    f.queryState({isPending: false, isError: true, isFetching});
    const {view} = f.render();
    assert.equal(view.scenario.dataCondition, "stale");
    assert.equal(view.isRefreshing, isFetching);
    assert.equal(view.accountKey, addressA);
    assert.equal(view.claims, result.claims);
    assert.equal(view.listings, result.listings);
    assert.equal(view.records, result.history);
    assert.equal(view.balances, result.balance.balances);
    assert.equal(view.gasRaw, 1004n);
    assert.equal(view.balances[0].raw, 123004n);
    assert.equal(view.balancesReady, true);
    assert.equal(view.historyReady, true);
    assert.equal(view.projection, result.projection);
    assert.equal(view.now, result.now);
  }
  assert.equal(f.bindings.length, 1);
  assert.deepEqual(f.attempts, []);
});

for (const qa of [true, false]) {
  test(`${qa ? "QA" : "production"} hook query configuration preserves its retry, polling and focus policy`, async () => {
    const f = fixture({qa});
    let current = f.render();
    if (!qa) {
      assert.equal(current.view.accountKey, "");
      assert.equal(current.view.watchAddress(addressA), true);
      current = f.render();
    }
    const {config} = current;
    assert.equal(config.retry, qa ? false : 1);
    assert.equal(config.staleTime, qa ? Infinity : 10000);
    assert.equal(config.gcTime, 60000);
    assert.equal(config.refetchInterval, qa ? false : 15000);
    assert.equal(config.refetchIntervalInBackground, false);
    assert.equal(config.refetchOnWindowFocus, qa ? false : "always");
    if (qa) assert.equal(config.structuralSharing, false);
    else assert.equal(Object.hasOwn(config, "structuralSharing"), false);
    const plan = f.start(config);
    plan.resolveAll();
    assertMapped(await plan.promise, addressA, 4);
    assert.equal(f.bindings.length, qa ? 1 : 0);
    assert.equal(f.spans.length, qa ? 2 : 0);
    assert.deepEqual(f.attempts, []);
  });
}
