import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import vm from "node:vm";
import { transformSync } from "esbuild";
import ts from "typescript";

const sourcePath = resolve(import.meta.dirname, "browser-observer.ts");
const code = transformSync(readFileSync(sourcePath, "utf8"), { loader: "ts", format: "cjs" }).code;
const types = ["longtask", "largest-contentful-paint", "layout-shift", "event"];

function harness({ supported = types, maxEntries, maxResources, noObserver = false, noPerformance = false, constructorFailure, observeFailure, disconnectFailure, performance: timing } = {}) {
  const instances = [], attempts = [];
  let currentTime = 10, environment = { visibility: "visible", focused: true }, resources = [];
  class Observer {
    static supportedEntryTypes = supported;
    constructor(callback) {
      const index = instances.length;
      if (constructorFailure === index) {
        // Record failed attempts too so subsequent entry types can still install.
        instances.push({ failed: true });
        throw new Error("sensitive constructor details");
      }
      this.callback = callback;
      this.disconnected = 0;
      instances.push(this);
    }
    observe(options) {
      this.options = options;
      if (observeFailure === options.type) throw new Error("sensitive observe details");
    }
    disconnect() {
      this.disconnected++;
      if (disconnectFailure === this.options.type) throw new Error("sensitive disconnect details");
    }
  }
  const module = { exports: {} };
  const deny = name => () => { attempts.push(name); throw new Error(`Unexpected ${name}`); };
  vm.runInNewContext(code, {
    module, exports: module.exports, URL,
    fetch: deny("fetch"), XMLHttpRequest: deny("XMLHttpRequest"), WebSocket: deny("WebSocket"),
  }, { timeout: 5000 });
  const performance = noPerformance ? undefined : timing ?? {
    timeOrigin: 1000,
    getEntriesByType(type) { assert.equal(type, "resource"); return resources; },
  };
  const options = { performance, Observer: noObserver ? undefined : Observer, clock: () => currentTime, environment: () => environment, maxEntries, maxResources };
  const vitals = module.exports.createBrowserVitals(options);
  return {
    vitals, instances, attempts,
    create: overrides => module.exports.createBrowserVitals({ ...options, ...overrides }),
    time: value => { currentTime = value; },
    environment: value => { environment = value; },
    resources: value => { resources = value; },
    deliver: (type, entries) => {
      const observer = instances.find(instance => instance.options?.type === type);
      assert.ok(observer, `missing mock observer for ${type}`);
      observer.callback({ getEntries: () => entries });
    },
    snapshot: () => JSON.parse(JSON.stringify(vitals.snapshot())),
  };
}

function resource(id, overrides = {}) {
  return { name: `http://127.0.0.1:4341/assets/${id}.js`, startTime: id, duration: 2, initiatorType: "script", ...overrides };
}

test("exported options accept native DOM timing and PerformanceObserver types", () => {
  const path = resolve(import.meta.dirname, "browser-observer-type-contract.ts");
  const source = `
    import {createBrowserVitals, type BrowserVitals, type BrowserVitalsOptions, type BrowserVitalsSnapshot} from "./browser-observer";
    const options: BrowserVitalsOptions = {performance, Observer: PerformanceObserver,
      clock: () => performance.now(), environment: () => ({visibility: document.visibilityState, focused: document.hasFocus()}), maxResources: 2000};
    const vitals: BrowserVitals = createBrowserVitals(options);
    const snapshot: BrowserVitalsSnapshot = vitals.snapshot();
    const install: () => void = vitals.install;
    const stop: () => void = vitals.stop;
  `;
  const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
  const host = ts.createCompilerHost(options), readFile = host.readFile.bind(host), fileExists = host.fileExists.bind(host);
  host.readFile = file => resolve(file) === path ? source : readFile(file);
  host.fileExists = file => resolve(file) === path || fileExists(file);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([path], options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => import.meta.dirname, getCanonicalFileName: path => path, getNewLine: () => "\n",
  }));
});

