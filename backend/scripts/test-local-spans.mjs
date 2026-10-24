import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { SourceTextModule, SyntheticModule, createContext } from "node:vm";
import { Writable } from "node:stream";
import * as asyncHooks from "node:async_hooks";
import * as perfHooks from "node:perf_hooks";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const scriptBackend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceBackend = resolve(process.env.VESTORA_BACKEND_ROOT ?? scriptBackend);
const repoRequire = createRequire(resolve(sourceBackend, "package.json"));
const ts = repoRequire("typescript");
const Fastify = repoRequire("fastify");
const cors = repoRequire("@fastify/cors");
const rateLimit = repoRequire("@fastify/rate-limit");
const { isAddress } = repoRequire("viem");
const networkCalls = { listen: 0, connect: 0, fetch: 0 };
for (const [target, method, key] of [
  [net.Server.prototype, "listen", "listen"],
  [net.Socket.prototype, "connect", "connect"],
  [globalThis, "fetch", "fetch"],
]) {
  mock.method(target, method, () => {
    networkCalls[key]++;
    throw new Error(`Network forbidden in this test: ${key}`);
  });
}
after(() => {
  assert.deepEqual(networkCalls, { listen: 0, connect: 0, fetch: 0 });
  mock.restoreAll();
});

const address = "0x1111111111111111111111111111111111111111";
const secret = "PRIVATE_KEY_SQL_PAYLOAD_MUST_NOT_BE_LOGGED";
const fixedNow = Date.UTC(2026, 9, 23, 1);
const at = new Date(fixedNow - 60_000);
const listingStatus = { ACTIVE: "ACTIVE", CANCELED: "CANCELED", SOLD: "SOLD", INVALIDATED: "INVALIDATED" };
const stream = {
  streamId: 1n, sender: address, recipient: address, currentOwner: address, token: address,
  depositedAmount: "1000", withdrawnAmount: "10", startTime: new Date(fixedNow - 120_000),
  endTime: new Date(fixedNow + 120_000), cancelable: true, canceledAt: null,
  createdTxHash: "fixture-transaction", updatedAt: at,
};
const listing = {
  streamId: 1n, seller: address, buyer: null, price: "700", status: "ACTIVE", listedAt: at,
  soldAt: null, canceledAt: null, invalidatedAt: null, listingTxHash: "fixture-listing",
  boughtTxHash: null, canceledTxHash: null, invalidatedTxHash: null, updatedAt: at,
};
const trade = {
  id: "fixture-trade", streamId: 1n, seller: address, buyer: address, price: "700",
  tradedAt: at, transactionHash: "fixture-trade-transaction", logIndex: 0, createdAt: at,
};
const claim = {
  id: "fixture-claim", streamId: 1n, recipient: address, amount: "10", claimedAt: at,
  transactionHash: "fixture-claim-transaction", logIndex: 0, createdAt: at,
};
function deferred() {
  let resolveGate;
  const promise = new Promise((resolve) => { resolveGate = resolve; });
  return { promise, resolve: resolveGate };
}
function fixture(options = {}) {
  const calls = [];
  const counts = new Map();
  const f = { calls, counts, clock: fixedNow, ...options };
  async function invoke(name, args, fallback) {
    const count = (counts.get(name) ?? 0) + 1;
    counts.set(name, count);
    calls.push({ name, args });
    await f.before?.(name, args, count);
    return fallback;
  }
  f.rpc = () => invoke("rpc", undefined, 102n);
  const delegates = {
    syncState: { findUnique: { latestIndexedBlock: 100n, latestIndexedBlockTimestamp: at, updatedAt: at } },
    projectionState: { findUnique: { latestProjectedBlock: 100n, latestProjectedBlockTimestamp: at, appliedAt: at } },
    streamProjection: { findMany: [stream], findUnique: stream, count: 1 },
    listingProjection: { findMany: [listing], findUnique: listing, groupBy: [{ status: "ACTIVE", _count: { status: 1 } }] },
    tradeProjection: { findMany: [trade], count: 1 },
    claimProjection: { findMany: [claim] },
  };
  f.db = Object.fromEntries(Object.entries(delegates).map(([model, methods]) => [
    model, Object.fromEntries(Object.entries(methods).map(([method, value]) => [
      method, (args) => invoke(`${model}.${method}`, args, value),
    ])),
  ]));
  f.prisma = {
    ...f.db,
    async $transaction(callback, txOptions) {
      await invoke("transaction.acquire", txOptions);
      const result = await callback(f.db);
      await invoke("transaction.commit");
      return result;
    },
    $disconnect: () => invoke("disconnect"),
  };
  f.health = () => invoke("health");
  f.indexer = () => invoke("metrics.indexer", undefined, { status: "fixture" });
  f.database = () => invoke("metrics.database", undefined, { status: "ok", rowCounts: { streams: 1 } });
  return f;
}

