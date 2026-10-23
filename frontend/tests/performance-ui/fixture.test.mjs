import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createUiFixture } from "./fixture.mjs";

const root = resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const account = "0x2222222222222222222222222222222222222222";
const token = "0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9";
const now = 2_000_000_000_000;
const validators = await build({
  stdin: {
    contents: `export * from "./src/lib/live-api"; export * from "./src/lib/live-mapping";`,
    resolveDir: root,
  },
  absWorkingDir: root,
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  external: ["zod"],
  plugins: [{
    name: "isolated-validator-config",
    setup(build) {
      build.onResolve({ filter: /^\.\/live-config$/ }, () => ({ path: "config", namespace: "qa" }));
      build.onLoad({ filter: /.*/, namespace: "qa" }, () => ({
        contents: `export const LIVE_API_BASE=QA_API_BASE; export const LIVE_SYNC_ID="sepolia-v4";`,
      }));
    },
  }],
});

async function fixture(t, options = {}) {
  const service = createUiFixture({ clock: () => now, ...options });
  service.server.listen(0, "127.0.0.1");
  await once(service.server, "listening");
  t.after(async () => {
    service.server.closeAllConnections();
    await new Promise((resolve, reject) => service.server.close(error => error ? reject(error) : resolve()));
  });
  const address = service.server.address();
  assert.equal(address.address, "127.0.0.1");
  assert.ok(address.port > 0);
  const origin = `http://127.0.0.1:${address.port}`;
  const localFetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, origin, "tests may fetch only their ephemeral loopback fixture");
    return fetch(input, init);
  };
  const module = { exports: {} };
  vm.runInNewContext(validators.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: name => {
      assert.equal(name, "zod");
      return require(name);
    },
    QA_API_BASE: `${origin}/api`,
    fetch: localFetch,
    AbortSignal,
    Date,
    Error,
  }, { timeout: 5000 });
  return {
    ...service,
    api: module.exports,
    request: (path, init) => localFetch(`${origin}${path}`, init),
  };
}

function assertIsolated(status, requests, denied = 0) {
  assert.equal(status.requests, requests);
  assert.equal(status.denied, denied);
  assert.equal(status.upstreamRequests, 0);
  assert.equal(status.walletRequests, 0);
  assert.equal(status.rpcRequests, 0);
}

function validateRows(api, payload) {
  const projection = payload.meta.projection;
  const at = api.projectionTime(projection);
  assert.equal(at.toISOString(), projection.latestProjectedBlockTimestamp);
  for (const row of payload.data) {
    assert.equal(row.computed.estimateTimestamp, at.toISOString());
    const claim = api.mapStream(row, projection, token);
    assert.equal(claim.id, row.streamId);
    const deposited = BigInt(row.depositedAmount);
    const withdrawn = BigInt(row.withdrawnAmount);
    const vested = BigInt(row.computed.vestedAmount);
    const start = BigInt(Date.parse(row.startTime) / 1000);
    const end = BigInt(Date.parse(row.endTime) / 1000);
    const time = BigInt(at.getTime() / 1000);
    const elapsed = time <= start ? 0n : time >= end ? end - start : time - start;
    assert.equal(vested, deposited * elapsed / (end - start));
    assert.equal(BigInt(row.computed.claimableEstimate), vested - withdrawn);
    assert.equal(BigInt(row.computed.remainingReceivable), deposited - withdrawn);
    assert.equal(api.mapListing(row).claimId, row.streamId);
    assert.equal(api.mapRecords([row], [], account, at, token).length, 0);
  }
}

for (const count of [100, 1000]) {
  test(`${count} rows and every detail pass production schemas, IDs, accounting and timestamps`, async t => {
    const f = await fixture(t, { count });
    const list = await f.api.readApi("/streams", f.api.streamListSchema);
    assert.equal(list.data.length, count);
    assert.deepEqual(Array.from(list.data, row => row.streamId), Array.from({ length: count }, (_, i) => String(i + 3)));
    assert.equal(new Set(list.data.map(row => row.createdTxHash)).size, count);
    assert.equal(f.api.projectionTime(list.meta.projection).getTime(), now);
    validateRows(f.api, list);
    for (let offset = 0; offset < count; offset += 4) {
      await Promise.all(list.data.slice(offset, offset + 4).map(async row => {
        const detail = await f.api.readApi(`/streams/${row.streamId}`, f.api.detailSchema);
        assert.equal(detail.data.streamId, row.streamId);
        assert.equal(JSON.stringify(detail.data), JSON.stringify(row));
        assert.equal(JSON.stringify(detail.meta), JSON.stringify(list.meta));
        validateRows(f.api, { ...detail, data: [detail.data] });
      }));
    }
    const trades = await f.api.readApi(`/users/${account}/trades`, f.api.tradeListSchema);
    assert.equal(trades.data.length, 0);
    assert.equal(f.api.projectionTime(trades.meta.projection).getTime(), now);
    assertIsolated(f.status(), count + 2);
  });
}