test("install is idempotent, enables four buffered observers and sets the event threshold to 16", () => {
  const f = harness();
  f.vitals.install(); f.vitals.install();
  assert.equal(f.instances.length, 4);
  assert.deepEqual(f.instances.map(instance => JSON.parse(JSON.stringify(instance.options))), types.map(type => ({
    type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}),
  })));
  const snapshot = f.snapshot();
  assert.deepEqual(snapshot.supported, [...types, "resource"]);
  assert.deepEqual(snapshot.unsupported, []);
  assert.deepEqual(snapshot.counts, Object.fromEntries([...types, "resource"].map(type => [type, 0])));
  assert.equal(snapshot.timeOrigin, 1000);
  assert.equal(snapshot.resourceDropped, 0);
  assert.deepEqual(f.attempts, []);
});

test("unsupported and not-installed observations use null counts instead of synthetic zero", () => {
  const f = harness({ supported: ["longtask"], noPerformance: true });
  assert.equal(f.snapshot().counts.longtask, null);
  f.vitals.install();
  const snapshot = f.snapshot();
  assert.deepEqual(snapshot.supported, ["longtask"]);
  assert.deepEqual(snapshot.unsupported, [...types.slice(1), "resource"]);
  assert.equal(snapshot.counts.longtask, 0);
  for (const type of [...types.slice(1), "resource"]) assert.equal(snapshot.counts[type], null);
  assert.equal(snapshot.timeOrigin, null);
  assert.equal(snapshot.resourceDropped, null);
  const missing = harness({ noObserver: true, noPerformance: true });
  missing.vitals.install();
  assert.deepEqual(missing.snapshot().unsupported, [...types, "resource"]);
  assert.ok(Object.values(missing.snapshot().counts).every(value => value === null));
  const legacy = harness({ supported: undefined });
  // A constructor without supportedEntryTypes is tried rather than assumed unsupported.
  const observer = legacy.instances;
  const UnknownSupport = class { observe() {} disconnect() {} };
  const vitals = legacy.create({ Observer: UnknownSupport });
  vitals.install();
  assert.equal(vitals.snapshot().counts.event, 0);
  assert.equal(observer.length, 0);
});

test("entry whitelisting preserves missing versus zero and never reads DOM or toJSON fields", () => {
  const f = harness();
  f.vitals.install();
  const entry = { startTime: 0, duration: 0, interactionId: 0, processingStart: 0, processingEnd: 0, value: 0, hadRecentInput: false };
  for (const property of ["name", "target", "element", "sources", "attribution", "toJSON"]) {
    Object.defineProperty(entry, property, { get: () => { throw new Error(`sensitive ${property}`); } });
  }
  f.deliver("event", [entry, { startTime: NaN, duration: Infinity, interactionId: "secret", value: undefined }]);
  const [zero, missing] = f.snapshot().entries;
  for (const key of ["startTime", "duration", "interactionId", "processingStart", "processingEnd", "value"]) {
    assert.equal(zero[key], 0);
    assert.equal(missing[key], null);
  }
  assert.equal(zero.hadRecentInput, false);
  assert.equal(missing.hadRecentInput, null);
  assert.deepEqual(Object.keys(zero).sort(), ["type", "startTime", "duration", "interactionId", "processingStart", "processingEnd", "value", "hadRecentInput", "deliveredAt", "environment"].sort());
  assert.deepEqual(f.snapshot().failures, []);
});

test("delivery environment and timing are copied and do not relabel hidden samples", () => {
  const f = harness();
  f.vitals.install();
  const hidden = { visibility: "hidden", focused: false };
  f.time(50); f.environment(hidden);
  f.deliver("layout-shift", [{ startTime: 1, value: 0.2, hadRecentInput: true }]);
  hidden.visibility = "visible"; hidden.focused = true;
  f.time(70); f.environment({ visibility: "visible", focused: true });
  f.deliver("longtask", [{ startTime: 2, duration: 60 }]);
  const snapshot = f.snapshot();
  assert.deepEqual(snapshot.entries[0].environment, { visibility: "hidden", focused: false });
  assert.equal(snapshot.entries[0].deliveredAt, 50);
  assert.deepEqual(snapshot.entries[1].environment, { visibility: "visible", focused: true });
  assert.equal(snapshot.entries[1].deliveredAt, 70);
  snapshot.entries[0].environment.visibility = "tampered";
  assert.equal(f.snapshot().entries[0].environment.visibility, "hidden");
});

