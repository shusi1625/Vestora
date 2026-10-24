import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import net from "node:net";
import Fastify from "fastify";
import { readPublicReadMode, registerPublicReadProtection } from "../src/api/public-read.js";

const calls = { connect: 0, listen: 0, fetch: 0 };
mock.method(net.Socket.prototype, "connect", () => { calls.connect++; throw new Error("Network forbidden"); });
mock.method(net.Server.prototype, "listen", () => { calls.listen++; throw new Error("Network forbidden"); });
mock.method(globalThis, "fetch", () => { calls.fetch++; throw new Error("Network forbidden"); });
after(() => { assert.deepEqual(calls, { connect: 0, listen: 0, fetch: 0 }); mock.restoreAll(); });

const address = `0x${"a".repeat(40)}`;
const defaults = { perIp: 90, total: 300, windowMs: 60_000, concurrent: 2 };
async function harness(t: { after: (fn: () => Promise<void>) => void }, options = {}, enabled = true) {
  const app = Fastify({ logger: false, trustProxy: false });
  registerPublicReadProtection(app, enabled, { ...defaults, ...options });
  let executed = 0;
  app.get("/health", async () => { executed++; return { status: "ok" }; });
  app.get("/streams", async () => { executed++; return { streams: [] }; });
  app.get("/streams/:id", async () => { executed++; return { streamId: "1" }; });
  app.get("/users/:address/trades", async () => { executed++; return { trades: [] }; });
  app.get("/metrics", async () => { executed++; return { PRIVATE: true }; });
  app.get("/listings", async () => { executed++; return { PRIVATE: true }; });
  app.post("/streams", async () => { executed++; return { WRITE: true }; });
  t.after(() => app.close());
  return { app, executed: () => executed,
    read: (url: string, remoteAddress = "203.0.113.10", headers = {}) => app.inject({ method: "GET", url, remoteAddress, headers }) };
}

