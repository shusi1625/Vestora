import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import ts from "typescript";

const gateway = "http://127.0.0.1:4393";
const actualGateway = "http://127.0.0.1:4394";
const trades = "/api/users/0x2222222222222222222222222222222222222222/trades";
const bundled = await build({
  entryPoints: [fileURLToPath(new URL("./runtime.ts", import.meta.url))],
  bundle: true,
  write: false,
  platform: "browser",
  format: "cjs",
  external: ["react"],
  define: { "import.meta.env": "QA_ENV" },
});

function browser({ supportedEntryTypes, resourceTiming = true, env = {}, fetchMock } = {}) {
  const calls = [];
  const frames = new Map(), scheduledFrames = new Map(), timers = new Map(), effects = [];
  const listeners = { document: new Map(), window: new Map(), performance: new Map() };
  const bufferSizes = [], observers = [], progress = { dataset: {}, textContent: "" };
  let at = 0, serial = 0, focused = true, wallAt = Date.now();
  const eventTarget = handlers => ({
    addEventListener(type, listener, options) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push({ listener, options });
    },
    dispatch(type, event = {}) {
      for (const { listener } of [...handlers.get(type) ?? []]) listener(event);
    },
  });
  const location = new URL(`http://127.0.0.1:${env.VITE_QA_MODE === "actual-api" ? 4342 : 4341}/tests/performance-ui/index.html`);
  const window = {
    ...eventTarget(listeners.window),
    location,
    setTimeout(callback, delay) {
      const id = ++serial;
      timers.set(id, { callback, deadline: at + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
    async fetch(input, init) {
      assert.equal(this, window, "native fetch must retain its receiver");
      const signal = init.signal ?? (input instanceof Request ? input.signal : undefined);
      calls.push({ input, init, signal });
      signal?.throwIfAborted();
      if (fetchMock) return fetchMock({ input, init, signal }, calls.length);
      return new Response("{}", { headers: { "Content-Type": "application/json" } });
    },
  };
  const document = {
    ...eventTarget(listeners.document),
    visibilityState: "visible",
    hasFocus: () => focused,
    getElementById: id => id === "qa-input-progress" ? progress : null,
    querySelector: () => null,
  };
  const performance = {
    ...eventTarget(listeners.performance),
    now: () => at,
    timeOrigin: 0,
    setResourceTimingBufferSize: size => bufferSizes.push(size),
    ...(resourceTiming ? { getEntriesByType: () => [] } : {}),
  };
  class Observer {
    static supportedEntryTypes = supportedEntryTypes;
    constructor() { observers.push(this); }
    observe(options) { this.options = options; }
    disconnect() {}
  }
  const module = { exports: {} };
  vm.runInNewContext(bundled.outputFiles[0].text, {
    module,
    exports: module.exports,
    require: name => {
      assert.equal(name, "react");
      return { useLayoutEffect: effect => { effects.push(effect()); } };
    },
    QA_ENV: env,
    window,
    location,
    URL,
    Request,
    Headers,
    AbortController,
    TextDecoder,
    Date: class extends Date { static now() { return wallAt; } },
    performance,
    ...(supportedEntryTypes ? { PerformanceObserver: Observer } : {}),
    requestAnimationFrame: callback => {
      const id = ++serial;
      frames.set(id, callback);
      scheduledFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: id => frames.delete(id),
    document,
    structuredClone,
    innerWidth: 1280,
    innerHeight: 720,
  }, { timeout: 5000 });
  return {
    runtime: module.exports, window, document, performance, location, calls,
    progress, frames, scheduledFrames, timers, effects, listeners, bufferSizes, observers,
    time: value => { at = value; },
    wallTime: value => { wallAt = value; },
    environment: ({ visibility = document.visibilityState, hasFocus = focused }) => {
      document.visibilityState = visibility;
      focused = hasFocus;
    },
    flush: value => {
      at = value;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(at);
    },
    click: ({ href, scope = "nav", isTrusted = true }) => {
      // Match only the fixture link's selectors, including an ordinary anchor.
      const selectors = ["a", ...(scope === "nav" ? [".ws-nav a"] : scope === "brand" ? [".ws-brand"] : [])];
      const link = { getAttribute: name => name === "href" ? href : null };
      document.dispatch("click", {
        isTrusted,
        target: { closest: selector => selector.split(",").some(value => selectors.includes(value.trim())) ? link : null },
      });
    },
    snapshot: () => JSON.parse(JSON.stringify(module.exports.uiPerformanceSnapshot())),
  };
}

test("GET API routes are pinned to the local gateway with a positive stream ID or address", async () => {
  const { runtime, window, calls } = browser();
  runtime.installReadOnlyNetwork();
  const urls = [
    `${gateway}/api/streams`,
    new URL(`${gateway}/api/streams/1`),
    new Request(`${gateway}/api/streams/1000`),
    `${gateway}${trades}`,
    `${gateway}/api/users/0x${"A".repeat(40)}/trades`,
  ];
  for (const url of urls) assert.equal((await window.fetch(url)).status, 200);
  assert.equal(calls.length, urls.length);
  for (const { init } of calls) assert.equal(init.method, "GET");
});

test("public URLs, other ports or hosts, RPC and unlisted API paths never reach native fetch", async () => {
  const { runtime, window, calls } = browser();
  runtime.installReadOnlyNetwork();
  const blocked = [
    "https://example.invalid/api/streams",
    "https://ethereum-sepolia-rpc.publicnode.com",
    "http://127.0.0.1:4392/api/streams",
    "http://localhost:4393/api/streams",
    "https://127.0.0.1:4393/api/streams",
    ...["/streams", "/rpc", "/api/rpc", "/api/streams/0", "/api/streams/01", "/api/streams/-1",
      "/api/streams/1/claim", "/api/streams/1/", "/api/users/invalid/trades", "/api/admin"].map(path => gateway + path),
    "/api/streams",
    "/api/rpc",
    "/assets/rpc.js",
  ];
  for (const url of blocked) {
    await assert.rejects(window.fetch(url), /QA network route blocked/, url);
  }
  assert.equal(calls.length, 0);
});

test("same-origin assets remain readable while every non-GET method is blocked", async () => {
  const { runtime, window, calls } = browser();
  runtime.installReadOnlyNetwork();
  for (const path of ["/assets/app.js", "/src/main.tsx", "/favicon.ico"]) {
    await window.fetch(path);
  }
  assert.equal(calls.length, 3);
  for (const method of ["POST", "post", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    await assert.rejects(window.fetch(`${gateway}/api/streams`, { method }), /QA network route blocked/);
    await assert.rejects(window.fetch("/assets/app.js", { method }), /QA network route blocked/);
  }
  await assert.rejects(window.fetch(new Request(`${gateway}/api/streams`, { method: "POST", body: "{}" })), /QA network route blocked/);
  assert.equal(calls.length, 3);
});

test("API URL credentials, search and fragments are blocked for string, URL and Request inputs", async () => {
  const { runtime, window, calls } = browser();
  runtime.installReadOnlyNetwork();
  for (const path of ["/api/streams", "/api/streams/3", trades]) {
    for (const suffix of ["?limit=100", "#debug", "?limit=100#debug"]) {
      const url = `${gateway}${path}${suffix}`;
      for (const input of [url, new URL(url), new Request(url)]) {
        await assert.rejects(window.fetch(input), /QA network route blocked/);
      }
    }
    for (const authority of ["user@", ":password@", "user:password@"]) {
      const url = `http://${authority}127.0.0.1:4393${path}`;
      for (const input of [url, new URL(url)]) {
        await assert.rejects(window.fetch(input), /QA network route blocked/);
      }
    }
  }
  assert.equal(calls.length, 0);
});

test("API Authorization and Cookie headers are stripped and credentials and redirects forced safe", async () => {
  const { runtime, window, calls } = browser();
  runtime.installReadOnlyNetwork();
  const headers = { Authorization: "Bearer test-only", Cookie: "test-only=value", "X-Unrelated": "removed" };
  for (const value of [headers, new Headers(headers), Object.entries(headers)]) {
    await window.fetch(`${gateway}/api/streams`, {
      headers: value, credentials: "include", redirect: "follow",
    });
  }
  const request = new Request(`${gateway}${trades}`, { headers, credentials: "include", redirect: "follow" });
  await window.fetch(request);
  await window.fetch(request, { headers, credentials: "same-origin", redirect: "manual" });
  await window.fetch("/assets/app.js", { credentials: "include", redirect: "follow" });
  assert.equal(calls.length, 6);
  for (const { init } of calls) {
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
  }
  for (const { init } of calls.slice(0, 5)) {
    assert.deepEqual([...new Headers(init.headers)], [["accept", "application/json"]]);
  }
});

test("installation is idempotent and preserves native AbortSignals and cancellation", async () => {
  const { runtime, window, calls } = browser();
  runtime.installReadOnlyNetwork();
  const installed = window.fetch;
  runtime.installReadOnlyNetwork();
  runtime.installReadOnlyNetwork();
  assert.equal(window.fetch, installed);
  const controller = new AbortController();
  await window.fetch(`${gateway}/api/streams`, { signal: controller.signal });
  assert.equal(calls[0].signal, controller.signal);
  const request = new Request(`${gateway}/api/streams/3`, { signal: controller.signal });
  await window.fetch(request);
  assert.equal(calls[1].input, request);
  assert.equal(calls[1].signal, request.signal);
  const override = new AbortController();
  await window.fetch(request, { signal: override.signal });
  assert.equal(calls[2].signal, override.signal);
  controller.abort();
  await assert.rejects(window.fetch(`${gateway}/api/streams`, { signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(window.fetch(request), { name: "AbortError" });
  assert.equal(calls.length, 5);
});

function commit(f, { data = null, surface = "market", stateKey = "", rowCount = 3, condition = "normal" } = {}) {
  f.runtime.useUiMeasurement({ data, surface, stateKey, rowCount, condition });
}

function inputFor(f, id) {
  const samples = f.snapshot().inputs.samples.filter(sample => sample.id === id);
  assert.equal(samples.length, 1);
  return samples[0];
}

test("runUiAction preserves callback return identity and rethrows the original handler error", () => {
  const f = browser();
  const result = {};
  let calls = 0;
  f.time(10);
  assert.equal(f.runtime.runUiAction({ action: "sort", surface: "market", expectedStateKey: "sort=price" }, () => {
    calls++;
    return result;
  }), result);
  assert.equal(calls, 1);
  const failure = new Error("handler failed");
  f.time(20);
  assert.throws(() => f.runtime.runUiAction({ action: "open-detail", surface: "assets" }, () => {
    throw failure;
  }), error => error === failure);
  const samples = f.snapshot().inputs.samples;
  assert.equal(samples.length, 2);
  const failed = samples[1];
  assert.equal(failed.valid, false);
  assert.ok(failed.reasons.includes("handler-error"));
  assert.equal(failed.handlerToCommitMs, null);
  assert.equal(failed.handlerToFrameMs, null);
  for (const sample of samples) assert.equal(sample.source, "unclassified");
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.calls.length, 0);
});

test("the real layout effect commits expected state and writes scalar progress only after its frame", () => {
  const f = browser();
  const data = { rows: [] };
  f.location.pathname = "/market";
  commit(f, { data, stateKey: "sort=review" });
  assert.equal(f.snapshot().inputs.samples.length, 0);
  assert.equal(f.frames.size, 0);
  f.time(10);
  f.runtime.runUiAction({ action: "sort", surface: "market", expectedStateKey: "sort=price" }, () => {});
  const id = f.snapshot().inputs.samples[0].id;
  f.time(15);
  commit(f, { data, stateKey: "sort=review" });
  assert.equal(f.frames.size, 0);
  f.time(20);
  commit(f, { data, stateKey: "sort=price" });
  assert.equal(typeof f.effects.at(-1), "function");
  assert.equal(f.frames.size, 1);
  const pending = inputFor(f, id);
  assert.equal(pending.commitAt, 20);
  assert.equal(pending.frameAt, null);
  assert.equal(pending.valid, false);
  assert.deepEqual(f.progress.dataset, {});
  assert.equal(f.progress.textContent, "");
  f.flush(35);
  const sample = inputFor(f, id);
  assert.equal(sample.valid, true);
  assert.equal(sample.source, "unclassified");
  assert.equal(sample.handlerToCommitMs, 10);
  assert.equal(sample.handlerToFrameMs, 25);
  assert.deepEqual(f.progress.dataset, { lastInput: id, valid: "true" });
  assert.equal(typeof f.progress.textContent, "string");
  assert.ok(f.progress.textContent.includes(id));
  assert.ok(f.progress.textContent.includes("frame"));
  assert.equal(f.timers.size, 0);
  assert.equal(f.calls.length, 0);
});

for (const surface of ["market", "assets"]) {
  test(`active surface actions use the current /${surface} path`, () => {
    const f = browser();
    f.location.pathname = `/${surface}`;
    commit(f, { surface, stateKey: "before" });
    f.time(10);
    f.runtime.runUiAction({ action: "refresh", surface: "active", expectedStateKey: "after" }, () => {});
    const started = f.snapshot().inputs.samples[0];
    assert.equal(started.surface, surface);
    f.time(20);
    commit(f, { surface, stateKey: "after" });
    f.flush(30);
    const sample = inputFor(f, started.id);
    assert.equal(sample.valid, true);
    assert.equal(sample.source, "unclassified");
    assert.equal(sample.handlerToCommitMs, 10);
    assert.equal(sample.handlerToFrameMs, 20);
    assert.equal(f.calls.length, 0);
  });
}

test("active actions on /manage/issued cannot reuse the previous measured page", () => {
  const f = browser();
  f.location.pathname = "/market";
  commit(f, { stateKey: "before" });
  f.time(10);
  f.runtime.runUiAction({ action: "sort", surface: "active", expectedStateKey: "after" }, () => {});
  const id = f.snapshot().inputs.samples[0].id;
  f.location.pathname = "/manage/issued";
  f.time(20);
  const result = {};
  assert.equal(f.runtime.runUiAction({ action: "refresh", surface: "active" }, () => result), result);
  const interrupted = inputFor(f, id);
  assert.equal(f.snapshot().inputs.samples.length, 1);
  assert.equal(interrupted.valid, false);
  assert.ok(interrupted.reasons.includes("unsupported-surface"));
  assert.equal(interrupted.handlerToCommitMs, null);
  assert.equal(interrupted.handlerToFrameMs, null);
  assert.equal(f.timers.size, 0);
  f.time(25);
  commit(f, { stateKey: "after" });
  f.flush(30);
  assert.deepEqual(inputFor(f, id), interrupted);
  assert.equal(f.frames.size, 0);
  assert.equal(f.calls.length, 0);
});

test("UI observer installation is idempotent and configures the supported resource buffer to 2500", () => {
  const supportedEntryTypes = ["longtask", "largest-contentful-paint", "layout-shift", "event"];
  const f = browser({ supportedEntryTypes });
  assert.equal(f.snapshot().resourceTimingBuffer.configured, false);
  f.runtime.installUiObservers();
  f.runtime.installUiObservers();
  f.runtime.installUiObservers();
  assert.deepEqual(f.bufferSizes, [2500]);
  assert.equal(f.observers.length, 4);
  assert.deepEqual(f.observers.map(observer => JSON.parse(JSON.stringify(observer.options))), supportedEntryTypes.map(type => ({
    type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}),
  })));
  for (const type of ["visibilitychange", "click"]) assert.equal(f.listeners.document.get(type).length, 1);
  for (const type of ["blur", "focus"]) assert.equal(f.listeners.window.get(type).length, 1);
  assert.equal(f.listeners.document.get("click")[0].options, true);
  assert.equal(f.listeners.performance.get("resourcetimingbufferfull").length, 1);
  const installed = f.snapshot();
  assert.deepEqual(installed.vitals.limits, { entries: 2000, resources: 2000, resourceIdentities: 2000 });
  assert.deepEqual(installed.resourceTimingBuffer, { requested: 2500, configured: true, overflowObserved: false });
  assert.deepEqual(installed.lifecycle, [{ at: 0, visibility: "visible", focused: true }]);
  for (const type of supportedEntryTypes) {
    assert.equal(installed.vitals.status[type], "observing");
    assert.equal(installed.vitals.counts[type], 0);
  }
  f.performance.dispatch("resourcetimingbufferfull");
  assert.equal(f.snapshot().resourceTimingBuffer.overflowObserved, true);
  assert.equal(f.calls.length, 0);
});

test("QA runtime exports all 1019 resource timings with its 2000 cap without issuing requests", () => {
  for (const env of [{}, { VITE_QA_MODE: "actual-api" }]) {
    const f = browser({ env });
    const rows = Array.from({ length: 1019 }, (_, id) => ({
      name: id < 1002 ? `${gateway}/api/streams/${id + 1}` : `${f.location.origin}/assets/${id}.js`,
      startTime: id, duration: 2, initiatorType: id < 1002 ? "fetch" : "script",
    }));
    f.performance.getEntriesByType = type => { assert.equal(type, "resource"); return rows; };
    f.runtime.installUiObservers();
    const vitals = f.snapshot().vitals;
    assert.deepEqual(vitals.limits, { entries: 2000, resources: 2000, resourceIdentities: 2000 });
    assert.equal(vitals.resourceStatus, "available");
    assert.equal(vitals.resources.length, 1019);
    assert.deepEqual(vitals.resources.map(row => row.url), rows.map(row => row.name));
    assert.equal(vitals.counts.resource, 1019);
    assert.equal(vitals.resourceIdentities, 1019);
    assert.equal(vitals.resourceDropped, 0);
    assert.equal(vitals.resourceDroppedAtLeast, 0);
    assert.deepEqual(f.snapshot().vitals, vitals);
    assert.equal(f.calls.length, 0);
  }
});

for (const scope of ["nav", "brand"]) {
  for (const surface of ["market", "assets"]) {
    test(`${scope} internal /${surface} links start unclassified navigation actions`, () => {
      const f = browser();
      const stateKey = surface === "market" ? "token=MockUSDC&sort=price" : '["all","all",null]';
      const href = surface === "market" ? `/market?${stateKey}` : `${f.location.origin}/assets`;
      f.runtime.installUiObservers();
      f.time(10);
      f.click({ href, scope, isTrusted: scope === "nav" });
      const samples = f.snapshot().inputs.samples;
      assert.equal(samples.length, 1);
      const started = samples[0];
      assert.equal(started.action, "workspace.navigate");
      assert.equal(started.surface, surface);
      assert.equal(started.source, "unclassified");
      assert.equal(started.navigation, true);
      if (surface === "market") {
        assert.equal(started.expectedStateKey, stateKey);
        f.time(15);
        commit(f, { surface, stateKey: "sort=review" });
        assert.equal(f.frames.size, 0);
      }
      f.location.href = new URL(href, f.location.href).href;
      f.time(20);
      commit(f, { surface, stateKey });
      f.flush(30);
      const sample = inputFor(f, started.id);
      assert.equal(sample.valid, true);
      assert.equal(sample.source, "unclassified");
      assert.equal(sample.handlerToCommitMs, 10);
      assert.equal(sample.handlerToFrameMs, 20);
      assert.equal(f.calls.length, 0);
    });
  }
}

test("ordinary anchors, external links and other workspace routes cannot start navigation samples", () => {
  const f = browser();
  f.runtime.installUiObservers();
  for (const target of [
    { href: "/market", scope: "other" },
    { href: "/assets", scope: "other" },
    { href: "https://example.invalid/market", scope: "nav" },
    { href: "https://example.invalid/assets", scope: "brand" },
    { href: "/manage/issued", scope: "nav" },
    { href: "/manage/issued", scope: "brand" },
    { href: "/market/", scope: "nav" },
    { href: "/assets/other", scope: "brand" },
    { href: null, scope: "nav" },
  ]) {
    f.click(target);
    assert.equal(f.snapshot().inputs.samples.length, 0, JSON.stringify(target));
  }
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.calls.length, 0);
});

for (const event of ["visibilitychange", "blur"]) {
  for (const phase of ["commit", "frame"]) {
    test(`${event} before ${phase} records lifecycle and interrupts the pending input`, () => {
      const f = browser();
      f.location.pathname = "/market";
      f.runtime.installUiObservers();
      commit(f, { stateKey: "before" });
      f.time(10);
      f.runtime.runUiAction({ action: "sort", surface: "active", expectedStateKey: "after" }, () => {});
      const id = f.snapshot().inputs.samples[0].id;
      if (phase === "frame") {
        f.time(20);
        commit(f, { stateKey: "after" });
        assert.equal(f.frames.size, 1);
      }
      const callbacks = [...f.scheduledFrames.values()];
      f.time(25);
      const hidden = event === "visibilitychange";
      f.environment(hidden ? { visibility: "hidden" } : { hasFocus: false });
      (hidden ? f.document : f.window).dispatch(event);
      const state = f.snapshot();
      assert.equal(state.lifecycle.length, 2);
      assert.deepEqual(state.lifecycle[1], { at: 25, visibility: hidden ? "hidden" : "visible", focused: hidden });
      const interrupted = inputFor(f, id);
      assert.equal(interrupted.valid, false);
      assert.equal(interrupted.source, "unclassified");
      assert.ok(interrupted.reasons.includes(hidden ? "hidden" : "unfocused"));
      assert.equal(interrupted.handlerToCommitMs, null);
      assert.equal(interrupted.handlerToFrameMs, null);
      assert.equal(f.timers.size, 0);
      assert.equal(f.frames.size, 0);
      assert.deepEqual(f.progress.dataset, { lastInput: id, valid: "false" });
      f.time(30);
      f.environment({ visibility: "visible", hasFocus: true });
      (hidden ? f.document : f.window).dispatch(hidden ? "visibilitychange" : "focus");
      commit(f, { stateKey: "after" });
      f.time(40);
      for (const callback of callbacks) callback(40);
      f.flush(45);
      assert.deepEqual(inputFor(f, id), interrupted);
      assert.deepEqual(f.snapshot().lifecycle.at(-1), { at: 30, visibility: "visible", focused: true });
      assert.equal(f.progress.dataset.valid, "false");
      assert.equal(f.timers.size, 0);
      assert.equal(f.frames.size, 0);
      assert.equal(f.calls.length, 0);
    });
  }
}

test("missing observers and resource timing report null counts instead of synthetic zero", () => {
  const f = browser({ resourceTiming: false });
  f.runtime.installUiObservers();
  const vitals = f.snapshot().vitals;
  const types = ["longtask", "largest-contentful-paint", "layout-shift", "event"];
  for (const type of types) {
    assert.equal(vitals.status[type], "unsupported");
    assert.equal(vitals.counts[type], null);
  }
  assert.equal(vitals.counts.resource, null);
  assert.equal(vitals.resourceStatus, "unsupported");
  assert.deepEqual(vitals.supported, []);
  assert.deepEqual(vitals.unsupported, [...types, "resource"]);
  assert.equal(f.calls.length, 0);
});

const planDigest = "a".repeat(64);
const watchedAddress = "0x2222222222222222222222222222222222222222";
const allowedPaths = ["/health", "/metrics", "/streams", `/users/${watchedAddress}/trades`, "/streams/1"];
const runId = "12345678-1234-4234-8234-123456789abc";
const expiresAt = new Date(Date.now()+600000).toISOString();
const actualEnv = { VITE_QA_MODE: "actual-api", VITE_QA_PLAN_DIGEST: planDigest,
  VITE_VESTORA_API_URL: `${actualGateway}/api`, VITE_SEPOLIA_RPC_URL: `${actualGateway}/rpc-blocked`,
  VITE_QA_WATCH_ADDRESS: watchedAddress, VITE_QA_ALLOWED_PATHS: JSON.stringify(allowedPaths),
  VITE_QA_SOURCE: "ACTUAL API VIA BOUNDED GATEWAY" };
const sessionValue = () => ({ mode: "actual-api", planDigest, watchedAddress, allowedPaths: [...allowedPaths],
  runId, expiresAt, stopped: false, readOnly: true, functionalP0Passed: false });
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const apiResponse = (headers = {}) => new Response("{}", { headers: {
  "Content-Type": "application/json", "X-QA-Request-ID": "test-request-1",
  "X-QA-Plan-Digest": planDigest, "X-QA-Run-ID": runId, ...headers,
} });
const actualBrowser = (options = {}) => browser({ env: actualEnv,
  fetchMock: ({ input }) => input === `${actualGateway}/session` ? jsonResponse(sessionValue()) : apiResponse(), ...options });

test("fixture and actual transports select only their fixed mode origin despite URL overrides", async () => {
  for (const [env, origin, otherOrigin] of [[{ VITE_QA_MODE: "fixture" }, gateway, actualGateway],
    [actualEnv, actualGateway, gateway]]) {
    const f = browser({ env: { ...env, VITE_VESTORA_API_URL: "http://127.0.0.1:4999/api",
      VITE_SEPOLIA_RPC_URL: "http://127.0.0.1:4999/rpc-blocked" },
      fetchMock: ({ input }) => input === `${actualGateway}/session` ? jsonResponse(sessionValue()) : apiResponse() });
    f.runtime.installReadOnlyNetwork();
    await f.runtime.prepareUiReadSession();
    assert.equal(f.calls.length, env.VITE_QA_MODE === "actual-api" ? 1 : 0);
    if (f.calls.length) assert.equal(f.calls[0].input, `${actualGateway}/session`);
    assert.equal((await f.window.fetch(`${origin}/api/streams`)).status, 200);
    const before = f.calls.length;
    for (const url of [`${otherOrigin}/api/streams`, "http://127.0.0.1:4999/api/streams", `${origin}/rpc-blocked`]) {
      await assert.rejects(f.window.fetch(url), /route blocked/, url);
    }
    assert.equal(f.calls.length, before);
  }
});

test("bound non-200 API response retains its status once and closes subsequent reads", async () => {
  const f = actualBrowser({fetchMock: ({input}) => input === `${actualGateway}/session` ? jsonResponse(sessionValue())
    : new Response('{"error":"synthetic-session-stop"}', {status: 503, headers: apiResponse().headers})});
  f.runtime.installReadOnlyNetwork(); await f.runtime.prepareUiReadSession();
  const response = await f.window.fetch(`${actualGateway}/api/streams`);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("X-QA-Request-ID"), "test-request-1");
  await assert.rejects(f.window.fetch(`${actualGateway}/api/streams`), /route blocked/);
  await assert.rejects(f.runtime.prepareUiReadSession(), /session unavailable/);
  assert.equal(f.calls.length, 2);
});

test("fixture preparation is a no-op, even without installing transport", async () => {
  for (const env of [{}, { VITE_QA_MODE: "fixture" }]) {
    const f = browser({ env });
    await f.runtime.prepareUiReadSession();
    await f.runtime.prepareUiReadSession();
    assert.equal(f.calls.length, 0);
    assert.equal(f.snapshot().mode, "fixture");
    assert.equal(f.snapshot().session, null);
  }
});

test("actual handshake is private, single-use, bounded and exposes only copied public run identifiers", async () => {
  const f = actualBrowser();
  f.runtime.installReadOnlyNetwork();
  for (const path of allowedPaths) await assert.rejects(f.window.fetch(`${actualGateway}/api${path}`), /route blocked/);
  for (const path of ["/session", "/health", "/metrics", "/stop", "/approve"]) {
    await assert.rejects(f.window.fetch(actualGateway + path), /route blocked/);
  }
  assert.equal(f.calls.length, 0);
  await Promise.all([f.runtime.prepareUiReadSession(), f.runtime.prepareUiReadSession()]);
  await f.runtime.prepareUiReadSession();
  assert.equal(f.calls.length, 1);
  const { input, init, signal } = f.calls[0];
  assert.equal(input, `${actualGateway}/session`);
  assert.equal(init.method, "GET");
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.deepEqual([...new Headers(init.headers)], [["accept", "application/json"]]);
  assert.equal(signal.aborted, false);
  assert.equal(f.timers.size, 0);
  const snapshot = f.runtime.uiPerformanceSnapshot();
  assert.equal(snapshot.mode, "actual-api");
  assert.equal(snapshot.environment, actualEnv.VITE_QA_SOURCE);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.session)), { runId, planDigest, expiresAt });
  snapshot.session.runId = "changed";
  assert.equal(f.snapshot().session.runId, runId);
  assert.equal(JSON.stringify(f.snapshot()).includes("VESTORA_QA_SESSION_MANIFEST"), false);
  assert.ok(f.snapshot().exclusions.includes("No field INP or exact presentation timing"));
  await assert.rejects(f.window.fetch(`${actualGateway}/session`), /route blocked/);
  assert.equal(f.calls.length, 1);
});