test("all observer types share the entry cap while counts and drops remain explicit", () => {
  const f = harness({ maxEntries: 3 });
  f.vitals.install();
  f.deliver("longtask", [{ startTime: 1 }, { startTime: 2 }]);
  f.deliver("largest-contentful-paint", [{ startTime: 3 }]);
  f.deliver("layout-shift", [{ startTime: 4 }, { startTime: 5 }]);
  f.deliver("event", [{ startTime: 6 }]);
  const snapshot = f.snapshot();
  assert.deepEqual(snapshot.entries.map(entry => entry.startTime), [1, 2, 3]);
  assert.equal(snapshot.dropped, 3);
  assert.equal(snapshot.counts.longtask, 2);
  assert.equal(snapshot.counts["layout-shift"], 2);
  assert.equal(snapshot.counts.event, 1);
  assert.equal(f.snapshot().dropped, 3);
  const defaults = harness(); defaults.vitals.install();
  defaults.deliver("event", Array.from({ length: 2001 }, (_, startTime) => ({ startTime })));
  assert.equal(defaults.snapshot().entries.length, 2000);
  assert.equal(defaults.snapshot().dropped, 1);
});

test("resource URLs strip credentials, search and fragments and whitelist all other fields", () => {
  const f = harness();
  const entry = resource(0, { name: "https://secret:password@example.invalid:8443/a/file.js?token=secret#private", transferSize: 0, encodedBodySize: 0, decodedBodySize: 128 });
  Object.defineProperty(entry, "toJSON", { get: () => { throw new Error("must never serialize arbitrary entries"); } });
  f.resources([entry, resource(1, { name: "data:text/plain,private-dom-text", initiatorType: "private-value" }), resource(2, { name: "not a URL", duration: Infinity })]);
  const snapshot = f.snapshot();
  assert.deepEqual(snapshot.resources[0], {
    url: "https://example.invalid:8443/a/file.js", initiatorType: "script", startTime: 0, duration: 2,
    transferSize: 0, encodedBodySize: 0, decodedBodySize: 128,
  });
  assert.equal(snapshot.resources[1].url, null);
  assert.equal(snapshot.resources[1].initiatorType, "other");
  assert.equal(snapshot.resources[1].transferSize, null);
  assert.equal(snapshot.resources[2].url, null);
  assert.equal(snapshot.resources[2].duration, null);
  assert.doesNotMatch(JSON.stringify(snapshot), /secret|password|private-dom-text|private-value/);
  snapshot.resources[0].url = "tampered";
  assert.equal(f.snapshot().resources[0].url, "https://example.invalid:8443/a/file.js");
});

test("resource snapshots deduplicate URL/start pairs and retain the first 500 with exact known drops", () => {
  const f = harness();
  const rows = Array.from({ length: 503 }, (_, id) => resource(id));
  f.resources([...rows, { ...rows[0] }, { ...rows[502] }]);
  const first = f.snapshot();
  assert.deepEqual(first.limits, { entries: 2000, resources: 500, resourceIdentities: 2000 });
  assert.equal(first.resourceStatus, "available");
  assert.equal(first.resources.length, 500);
  assert.equal(first.resourceDropped, 3);
  assert.equal(first.resourceDroppedAtLeast, 3);
  assert.equal(first.counts.resource, 503);
  assert.deepEqual(f.snapshot(), first);
  f.resources([{ ...rows[502] }, ...rows.slice().reverse(), resource(503), resource(504)]);
  const next = f.snapshot();
  assert.deepEqual(next.resources, first.resources);
  assert.equal(next.resourceDropped, 5);
  assert.equal(next.resourceDroppedAtLeast, 5);
  assert.equal(next.counts.resource, 505);
  assert.equal(next.resourceIdentities, 505);
  f.resources([resource(504)]);
  assert.equal(f.snapshot().resourceDropped, 5);
  assert.equal(f.snapshot().counts.resource, 505);
});