function transpile(source, fileName) {
  const result = ts.transpileModule(source, {
    fileName,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, strict: true },
    reportDiagnostics: true,
  });
  assert.deepEqual(result.diagnostics ?? [], [], `Syntax diagnostics: ${fileName}`);
  return result.outputText;
}

// Only these modules can be evaluated. Real env/Prisma/chain modules never load.
const readableModules = new Set([
  "src/app.ts", "src/api/local-spans.ts", "src/api/sync-context.ts", "src/api/errors.ts",
  "src/api/public-read.ts",
  "src/api/serializers.ts", "src/api/validation.ts", "src/api/routes/index.ts",
  "src/api/routes/streams.ts", "src/api/routes/listings.ts", "src/api/routes/market.ts", "src/api/routes/users.ts",
]);
function sourceFile(id) {
  assert.ok(readableModules.has(id), `Unexpected module (network/real dependency forbidden): ${id}`);
  const local = resolve(scriptBackend, id);
  return existsSync(local) ? local : resolve(sourceBackend, id);
}
async function harness(t, { flag = "true", fake = fixture(), decorate, publicMode = false } = {}) {
  const logs = [];
  const output = new Writable({ write(chunk, _encoding, done) {
    for (const line of String(chunk).trim().split("\n")) if (line) logs.push(JSON.parse(line));
    done();
  } });
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fake.clock])); }
    static now() { return fake.clock; }
  }
  const context = createContext({
    process: { env: flag === null ? {} : { LOCAL_API_SPANS: flag } },
    Date: FixtureDate, Buffer, setTimeout, clearTimeout, setImmediate, clearImmediate,
  });
  const cache = new Map();
  function synthetic(id, exports) {
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context, identifier: id });
  }
  const deps = {
    fastify: { default: (opts) => Fastify({ ...opts, logger: { ...opts.logger, stream: output } }), LogController: Fastify.LogController },
    "@fastify/cors": { default: cors },
    "@fastify/rate-limit": { default: rateLimit },
    "@prisma/client": { Prisma: { TransactionIsolationLevel: { RepeatableRead: "RepeatableRead" } }, ListingStatus: listingStatus },
    viem: { isAddress },
    "node:async_hooks": { AsyncLocalStorage: asyncHooks.AsyncLocalStorage },
    "node:perf_hooks": { performance: perfHooks.performance },
    "src/config/env.ts": { env: { logLevel: "info", publicReadMode: publicMode, indexerMetricsCacheTtlMs: 10_000, indexerSyncId: "fixture", sepoliaChainId: 11155111 } },
    "src/db/prisma.ts": { prisma: fake.prisma, checkDatabaseConnection: fake.health },
    "src/indexer/chain.ts": { publicClient: { getBlockNumber: fake.rpc }, getSafeBlockNumber: (n) => n - 2n },
    "src/db/metrics.ts": { getDatabaseMetrics: fake.database },
    "src/indexer/metrics.ts": { getIndexerMetrics: fake.indexer },
    "src/api/request-metrics.ts": { getApiMetrics: () => ({ fixture: true }), recordApiResponse: (sample) => fake.calls.push({ name: "record.response", args: sample }) },
  };
  function load(id) {
    if (cache.has(id)) return cache.get(id);
    let module;
    if (deps[id]) module = synthetic(id, deps[id]);
    else {
      const file = sourceFile(id);
      module = new SourceTextModule(transpile(readFileSync(file, "utf8"), file), { context, identifier: id });
    }
    cache.set(id, module);
    return module;
  }
  const appModule = load("src/app.ts");
  await appModule.link((specifier, referencing) => {
    const id = specifier.startsWith(".")
      ? relative(sourceBackend, resolve(sourceBackend, dirname(referencing.identifier), specifier)).split(sep).join("/").replace(/\.js$/, ".ts")
      : specifier;
    return load(id);
  });
  await appModule.evaluate();
  const app = appModule.namespace.buildApp();
  // This fails if someone accidentally starts a server instead of inject().
  t.after(async () => { await app.close(); assert.equal(app.server.listening, false); });
  const helper = cache.get("src/api/local-spans.ts")?.namespace;
  decorate?.(app, helper);
  await app.ready();
  return {
    app, logs, fake, helper,
    spans: () => logs.filter((log) => log.msg === "local api span"),
    async inject(url) { return app.inject(typeof url === "string" ? { method: "GET", url } : url); },
  };
}
function one(h, name, response) {
  const id = response?.headers["x-request-id"];
  const matches = h.spans().filter((span) => span.span === name && (id === undefined || span.requestId === id));
  assert.equal(matches.length, 1, `${name}: expected exactly one span for ${id ?? "all requests"}`);
  return matches[0];
}