test("actual GETs allow only the exact approved path set and retain request cancellation", async () => {
  const f = actualBrowser();
  f.runtime.installReadOnlyNetwork();
  await f.runtime.prepareUiReadSession();
  for (const path of allowedPaths) assert.equal((await f.window.fetch(`${actualGateway}/api${path}`)).status, 200);
  const controller = new AbortController();
  const request = new Request(`${actualGateway}/api/streams/1`, { signal: controller.signal });
  await f.window.fetch(request);
  assert.equal(f.calls.at(-1).signal, request.signal);
  await f.window.fetch(new URL(`${actualGateway}/api/streams`), { signal: controller.signal });
  assert.equal(f.calls.at(-1).signal, controller.signal);
  for (const { init } of f.calls.slice(1)) {
    assert.equal(init.method, "GET");
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "error");
    assert.equal(init.cache, "no-store");
    assert.deepEqual([...new Headers(init.headers)], [["accept", "application/json"], ["x-qa-plan-digest", planDigest], ["x-qa-run-id", runId]]);
  }
  const before = f.calls.length;
  for (const path of ["/session", "/rpc-blocked", "/api/streams/2", "/api/streams/01", "/api/streams/0",
    "/api/streams/1/claim", "/api/streams/", `/api/users/0x${"3".repeat(40)}/trades`,
    "/api/streams?limit=1", "/api/streams#x", "/api/streams?", "/api/streams#", "/api/streams/../streams",
    "/api/%73treams", "/api/streams/1/..", "/api/health/", "/api/admin"]) {
    await assert.rejects(f.window.fetch(actualGateway + path), /route blocked/, path);
  }
  for (const url of [`${gateway}/api/streams`, "http://localhost:4394/api/streams", "http://127.0.0.1:4392/api/streams",
    "https://example.invalid/api/streams", "http://2130706433:4394/api/streams", "http://user@127.0.0.1:4394/api/streams",
    "/api/streams", "/rpc", "/assets/rpc.js"]) await assert.rejects(f.window.fetch(url), /route blocked/, url);
  for (const method of ["POST", "HEAD", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
    await assert.rejects(f.window.fetch(`${actualGateway}/api/streams`, { method }), /route blocked/);
  }
  for (const header of ["Authorization", "Cookie", "X-Auth", "X-QA-Run-ID"]) {
    const headers = { [header]: "test-only" };
    for (const value of [headers, new Headers(headers), Object.entries(headers)]) {
      await assert.rejects(f.window.fetch(`${actualGateway}/api/streams`, { headers: value }), /route blocked/);
    }
    await assert.rejects(f.window.fetch(new Request(`${actualGateway}/api/streams`, { headers })), /route blocked/);
  }
  await assert.rejects(f.window.fetch(`${actualGateway}/api/streams`, { body: "test-only" }), /route blocked/);
  assert.equal(f.calls.length, before);
  await f.window.fetch("/assets/app.js");
  assert.equal(f.calls.length, before + 1);
});

