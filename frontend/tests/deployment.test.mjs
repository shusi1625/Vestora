import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readProxy } from "../server/read-proxy.mjs";

const origin = "http://backend.example:3001";
const request = (path, options) => new Request(`https://vestora.example${path}`, options);
const json = () => Response.json({ data: [], meta: { projection: { chainId: 11155111 } } });
test("GET paths preserve raw JSON without forwarding wallet/cookie credentials", async () => {
  for (const path of ["streams", "streams/3", "health", `users/0x${"a".repeat(40)}/trades`]) {
    let call;
    const response = await readProxy(request(`/api/read?path=${path}`, { headers: { Cookie: "private", Authorization: "Bearer private" } }), {
      origin, fetchImpl: async (url, options) => { call = { url: String(url), options }; return json(); },
    });
    assert.equal(response.status, 200);
    assert.equal(call.url, `${origin}/${path}`);
    assert.deepEqual(call.options.headers, { Accept: "application/json" });
    assert.equal(call.options.redirect, "error");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), await json().json());
  }
});
test("original prefix requests work and keep unknown API routes out of the SPA", async () => {
  assert.equal((await readProxy(request("/vestora-api/streams"), { origin, fetchImpl: async () => json() })).status, 200);
  let calls = 0;
  for (const path of ["/api/read?path=metrics", "/api/read?path=streams&path=health", "/api/read?path=streams&target=private", "/api/read?path=../health", "/api/read?path=https://evil.example", "/api/read?path=streams/0", "/vestora-api/streams?target=evil", "/api/unknown"]) {
    const response = await readProxy(request(path), { origin, fetchImpl: async () => { calls++; return json(); } });
    assert.ok([400, 404].includes(response.status), path);
  }
  assert.equal(calls, 0);
});
test("writes and cross-origin browser requests are rejected before transport", async () => {
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]) {
    const response = await readProxy(request("/api/read?path=streams", { method }), { origin, fetchImpl: async () => { throw Error("transport must not run"); } });
    assert.equal(response.status, 405);
  }
  assert.equal((await readProxy(request("/api/read?path=streams", { headers: { Origin: "https://other.example" } }), { origin })).status, 403);
});
test("missing or credential-bearing upstream configuration fails closed", async () => {
  for (const value of [undefined, "not-a-url", "file:///private", "https://user:password@example.com", "https://example.com/path", "https://example.com?query=1"]) {
    assert.equal((await readProxy(request("/api/read?path=streams"), { origin: value })).status, 503);
  }
});
test("redirect and non-JSON responses are not forwarded", async () => {
  for (const response of [new Response(null, { status: 302, headers: { Location: "http://private" } }), new Response("<html>error</html>")]) {
    assert.equal((await readProxy(request("/api/read?path=streams"), { origin, fetchImpl: async () => response })).status, 502);
  }
});
test("response byte cap covers declared and streaming lengths", async () => {
  for (const response of [new Response("12345", { headers: { "Content-Type": "application/json", "Content-Length": "5" } }), new Response("12345", { headers: { "Content-Type": "application/json" } })]) {
    assert.equal((await readProxy(request("/api/read?path=streams"), { origin, maxBytes: 4, fetchImpl: async () => response })).status, 502);
  }
});
test("timeout is bounded, has no retry, and does not expose internal errors", async () => {
  let calls = 0;
  const response = await readProxy(request("/api/read?path=streams"), { origin, timeoutMs: 5, fetchImpl: async (_url, { signal }) => {
    calls++; return new Promise((_, reject) => signal.addEventListener("abort", () => reject(Error("private upstream failure")), { once: true }));
  } });
  assert.equal(response.status, 504); assert.equal(calls, 1);
  assert.equal(JSON.stringify(await response.json()).includes("private"), false);
});
test("production config keeps QA and local environment files out of deployment", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.framework, "vite"); assert.equal(config.outputDirectory, "dist");
  assert.equal(config.buildCommand, "npm run build:prod"); assert.deepEqual(config.regions, ["syd1"]);
  assert.equal(config.rewrites[0].destination, "/api/read?path=:path*");
  const ignore = readFileSync(new URL("../.vercelignore", import.meta.url), "utf8");
  for (const entry of [".env*", "docs/", "tests/", "qa-ui-dist/", "qa-ui-actual-dist/", "node_modules/"]) assert.ok(ignore.split("\n").includes(entry));
});