test("a 2000 resource cap retains all 1002 API timings and 17 assets without drops or duplicate exports", () => {
  const f = harness({ maxResources: 2000 });
  const rows = [
    ...Array.from({ length: 1002 }, (_, id) => resource(id, { name: `http://127.0.0.1:4393/api/streams/${id + 1}`, initiatorType: "fetch" })),
    ...Array.from({ length: 17 }, (_, id) => resource(1002 + id)),
  ];
  f.resources(rows.slice(0, 700));
  assert.equal(f.snapshot().resources.length, 700);
  f.resources([...rows, { ...rows[0] }, { ...rows.at(-1) }]);
  const snapshot = f.snapshot();
  assert.deepEqual(snapshot.limits, { entries: 2000, resources: 2000, resourceIdentities: 2000 });
  assert.equal(snapshot.resourceStatus, "available");
  assert.equal(snapshot.resources.length, 1019);
  assert.equal(snapshot.counts.resource, 1019);
  assert.equal(snapshot.resourceIdentities, 1019);
  assert.equal(snapshot.resourceDropped, 0);
  assert.equal(snapshot.resourceDroppedAtLeast, 0);
  assert.deepEqual(snapshot.resources.map(row => [row.url, row.startTime, row.initiatorType]), rows.map(row => [row.name, row.startTime, row.initiatorType]));
  assert.deepEqual(f.snapshot(), snapshot);
  assert.deepEqual(f.attempts, []);
});

test("positive custom resource caps retain the first timings and exact known drops", () => {
  const rows = Array.from({ length: 1019 }, (_, id) => resource(id));
  for (const maxResources of [1, 750]) {
    const f = harness({ maxResources });
    f.resources(rows);
    const snapshot = f.snapshot();
    assert.equal(snapshot.limits.resources, maxResources);
    assert.equal(snapshot.resourceStatus, "available");
    assert.equal(snapshot.resources.length, maxResources);
    assert.deepEqual(snapshot.resources.map(row => row.startTime), rows.slice(0, maxResources).map(row => row.startTime));
    assert.equal(snapshot.resourceDropped, 1019 - maxResources);
    assert.equal(snapshot.resourceDroppedAtLeast, 1019 - maxResources);
    assert.equal(snapshot.counts.resource, 1019);
    assert.equal(snapshot.resourceIdentities, 1019);
    assert.deepEqual(f.snapshot(), snapshot);
  }
});