const invalidSessions = [
  ["mode", { mode: "fixture" }], ["digest", { planDigest: "b".repeat(64) }],
  ["watch", { watchedAddress: `0x${"3".repeat(40)}` }], ["watch casing", { watchedAddress: watchedAddress.replace("2222", "AAAA") }],
  ["missing path", { allowedPaths: allowedPaths.slice(1) }],
  ["duplicate path", { allowedPaths: [allowedPaths[0], ...allowedPaths.slice(0, -1)] }],
  ["different path", { allowedPaths: [...allowedPaths.slice(0, -1), "/streams/2"] }],
  ["stopped", { stopped: true }], ["readOnly", { readOnly: false }], ["P0", { functionalP0Passed: true }],
  ["UUID", { runId: "not-a-uuid" }], ["expired", { expiresAt: "2000-01-01T00:00:00.000Z" }],
  ["UUID whitespace", { runId: runId + "\n" }], ["expiry whitespace", { expiresAt: expiresAt + "\n" }],
  ["non-ISO expiry", { expiresAt: "January 1, 2099" }], ["invalid expiry", { expiresAt: "2099-99-99T00:00:00Z" }],
  ["invalid calendar date", { expiresAt: "2099-02-30T00:00:00.000Z" }],
  ["over-duration expiry", { expiresAt: new Date(Date.now()+900000).toISOString() }],
  ["authorization property", { approved: true }],
];
for (const [name, patch] of invalidSessions) {
  test(`actual handshake rejects ${name} without app reads or retries`, async () => {
    const f = actualBrowser({ fetchMock: () => jsonResponse({ ...sessionValue(), ...patch }) });
    f.runtime.installReadOnlyNetwork();
    await assert.rejects(f.runtime.prepareUiReadSession(), /QA measurement session unavailable/);
    await assert.rejects(f.runtime.prepareUiReadSession(), /QA measurement session unavailable/);
    await assert.rejects(f.window.fetch(`${actualGateway}/api/streams`), /route blocked/);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].signal.aborted, true);
    assert.equal(f.snapshot().session, null);
    assert.equal(f.timers.size, 0);
  });
}