test("mode defaults off; invalid spellings fail closed at startup", () => {
  assert.equal(readPublicReadMode(undefined), false);
  assert.equal(readPublicReadMode("false"), false);
  assert.equal(readPublicReadMode("true"), true);
  for (const flag of ["TRUE", "1", "", "disabled"]) assert.throws(() => readPublicReadMode(flag));
});
test("public product reads retain JSON; no browser CORS grant or response cache", async (t) => {
  const h = await harness(t);
  for (const url of ["/health", "/streams", "/streams/1", `/users/${address}/trades`]) {
    const r = await h.read(url);
    assert.equal(r.statusCode, 200, url);
    assert.equal(r.headers["cache-control"], "private, no-store");
    assert.equal(r.headers["x-vestora-read-policy"], "public-v1");
    assert.equal(r.headers["access-control-allow-origin"], undefined);
  }
  assert.equal(h.executed(), 4);
});
test("operational, unknown, malformed and query paths never execute a handler", async (t) => {
  const h = await harness(t);
  for (const url of ["/metrics", "/listings", "/market/stats", `/users/${address}/streams`, "/streams?take=100000", "/streams/0", "/streams/01", "/streams/-1", "/streams/%31", "/streams/1/", "/streams/../metrics", "//streams", `/streams/${"1".repeat(79)}`, "/users/0x123/trades"]) {
    assert.equal((await h.read(url)).statusCode, 404, url);
  }
  assert.equal(h.executed(), 0);
});
test("non-GET methods fail before handler/body parsing including HEAD and OPTIONS", async (t) => {
  const h = await harness(t);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const) {
    const r = await h.app.inject({ method, url: "/streams", remoteAddress: "203.0.113.10" });
    assert.equal(r.statusCode, 405, method);
    assert.equal(r.headers.allow, "GET");
  }
  assert.equal(h.executed(), 0);
});
test("GET request bodies cannot enter handlers", async (t) => {
  const h = await harness(t);
  const r = await h.app.inject({ method: "GET", url: "/streams", remoteAddress: "203.0.113.10", payload: "payload" });
  assert.equal(r.statusCode, 413);
  assert.equal(h.executed(), 0);
});
test("per-IP budget spans all public paths and forwarded headers cannot evade it", async (t) => {
  const h = await harness(t, { perIp: 2 });
  assert.equal((await h.read("/streams")).statusCode, 200);
  assert.equal((await h.read("/streams/1")).statusCode, 200);
  const r = await h.read("/health", "203.0.113.10", { "x-forwarded-for": "127.0.0.1", "x-real-ip": "198.51.100.2" });
  assert.equal(r.statusCode, 429);
  assert.ok(Number(r.headers["retry-after"]) >= 1);
  assert.equal(h.executed(), 2);
});
test("total budget also stops rotating real source IPs", async (t) => {
  const h = await harness(t, { total: 2 });
  assert.equal((await h.read("/streams", "203.0.113.1")).statusCode, 200);
  assert.equal((await h.read("/streams", "203.0.113.2")).statusCode, 200);
  assert.equal((await h.read("/streams", "203.0.113.3")).statusCode, 429);
  assert.equal(h.executed(), 2);
});
test("denied paths also consume the public budget", async (t) => {
  const h = await harness(t, { total: 1 });
  assert.equal((await h.read("/metrics")).statusCode, 404);
  assert.equal((await h.read("/streams")).statusCode, 429);
  assert.equal(h.executed(), 0);
});
test("only socket loopback health survives exhaustion, not spoofed forwarded headers", async (t) => {
  const h = await harness(t, { total: 1 });
  await h.read("/streams");
  assert.equal((await h.read("/health", "127.0.0.1")).statusCode, 200);
  assert.equal((await h.read("/health", "::1")).statusCode, 200);
  assert.equal((await h.read("/health", "::ffff:127.0.0.1")).statusCode, 200);
  assert.equal((await h.read("/health", "203.0.113.10", { "x-forwarded-for": "127.0.0.1" })).statusCode, 429);
  assert.equal((await h.read("/metrics", "127.0.0.1")).statusCode, 429);
});
test("concurrency rejects excess before handler and releases successful and failed slots", async (t) => {
  const h = await harness(t, { concurrent: 1 });
  let unblock!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => { unblock = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  h.app.get("/streams/2", async () => { entered(); await gate; return { ok: true }; });
  h.app.get("/streams/3", async () => { throw new Error("fixture failure"); });
  const pending = h.read("/streams/2");
  await started;
  const rejected = await h.read("/streams");
  assert.equal(rejected.statusCode, 503);
  assert.equal(rejected.headers["retry-after"], "1");
  assert.equal(h.executed(), 0);
  unblock();
  assert.equal((await pending).statusCode, 200);
  assert.equal((await h.read("/streams/3")).statusCode, 500);
  assert.equal((await h.read("/streams")).statusCode, 200);
});
test("disabled guard preserves internal/local routes and methods", async (t) => {
  const h = await harness(t, {}, false);
  assert.equal((await h.read("/metrics")).statusCode, 200);
  assert.equal((await h.app.inject({ method: "POST", url: "/streams" })).statusCode, 200);
});
test("socket IP budget remains unspoofable even if a caller enables trustProxy", async () => {
  const app = Fastify({ trustProxy: true });
  try {
    registerPublicReadProtection(app, true, { ...defaults, perIp: 1 });
    app.get("/streams", async () => ({ ok: true }));
    const read = (forwarded: string) => app.inject({ method: "GET", url: "/streams", remoteAddress: "203.0.113.1", headers: { "x-forwarded-for": forwarded } });
    assert.equal((await read("198.51.100.1")).statusCode, 200);
    assert.equal((await read("198.51.100.2")).statusCode, 429);
  } finally { await app.close(); }
});
test("guard refuses invalid limits", async () => {
  const other = Fastify();
  assert.throws(() => registerPublicReadProtection(other, true, { ...defaults, total: 0 }));
  await other.close();
});