test("1. current allowlisted TypeScript modules have no syntax diagnostics", () => {
  for (const id of readableModules) {
    const file = sourceFile(id);
    transpile(readFileSync(file, "utf8"), file);
  }
});

test("2. default off and non-literal-true flags emit no spans or ID header", async (t) => {
  for (const flag of [null, "false", "TRUE", "1"]) {
    const h = await harness(t, { flag });
    const response = await h.inject("/streams");
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["x-request-id"], undefined);
    assert.equal(h.spans().length, 0);
    assert.equal(h.fake.counts.get("rpc"), 1);
  }
});

test("3. current source off/on response JSON and DB/RPC calls match", async (t) => {
  const disabled = await harness(t, { flag: null });
  const enabled = await harness(t);
  for (const url of ["/health", "/streams", "/streams/1", "/listings?status=ACTIVE", "/market/stats", `/users/${address}/streams`, `/users/${address}/trades`, "/metrics"]) {
    const before = await disabled.inject(url);
    const after = await enabled.inject(url);
    assert.equal(after.statusCode, 200, url);
    assert.deepEqual(after.json(), before.json(), url);
    assert.ok(after.headers["x-request-id"]);
    one(enabled, "api.request", after);
  }
  const dependencyCalls = (h) => h.fake.calls.filter((call) => call.name !== "record.response");
  assert.deepEqual(structuredClone(dependencyCalls(enabled)), structuredClone(dependencyCalls(disabled)));
});