test("resource identity distinguishes URL query variants and different starts without exposing either query", () => {
  const f = harness();
  const rows = [
    resource(0, { name: "https://example.invalid/app.js?token=first#private" }),
    resource(0, { name: "https://example.invalid/app.js?token=second#private" }),
    resource(1, { name: "https://example.invalid/app.js?token=first#private" }),
  ];
  f.resources([...rows, ...rows.map(row => ({ ...row }))]);
  const snapshot = f.snapshot();
  assert.equal(snapshot.counts.resource, 3);
  assert.equal(snapshot.resources.length, 3);
  assert.ok(snapshot.resources.every(row => row.url === "https://example.invalid/app.js"));
  assert.doesNotMatch(JSON.stringify(snapshot), /token=|#private/);
  assert.deepEqual(f.snapshot(), snapshot);
});

for (const maxResources of [undefined, 750, 2000]) {
  test(`resource identity overflow at export cap ${maxResources ?? "default 500"} bounds memory and keeps indeterminate totals and a drop lower bound`, () => {
    const f = harness({ maxResources });
    const cap = maxResources ?? 500;
    f.resources(Array.from({ length: 2000 }, (_, id) => resource(id)));
    const full = f.snapshot();
    assert.equal(full.resourceStatus, "available");
    assert.equal(full.limits.resources, cap);
    assert.equal(full.limits.resourceIdentities, 2000);
    assert.equal(full.resources.length, cap);
    assert.equal(full.counts.resource, 2000);
    assert.equal(full.resourceDropped, 2000 - cap);
    f.resources(Array.from({ length: 3000 }, (_, id) => resource(id)));
    const overflow = f.snapshot();
    assert.equal(overflow.resourceStatus, "overflow-indeterminate");
    assert.equal(overflow.resourceDropped, null);
    assert.equal(overflow.resourceDroppedAtLeast, 2000 - cap);
    assert.equal(overflow.counts.resource, null);
    assert.equal(overflow.resourceIdentities, 2000);
    assert.deepEqual(overflow.resources, full.resources);
    assert.deepEqual(f.snapshot(), overflow);
    f.resources([resource(0)]);
    assert.deepEqual(f.snapshot(), overflow);
  });
}

test("constructor and observe failures are surfaced independently without leaking error text", () => {
  const f = harness({ constructorFailure: 0, observeFailure: "event" });
  f.vitals.install();
  const snapshot = f.snapshot();
  assert.equal(snapshot.status.longtask, "failed");
  assert.equal(snapshot.status.event, "failed");
  assert.equal(snapshot.counts.longtask, null);
  assert.equal(snapshot.counts.event, null);
  assert.deepEqual(snapshot.failures, [{ type: "longtask", stage: "constructor" }, { type: "event", stage: "observe" }]);
  assert.equal(f.instances[3].disconnected, 1);
  assert.equal(snapshot.counts["layout-shift"], 0);
  assert.doesNotMatch(JSON.stringify(snapshot), /sensitive/);
  f.vitals.install();
  assert.equal(f.instances.length, 4);
});

test("resource read failure is distinct from an observed empty buffer and diagnostics are bounded", () => {
  const f = harness({ performance: { getEntriesByType: () => { throw new Error("private failure"); } } });
  for (let i = 0; i < 20; i++) {
    const snapshot = f.snapshot();
    assert.equal(snapshot.resourceStatus, "failed");
    assert.equal(snapshot.counts.resource, null);
    assert.equal(snapshot.resourceDropped, null);
    assert.deepEqual(snapshot.failures, [{ type: "resource", stage: "read" }]);
  }
  assert.equal(harness().snapshot().counts.resource, 0);
});

test("stop disconnects all observers once, ignores queued delivery and does not reinstall", () => {
  const f = harness({ disconnectFailure: "longtask" });
  f.vitals.install();
  f.deliver("event", [{ startTime: 0 }]);
  f.vitals.stop(); f.vitals.stop(); f.vitals.install();
  for (const observer of f.instances) assert.equal(observer.disconnected, 1);
  f.deliver("event", [{ startTime: 1 }]);
  const snapshot = f.snapshot();
  assert.equal(snapshot.entries.length, 1);
  assert.equal(snapshot.counts.event, 1);
  assert.equal(snapshot.stopped, true);
  assert.ok(Object.values(snapshot.status).every(value => value === "stopped"));
  assert.deepEqual(snapshot.failures, [{ type: "longtask", stage: "disconnect" }]);
  assert.equal(f.instances.length, 4);
  const early = harness(); early.vitals.stop(); early.vitals.install();
  assert.equal(early.instances.length, 0);
});

test("invalid caps are rejected and snapshots contain no INP or pass verdict", () => {
  const f = harness();
  for (const maxEntries of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => f.create({ maxEntries }), /Invalid browser vitals entry cap/);
  }
  for (const maxResources of [0, -1, 1.5, NaN, Infinity, -Infinity, 2001, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, "2000", null, true, {}, [], 2000n, Symbol("2000")]) {
    assert.throws(() => f.create({ maxResources }), /Invalid browser vitals resource cap/);
  }
  const snapshot = f.snapshot();
  assert.equal(snapshot.inp, undefined);
  assert.equal(snapshot.passed, undefined);
  assert.match(snapshot.notes.join(" "), /no field INP/);
  assert.deepEqual(f.attempts, []);
});