test("handshake requires every field and accepts a reordered exact path set", async () => {
  for (const key of Object.keys(sessionValue())) {
    const value = sessionValue(); delete value[key];
    const f = actualBrowser({ fetchMock: () => jsonResponse(value) });
    f.runtime.installReadOnlyNetwork();
    await assert.rejects(f.runtime.prepareUiReadSession(), /session unavailable/, key);
  }
  const f = actualBrowser({ fetchMock: () => jsonResponse({ ...sessionValue(), allowedPaths: [...allowedPaths].reverse() }) });
  f.runtime.installReadOnlyNetwork();
  await f.runtime.prepareUiReadSession();
  assert.equal(f.snapshot().session.runId, runId);
});

test("malformed, oversized, HTTP error and redirected handshake responses fail closed", async () => {
  const responses = [
    () => new Response("{}", { status: 503 }),
    () => new Response("bad-json", { headers: { "Content-Type": "application/json" } }),
    () => new Response("null", { headers: { "Content-Type": "application/json" } }),
    () => new Response("{}", { headers: { "Content-Type": "text/html" } }),
    () => new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "16385" } }),
    () => new Response(" ".repeat(16385), { headers: { "Content-Type": "application/json" } }),
    () => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(9000)); c.enqueue(new Uint8Array(9000)); c.close(); } }),
      { headers: { "Content-Type": "application/json" } }),
    () => { const r = jsonResponse(sessionValue()); Object.defineProperty(r, "redirected", { value: true }); return r; },
    () => { const r = jsonResponse(sessionValue()); Object.defineProperty(r, "url", { value: `${actualGateway}/other` }); return r; },
    () => { throw new Error("SECRET SHOULD NEVER APPEAR"); },
  ];
  for (const response of responses) {
    const f = actualBrowser({ fetchMock: response });
    f.runtime.installReadOnlyNetwork();
    await assert.rejects(f.runtime.prepareUiReadSession(), error => error.message === "QA measurement session unavailable");
    assert.equal(f.snapshot().session, null);
    assert.equal(f.calls.length, 1);
    assert.equal(f.timers.size, 0);
  }
});