test("4. injected RPC/acquisition/sync/domain delays have separate inclusive spans", async (t) => {
  const delayed = new Set(["rpc", "transaction.acquire", "syncState.findUnique", "projectionState.findUnique", "streamProjection.findMany"]);
  const h = await harness(t, { fake: fixture({ before: async (name) => { if (delayed.has(name)) await delay(20); } }) });
  const response = await h.inject("/streams");
  assert.equal(response.statusCode, 200);
  for (const name of ["freshness.rpc", "snapshot.acquire", "sync.state", "sync.projection", "query.stream.find_many"]) {
    assert.ok(one(h, name, response).durationMs >= 15, name);
  }
  const spanNames = ["api.request", "api.before_handler", "api.handler", "api.serialize", "api.send", "snapshot.transaction", "snapshot.callback", "snapshot.domain"];
  for (const name of spanNames) assert.equal(one(h, name, response).status, "ok");
  assert.ok(one(h, "snapshot.callback").durationMs >= one(h, "snapshot.domain").durationMs);
  const names = h.fake.calls.map((call) => call.name);
  assert.ok(names.indexOf("rpc") < names.indexOf("transaction.acquire"));
  assert.ok(names.indexOf("syncState.findUnique") < names.indexOf("projectionState.findUnique"));
  assert.ok(names.indexOf("projectionState.findUnique") < names.indexOf("streamProjection.findMany"));
  const tx = h.fake.calls.find((call) => call.name === "transaction.acquire").args;
  assert.equal(tx.isolationLevel, "RepeatableRead");
  assert.equal(tx.timeout, 30_000);
});

test("5. freshness failure keeps saved projection basis and marks RPC error only", async (t) => {
  const h = await harness(t, { fake: fixture({ before(name) { if (name === "rpc") throw new Error(secret); } }) });
  const response = await h.inject("/streams");
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().meta.projection.status, "rpc_error");
  assert.equal(response.json().meta.projection.estimateAt, at.toISOString());
  assert.equal(one(h, "freshness.rpc").status, "error");
  assert.equal(one(h, "snapshot.transaction").status, "ok");
  assert.equal(JSON.stringify(h.logs).includes(secret), false);
});