test("fixture counts accepted GETs and denies writes, RPC, unknown accounts and routes", async t => {
  const f = await fixture(t);
  const first = await f.request("/api/streams");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("X-QA-Request-ID"), "fixture-1");
  await first.json();
  let denied = 0;
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal((await f.request("/api/streams", { method })).status, 403);
    denied++;
  }
  for (const path of ["/rpc", "/api/rpc", "/api/streams/0", "/api/streams/01", "/api/streams?limit=1",
    "/api/streams/3/claims", `/api/users/0x${"1".repeat(40)}/trades`]) {
    assert.equal((await f.request(path)).status, 403);
    denied++;
  }
  assert.equal((await f.request("/api/rpc", { method: "POST", body: '{"method":"eth_chainId"}' })).status, 403);
  denied++;
  for (const id of [2, 103]) assert.equal((await f.request(`/api/streams/${id}`)).status, 404);
  const last = await f.request("/api/streams/3");
  assert.equal(last.headers.get("X-QA-Request-ID"), "fixture-4");
  await last.json();
  assertIsolated(f.status(), 4, denied);
});

test("CORS accepts only the two local UI origins and exposes request correlation IDs", async t => {
  const f = await fixture(t);
  for (const port of [4340, 4341]) {
    const origin = `http://127.0.0.1:${port}`;
    const response = await f.request("/api/streams", { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), origin);
    assert.equal(response.headers.get("Access-Control-Expose-Headers"), "X-QA-Request-ID");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    await response.json();
  }
  const denied = ["https://example.invalid", "http://localhost:4341", "http://127.0.0.1:4342", "http://127.0.0.1:4341.attacker.invalid", "null"];
  for (const origin of denied) {
    const response = await f.request("/api/streams", { headers: { Origin: origin } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
  assertIsolated(f.status(), 2, denied.length);
});

test("invalid JSON and HTTP error modes fail through the real API reader", async t => {
  for (const mode of ["invalid-json", "http-error"]) {
    const f = await fixture(t, { mode });
    if (mode === "invalid-json") {
      await assert.rejects(f.api.readApi("/streams", f.api.streamListSchema), error => error.name === "SyntaxError");
    } else {
      await assert.rejects(f.api.readApi("/streams", f.api.streamListSchema), /API HTTP 503/);
    }
    assertIsolated(f.status(), 1);
  }
});

test("pending mode supplies valid valuations with an unapplied indexed block", async t => {
  const f = await fixture(t, { mode: "pending" });
  const payload = await f.api.readApi("/streams", f.api.streamListSchema);
  const projection = payload.meta.projection;
  assert.equal(projection.projectionStatus, "pending");
  assert.ok(BigInt(projection.latestIndexedBlock) > BigInt(projection.latestProjectedBlock));
  assert.equal(f.api.projectionTime(projection).getTime(), now);
  validateRows(f.api, payload);
  assertIsolated(f.status(), 1);
});

test("old-timestamp mode keeps list and details coherent at 121 seconds behind the fixture clock", async t => {
  const f = await fixture(t, { mode: "old-timestamp" });
  const list = await f.api.readApi("/streams", f.api.streamListSchema);
  const detail = await f.api.readApi("/streams/3", f.api.detailSchema);
  assert.equal(list.meta.projection.projectionStatus, "applied");
  assert.equal(list.meta.projection.latestIndexedBlock, list.meta.projection.latestProjectedBlock);
  assert.equal(now - f.api.projectionTime(list.meta.projection).getTime(), 121_000);
  assert.equal(JSON.stringify(detail.meta), JSON.stringify(list.meta));
  validateRows(f.api, list);
  validateRows(f.api, { ...detail, data: [detail.data] });
  assertIsolated(f.status(), 2);
});

test("fixture rejects unsupported sizes, delays and modes before opening a server", () => {
  for (const options of [{ count: 10 }, { count: 10000 }, { delayMs: -1 }, { delayMs: 5001 }, { delayMs: 0.5 }, { mode: "live" }]) {
    assert.throws(() => createUiFixture(options), /Invalid isolated fixture configuration/);
  }
});