test("the 5s handshake deadline covers both hanging headers and hanging body", async () => {
  for (const stage of ["headers", "body"]) {
    const f = actualBrowser({ fetchMock: () => stage === "headers" ? new Promise(() => {})
      : new Response(new ReadableStream({ start() {} }), { headers: { "Content-Type": "application/json" } }) });
    f.runtime.installReadOnlyNetwork();
    const pending = f.runtime.prepareUiReadSession();
    const rejected = assert.rejects(pending, /session unavailable/);
    const timer = [...f.timers.values()][0];
    assert.equal(timer.deadline, 5000);
    timer.callback();
    await rejected;
    assert.equal(f.calls[0].signal.aborted, true);
    assert.equal(f.timers.size, 0);
    await assert.rejects(f.runtime.prepareUiReadSession(), /session unavailable/);
    assert.equal(f.calls.length, 1);
  }
});

for (const [name, headers] of [
  ["digest", { "X-QA-Plan-Digest": "b".repeat(64) }],
  ["run", { "X-QA-Run-ID": "22345678-1234-4234-8234-123456789abc" }],
  ["request ID", { "X-QA-Request-ID": "" }],
  ["missing run ID", { "X-QA-Run-ID": "" }],
]) {
  test(`actual API rejects mismatched ${name}, closes further reads and never renews`, async () => {
    const f = actualBrowser({ fetchMock: ({ input }) => input === `${actualGateway}/session` ? jsonResponse(sessionValue()) : apiResponse(headers) });
    f.runtime.installReadOnlyNetwork();
    await f.runtime.prepareUiReadSession();
    await assert.rejects(f.window.fetch(`${actualGateway}/api/streams`), /session unavailable/);
    await assert.rejects(f.window.fetch(`${actualGateway}/api/streams`), /route blocked/);
    await assert.rejects(f.runtime.prepareUiReadSession(), /session unavailable/);
    assert.equal(f.calls.length, 2);
    assert.equal(f.calls.filter(({ input }) => input === `${actualGateway}/session`).length, 1);
  });
}