test("6. query exception propagates once through parents and next request recovers", async (t) => {
  const h = await harness(t, { fake: fixture({ before(name, _args, count) {
    if (name === "streamProjection.findMany" && count === 1) throw new Error(secret);
  } }) });
  const failed = await h.inject("/streams");
  assert.equal(failed.statusCode, 500);
  assert.deepEqual(failed.json(), { error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  for (const name of ["query.stream.find_many", "snapshot.domain", "snapshot.callback", "snapshot.transaction", "api.request"]) {
    assert.equal(one(h, name, failed).status, "error", name);
  }
  assert.equal(one(h, "snapshot.acquire", failed).status, "ok");
  const next = await h.inject("/streams");
  assert.equal(next.statusCode, 200);
  assert.notEqual(next.headers["x-request-id"], failed.headers["x-request-id"]);
  assert.equal(one(h, "api.request", next).status, "ok");
  assert.equal(JSON.stringify(h.logs).includes(secret), false);
});

test("7. transaction entry failure ends acquisition once without callback/query", async (t) => {
  const h = await harness(t, { fake: fixture({ async before(name) {
    if (name === "transaction.acquire") { await delay(20); throw new Error(secret); }
  } }) });
  const response = await h.inject("/streams");
  assert.equal(response.statusCode, 500);
  assert.equal(one(h, "snapshot.acquire").status, "error");
  assert.ok(one(h, "snapshot.acquire").durationMs >= 15);
  assert.equal(one(h, "snapshot.transaction").status, "error");
  assert.equal(h.spans().some((span) => span.span === "snapshot.callback" || span.span.startsWith("sync.")), false);
});

test("8. real concurrent Fastify.inject isolates ALS IDs across interleaved RPC/queries", async (t) => {
  const bothRpc = deferred();
  const h = await harness(t, { fake: fixture({ async before(name, args, count) {
    if (name === "rpc") {
      if (count === 2) bothRpc.resolve();
      await bothRpc.promise;
    }
    if (name === "streamProjection.findUnique" && args.where.streamId === 1n) await delay(40);
  } }) });
  const [slow, fast] = await Promise.all([h.inject("/streams/1"), h.inject("/streams/2")]);
  assert.equal(slow.statusCode, 200);
  assert.equal(fast.statusCode, 200);
  assert.notEqual(slow.headers["x-request-id"], fast.headers["x-request-id"]);
  for (const response of [slow, fast]) {
    for (const name of ["freshness.rpc", "sync.state", "sync.projection", "snapshot.callback", "query.stream.find_unique", "query.listing.find_unique", "query.claim.find_many", "api.request"]) one(h, name, response);
    assert.ok(h.spans().filter((span) => span.requestId === response.headers["x-request-id"]).every((span) => span.route === "streams.detail"));
  }
  assert.ok(one(h, "query.stream.find_unique", slow).durationMs >= 30);
  assert.ok(one(h, "query.stream.find_unique", slow).durationMs > one(h, "query.stream.find_unique", fast).durationMs);
});

test("9. nested names are nonduplicated, siblings independent, manual finish idempotent", async (t) => {
  const h = await harness(t, { decorate(app, spans) {
    app.get("/nested", async () => {
      const finish = spans.startLocalSpan("sync.state");
      finish(); finish("error");
      await spans.withLocalSpan("snapshot.domain", () => spans.withLocalSpan("snapshot.domain", async () => {
        await Promise.all([1, 2].map(() => spans.withLocalSpan("query.trade.count", () => delay(10))));
      }));
      await spans.withLocalSpan(secret, () => undefined);
      return { ok: true };
    });
  } });
  assert.equal((await h.inject("/nested")).statusCode, 200);
  one(h, "snapshot.domain");
  assert.equal(one(h, "sync.state").status, "ok");
  assert.equal(h.spans().filter((span) => span.span === "query.trade.count").length, 2);
  assert.equal(JSON.stringify(h.logs).includes(secret), false);
});

test("10. metrics new/join/hit/TTL preserve one shared collection and owner branch IDs", async (t) => {
  const started = deferred(); const release = deferred(); let branches = 0;
  const h = await harness(t, { fake: fixture({ async before(name) {
    if (name === "metrics.indexer" || name === "metrics.database") {
      if (++branches === 2) started.resolve();
      await release.promise;
    }
  } }) });
  const first = h.inject("/metrics");
  await started.promise;
  const second = h.inject("/metrics");
  await delay(10);
  release.resolve();
  const [owner, joined] = await Promise.all([first, second]);
  const hit = await h.inject("/metrics");
  for (const [response, name] of [[owner, "metrics.new"], [joined, "metrics.join"], [hit, "metrics.hit"]]) {
    assert.equal(response.statusCode, 200);
    one(h, name, response);
  }
  assert.equal(owner.json().cache.operationalMetricsHit, false);
  assert.equal(joined.json().cache.operationalMetricsHit, false);
  assert.equal(hit.json().cache.operationalMetricsHit, true);
  assert.equal(owner.json().cache.operationalMetricsCollectedAt, joined.json().cache.operationalMetricsCollectedAt);
  for (const name of ["metrics.collection", "metrics.indexer", "metrics.database"]) {
    assert.equal(one(h, name).requestId, owner.headers["x-request-id"]);
  }
  assert.equal(h.fake.counts.get("metrics.indexer"), 1);
  assert.equal(h.fake.counts.get("metrics.database"), 1);
  h.fake.clock += 10_001;
  const expired = await h.inject("/metrics");
  one(h, "metrics.new", expired);
  assert.equal(expired.json().cache.operationalMetricsHit, false);
  assert.equal(h.fake.counts.get("metrics.indexer"), 2);
});

test("11. metrics shared rejection records branch error, clears pending, then retries", async (t) => {
  const started = deferred(); const release = deferred();
  const h = await harness(t, { fake: fixture({ async before(name, _args, count) {
    if (name === "metrics.database" && count === 1) { started.resolve(); await release.promise; throw new Error(secret); }
  } }) });
  const ownerPromise = h.inject("/metrics");
  await started.promise;
  const joinPromise = h.inject("/metrics");
  await delay(10); release.resolve();
  const [owner, joined] = await Promise.all([ownerPromise, joinPromise]);
  assert.equal(owner.statusCode, 500);
  assert.equal(joined.statusCode, 500);
  assert.equal(one(h, "metrics.new", owner).status, "error");
  assert.equal(one(h, "metrics.join", joined).status, "error");
  assert.equal(one(h, "metrics.database").status, "error");
  assert.equal(one(h, "metrics.indexer").status, "ok");
  assert.equal(one(h, "metrics.collection").requestId, owner.headers["x-request-id"]);
  const retry = await h.inject("/metrics");
  assert.equal(retry.statusCode, 200);
  assert.equal(one(h, "metrics.new", retry).status, "ok");
  assert.equal(h.fake.counts.get("metrics.database"), 2);
  assert.equal(JSON.stringify(h.logs).includes(secret), false);
});

test("12. privacy whitelist, early error, string payload and serialization-error lifecycle", async (t) => {
  const h = await harness(t, { decorate(app) {
    app.get("/string", async () => secret);
    app.get("/bad-json", async () => ({ secret, bad: 1n }));
  } });
  const responses = [];
  for (const url of [`/users/${address}/streams?api_key=${secret}`, `/listings?status=${secret}`, `/unknown/${address}?key=${secret}`, "/string", "/bad-json"]) {
    responses.push(await h.inject({ url, headers: { "x-request-id": secret, authorization: secret } }));
  }
  assert.deepEqual(responses.map((response) => response.statusCode), [200, 400, 404, 200, 500]);
  for (const response of responses) {
    assert.notEqual(response.headers["x-request-id"], secret);
    one(h, "api.request", response);
  }
  assert.equal(h.spans().filter((span) => span.requestId === responses[3].headers["x-request-id"] && span.span === "api.serialize").length, 0);
  one(h, "api.serialize", responses[4]);
  const metadata = new Set(["level", "time", "pid", "hostname", "msg"]);
  const allowed = ["durationMs", "requestId", "route", "span", "status"];
  for (const log of h.logs) {
    assert.equal(log.msg, "local api span");
    assert.deepEqual(Object.keys(log).filter((key) => !metadata.has(key)).sort(), allowed);
    assert.ok(Number.isFinite(log.durationMs) && log.durationMs >= 0);
  }
  assert.equal(JSON.stringify(h.logs).includes(secret), false);
  assert.equal(JSON.stringify(h.logs).includes(address), false);
  assert.deepEqual(networkCalls, { listen: 0, connect: 0, fetch: 0 });
});

test("13. public mode blocks operational routes and writes before real app dependencies", async (t) => {
  const h = await harness(t, { flag: null, publicMode: true });
  for (const [method, url, expected] of [["GET", "/metrics", 404], ["GET", "/listings", 404], ["POST", "/streams", 405], ["OPTIONS", "/streams", 405]]) {
    const response = await h.inject({ method, url, remoteAddress: "203.0.113.10" });
    assert.equal(response.statusCode, expected);
    assert.equal(response.headers["cache-control"], "private, no-store");
    assert.equal(response.headers["x-vestora-read-policy"], "public-v1");
  }
  assert.equal(h.fake.calls.some((call) => call.name !== "record.response"), false);
  assert.equal(h.logs.length, 0);
});

test("14. public mode keeps actual projection JSON and dependency calls unchanged", async (t) => {
  const internal = await harness(t, { flag: null });
  const publicApp = await harness(t, { flag: null, publicMode: true });
  for (const url of ["/health", "/streams", "/streams/1", `/users/${address}/trades`]) {
    const before = await internal.inject(url);
    const after = await publicApp.inject({ method: "GET", url, remoteAddress: "203.0.113.10", headers: { origin: "https://untrusted.invalid" } });
    assert.equal(after.statusCode, 200);
    assert.deepEqual(after.json(), before.json());
    assert.equal(after.headers["access-control-allow-origin"], undefined);
  }
  const dependencyCalls = (h) => h.fake.calls.filter((call) => call.name !== "record.response");
  assert.deepEqual(structuredClone(dependencyCalls(publicApp)), structuredClone(dependencyCalls(internal)));
});