test("expired sessions block reads before fetch and expiry while fetching rejects the response", async () => {
  for (const whileFetching of [false, true]) {
    const f = actualBrowser({ fetchMock: ({ input }) => {
      if (input === `${actualGateway}/session`) return jsonResponse(sessionValue());
      if (whileFetching) f.wallTime(Date.parse(expiresAt));
      return apiResponse();
    } });
    f.runtime.installReadOnlyNetwork();
    await f.runtime.prepareUiReadSession();
    if (!whileFetching) f.wallTime(Date.parse(expiresAt));
    await assert.rejects(f.window.fetch(`${actualGateway}/api/streams`), whileFetching ? /session unavailable/ : /route blocked/);
    assert.equal(f.calls.length, whileFetching ? 2 : 1);
  }
});

const entryCode = ts.transpileModule(readFileSync(new URL("./main.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText.replaceAll("import.meta.env.VITE_QA_SOURCE", JSON.stringify(actualEnv.VITE_QA_SOURCE));

test("QA entry installs guards and observers, awaits preparation, then alone imports and renders App", async () => {
  for (const succeeds of [true, false]) {
    const events = [], rendered = [];
    let resolve, reject;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    const runtime = {
      installReadOnlyNetwork: () => events.push("network"),
      installUiObservers: () => events.push("observers"),
      prepareUiReadSession: () => { events.push("prepare"); return pending; },
      uiPerformanceSnapshot: () => ({}),
    };
    const jsx = (type, props) => ({ type, props });
    const finished = vm.runInNewContext(`(async()=>{${entryCode}\n})()`, {
      exports: {}, document: { getElementById: () => ({}) },
      require: name => {
        if (name === "./runtime") return runtime;
        if (name === "react-dom/client") return { createRoot: () => ({ render: value => rendered.push(value) }) };
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
        if (name === "../../src/App") { events.push("App import"); return { default: "App" }; }
        assert.ok(["../../src/i18n/config", "../../src/index.css"].includes(name)); return {};
      },
    }, { timeout: 5000 });
    assert.deepEqual(events, ["network", "observers", "prepare"]);
    assert.equal(rendered.length, 0);
    if (succeeds) resolve(); else reject(new Error("PRIVATE MANIFEST PATH AND TOKEN"));
    await finished;
    assert.equal(rendered.length, 1);
    assert.deepEqual(events, ["network", "observers", "prepare", ...(succeeds ? ["App import"] : [])]);
    const children = rendered[0].props.children;
    assert.equal(typeof children[0].type, "function", "QA banner remains visible");
    if (succeeds) assert.equal(children[1].type, "App");
    else {
      assert.equal(children[1].props.role, "alert");
      assert.equal(children[1].props.children, "측정 세션을 확인하지 못했습니다");
      assert.equal(JSON.stringify(rendered).includes("PRIVATE"), false);
    }
  }
});
