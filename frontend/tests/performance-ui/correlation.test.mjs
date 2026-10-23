import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import vm from "node:vm";
import {transformSync} from "esbuild";

function fixture(options = {}) {
  const module = {exports: {}};
  const code = transformSync(readFileSync(new URL("./recorder.ts", import.meta.url), "utf8"), {
    loader: "ts",
    format: "cjs",
  }).code;
  vm.runInNewContext(code, {module, exports: module.exports, structuredClone});
  let at = 0;
  let nextFrame = 0;
  let environment = {visibility: "visible", focused: true};
  const pending = new Map();
  const scheduled = new Map();
  const recorder = module.exports.createUiRecorder({
    ...options,
    clock: () => at,
    frame: (callback) => {
      const id = ++nextFrame;
      pending.set(id, callback);
      scheduled.set(id, callback);
      return id;
    },
    cancelFrame: (id) => pending.delete(id),
    environment: () => ({...environment}),
  });
  return {
    recorder,
    pending,
    scheduled,
    time: (value) => { at = value; },
    environment: (value) => { environment = {...environment, ...value}; },
    flush: (value) => {
      at = value;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(at);
    },
  };
}

function complete(f, request, start = 1) {
  f.time(start);
  request.headers(200, `gateway-${request.id}`);
  f.time(start + 2);
  request.body();
  f.time(start + 5);
  request.parsed();
  f.time(start + 7);
  request.validated();
}

function bound(f, start = 1) {
  const batchId = f.recorder.beginBatch();
  const request = f.recorder.request(batchId, "/streams");
  complete(f, request, start);
  const data = {};
  f.recorder.bindSnapshot(data, batchId);
  return {batchId, request, data};
}

function commit(f, data, stateKey = "initial", surface = "market") {
  return f.recorder.commit({data, surface, stateKey, rowCount: 4, condition: "ready"});
}

function snapshot(f) {
  // The recorder runs in a VM; compare plain values in the test's realm.
  return JSON.parse(JSON.stringify(f.recorder.snapshot()));
}

function sampleFor(f, stateKey) {
  const samples = snapshot(f).samples.filter((sample) => sample.stateKey === stateKey);
  assert.equal(samples.length, 1, `expected one sample for ${stateKey}`);
  return samples[0];
}

function assertInvalidPair(sample) {
  assert.equal(sample.valid, false);
  assert.equal(sample.bodyToCommitMs, null);
  assert.equal(sample.bodyToFrameMs, null);
  assert.ok(sample.reasons.length > 0);
}

test("concurrent batches retain their own exact requests when completion order reverses", () => {
  const f = fixture();
  const slowBatch = f.recorder.beginBatch();
  const slow = f.recorder.request(slowBatch, "/streams/slow");
  f.time(1);
  const fastBatch = f.recorder.beginBatch();
  const fast = f.recorder.request(fastBatch, "/streams/fast");
  assert.notEqual(slow.id, fast.id);
  complete(f, fast, 2);
  const fastData = {};
  f.recorder.bindSnapshot(fastData, fastBatch);
  f.time(12);
  commit(f, fastData, "fast");
  f.flush(16);
  complete(f, slow, 20);
  const slowData = {};
  f.recorder.bindSnapshot(slowData, slowBatch);
  f.time(30);
  commit(f, slowData, "slow");
  f.flush(36);

  const fastSample = sampleFor(f, "fast");
  const slowSample = sampleFor(f, "slow");
  assert.deepEqual(fastSample.requestIds, [fast.id]);
  assert.deepEqual(slowSample.requestIds, [slow.id]);
  assert.notEqual(fastSample.snapshotId, slowSample.snapshotId);
  assert.equal(fastSample.valid, true);
  assert.equal(slowSample.valid, true);
  assert.equal(fastSample.bodyToCommitMs, 8);
  assert.equal(fastSample.commitToFrameMs, 4);
  assert.equal(fastSample.bodyToFrameMs, 12);
  assert.equal(slowSample.bodyToCommitMs, 8);
  assert.equal(slowSample.commitToFrameMs, 6);
  assert.equal(slowSample.bodyToFrameMs, 14);
});

test("a snapshot includes every child request and ignores the global latest request", () => {
  const f = fixture();
  const batchId = f.recorder.beginBatch();
  const streams = f.recorder.request(batchId, "/streams");
  const listings = f.recorder.request(batchId, "/listings");
  complete(f, streams, 1);
  complete(f, listings, 10);
  const data = {};
  f.recorder.bindSnapshot(data, batchId);
  const unrelatedBatch = f.recorder.beginBatch();
  const unrelated = f.recorder.request(unrelatedBatch, "/health");
  complete(f, unrelated, 20);
  f.time(30);
  commit(f, data, "children");
  f.flush(40);

  const sample = sampleFor(f, "children");
  assert.deepEqual([...sample.requestIds].sort(), [streams.id, listings.id].sort());
  assert.equal(sample.valid, true);
  assert.equal(sample.bodyToCommitMs, 18);
  assert.equal(sample.bodyToFrameMs, 28);
  assert.deepEqual(sample.requestIntervals.map((interval) => ({
    id: interval.id,
    bodyToCommitMs: interval.bodyToCommitMs,
    bodyToFrameMs: interval.bodyToFrameMs,
  })), [
    {id: streams.id, bodyToCommitMs: 27, bodyToFrameMs: 37},
    {id: listings.id, bodyToCommitMs: 18, bodyToFrameMs: 28},
  ]);
});

for (const failure of ["no-requests", "missing-body", "missing-parse", "missing-validation", "failed-request", "failed-batch"]) {
  test(`${failure} cannot produce a valid API pair or numeric API intervals`, () => {
    const f = fixture();
    const batchId = f.recorder.beginBatch();
    const successful = failure === "no-requests" ? null : f.recorder.request(batchId, "/streams");
    if (successful) complete(f, successful);
    if (["missing-body", "missing-parse", "missing-validation", "failed-request"].includes(failure)) {
      const child = f.recorder.request(batchId, "/listings");
      f.time(10);
      child.headers(200, "gateway-incomplete");
      if (failure !== "missing-body") {
        f.time(11);
        child.body();
      }
      if (failure === "missing-validation") {
        f.time(12);
        child.parsed();
      }
      if (failure === "failed-request") {
        f.time(12);
        child.parsed();
        f.time(13);
        child.validated();
        child.failed("network");
      }
    }
    if (failure === "failed-batch") f.recorder.failBatch(batchId, "mapping");
    const data = {};
    f.recorder.bindSnapshot(data, batchId);
    f.time(20);
    commit(f, data, failure);
    f.flush(30);
    assertInvalidPair(sampleFor(f, failure));
  });
}

test("parse, validation and mapping events preserve measured intervals and span results", () => {
  const f = fixture();
  const batchId = f.recorder.beginBatch();
  const request = f.recorder.request(batchId, "/streams");
  complete(f, request, 2);
  f.time(12);
  const data = {rows: []};
  assert.equal(f.recorder.span(batchId, "map-streams", () => {
    f.time(19);
    return data;
  }), data);
  f.recorder.bindSnapshot(data, batchId);
  f.time(25);
  commit(f, data, "mapped");
  f.flush(32);

  const events = snapshot(f).events;
  const event = (kind) => {
    const matches = events.filter((item) => item.kind === kind);
    assert.equal(matches.length, 1, kind);
    return matches[0];
  };
  assert.equal(event("parsed").at - event("body").at, 3);
  assert.equal(event("validated").at - event("parsed").at, 2);
  assert.equal(event("mapping-end").at - event("mapping-start").at, 7);
  assert.equal(sampleFor(f, "mapped").valid, true);
});

test("mapping errors are recorded, rethrown unchanged, and invalidate the batch", () => {
  const f = fixture();
  const batchId = f.recorder.beginBatch();
  const request = f.recorder.request(batchId, "/streams");
  complete(f, request);
  const failure = new Error("mapping failed");
  assert.throws(() => f.recorder.span(batchId, "map-streams", () => { throw failure; }), (error) => error === failure);
  const data = {};
  f.recorder.bindSnapshot(data, batchId);
  f.time(20);
  commit(f, data, "mapping-failed");
  f.flush(30);
  assert.ok(snapshot(f).events.some((event) => event.kind === "mapping-error"));
  assertInvalidPair(sampleFor(f, "mapping-failed"));
});

test("duplicate commits are deduplicated and cache state changes have null API intervals", () => {
  const f = fixture();
  const {data} = bound(f);
  f.time(20);
  commit(f, data, "initial");
  f.flush(30);
  commit(f, data, "initial");
  f.flush(40);
  assert.equal(snapshot(f).samples.length, 1);
  f.time(45);
  commit(f, data, "sorted");
  f.flush(50);
  const cached = sampleFor(f, "sorted");
  assertInvalidPair(cached);
  assert.ok(cached.reasons.includes("reused-snapshot"));
  assert.equal(cached.snapshotId, sampleFor(f, "initial").snapshotId);
});

test("the same snapshot can be committed independently to two surfaces", () => {
  const f = fixture();
  const {data} = bound(f);
  f.time(20);
  commit(f, data, "initial", "market");
  commit(f, data, "initial", "portfolio");
  f.flush(30);
  const samples = snapshot(f).samples;
  assert.equal(samples.length, 2);
  assert.deepEqual(samples.map((sample) => sample.surface).sort(), ["market", "portfolio"]);
  assert.equal(samples[0].snapshotId, samples[1].snapshotId);
});

test("cleanup cancels a pending frame even if its stale callback later fires", () => {
  const f = fixture();
  const {data} = bound(f);
  f.time(20);
  const cleanup = commit(f, data, "cancelled");
  const callbacks = [...f.scheduled.values()];
  assert.equal(typeof cleanup, "function");
  cleanup();
  assert.equal(f.pending.size, 0);
  f.time(30);
  for (const callback of callbacks) callback(30);
  assert.equal(snapshot(f).samples.filter((sample) => sample.valid).length, 0);
  assert.ok(snapshot(f).events.some((event) => event.kind === "cancelled-frame"));
});

test("a newer commit on the same surface supersedes the older pending frame", () => {
  const f = fixture();
  const first = bound(f, 1);
  f.time(20);
  commit(f, first.data, "old");
  const staleCallbacks = [...f.scheduled.values()];
  const second = bound(f, 21);
  f.time(40);
  commit(f, second.data, "new");
  f.time(45);
  for (const callback of staleCallbacks) callback(45);
  f.flush(50);
  const samples = snapshot(f).samples;
  assert.equal(samples.filter((sample) => sample.stateKey === "old" && sample.valid).length, 0);
  assert.equal(sampleFor(f, "new").valid, true);
});

for (const environment of [{visibility: "hidden", focused: true}, {visibility: "visible", focused: false}]) {
  for (const phase of ["commit", "frame"]) {
    test(`${JSON.stringify(environment)} at ${phase} invalidates the sample`, () => {
      const f = fixture();
      const {data} = bound(f);
      if (phase === "commit") f.environment(environment);
      f.time(20);
      commit(f, data, "background");
      if (phase === "commit") f.environment({visibility: "visible", focused: true});
      else f.environment(environment);
      f.flush(30);
      const sample = sampleFor(f, "background");
      assert.equal(sample.valid, false);
      assert.ok(sample.reasons.some((reason) => /hidden|visibility|unfocused|focus/.test(reason)));
    });
  }
}

test("out-of-order request phases record protocol-error without throwing into product code", () => {
  const f = fixture();
  const batchId = f.recorder.beginBatch();
  const request = f.recorder.request(batchId, "/streams");
  assert.doesNotThrow(() => {
    request.parsed();
    complete(f, request);
  });
  const data = {};
  f.recorder.bindSnapshot(data, batchId);
  f.time(20);
  commit(f, data, "protocol");
  f.flush(30);
  assert.ok(snapshot(f).events.some((event) => event.kind === "protocol-error"));
  assertInvalidPair(sampleFor(f, "protocol"));
});

for (const operation of ["request-error", "request-phase", "batch-error", "new-request", "mapping"]) {
  test(`binding freezes request provenance against late ${operation}`, () => {
    const f = fixture();
    const {data, batchId, request} = bound(f);
    f.time(15);
    assert.doesNotThrow(() => {
      if (operation === "request-error") request.failed("late-error");
      if (operation === "request-phase") request.body();
      if (operation === "batch-error") f.recorder.failBatch(batchId, "late-error");
      if (operation === "new-request") complete(f, f.recorder.request(batchId, "/late"), 20);
      if (operation === "mapping") {
        const result = f.recorder.span(batchId, "late-mapping", () => 42);
        assert.equal(result, 42);
      }
    });
    f.time(30);
    commit(f, data, "frozen");
    f.flush(40);
    const sample = sampleFor(f, "frozen");
    assert.deepEqual(sample.requestIds, [request.id]);
    assert.equal(sample.valid, true);
    assert.equal(sample.bodyToCommitMs, 27);
  });
}

test("an incomplete request at binding cannot become valid through late completion", () => {
  const f = fixture();
  const batchId = f.recorder.beginBatch();
  const request = f.recorder.request(batchId, "/streams");
  const data = {};
  f.recorder.bindSnapshot(data, batchId);
  complete(f, request, 1);
  f.time(20);
  commit(f, data, "late-completion");
  f.flush(30);
  assertInvalidPair(sampleFor(f, "late-completion"));
});

for (const data of [null, {}]) {
  test(`unbound ${data === null ? "null" : "object"} data cannot borrow an unrelated request`, () => {
    const f = fixture();
    bound(f);
    f.time(20);
    commit(f, data, "unbound");
    f.flush(30);
    assert.equal(snapshot(f).samples.filter((sample) => sample.valid).length, 0);
    assert.ok(snapshot(f).events.some((event) => event.kind === "unbound-commit"));
  });
}

test("object caps report dropped data and never correlate evicted data with a later batch", () => {
  const f = fixture({maxObjects: 8, maxEvents: 1000});
  const first = bound(f);
  f.time(20);
  commit(f, first.data, "before-overflow");
  f.flush(25);
  const later = [];
  for (let index = 0; index < 40; index++) {
    later.push(bound(f, 30 + index * 10));
    const state = snapshot(f);
    assert.ok(state.retainedObjects <= 8);
  }
  f.time(500);
  commit(f, first.data, "old-bounded");
  f.flush(510);
  f.time(520);
  commit(f, later.at(-1).data, "last-bounded");
  f.flush(530);
  const state = snapshot(f);
  assert.ok(state.dropped > 0);
  assert.ok(state.retainedObjects <= 8);
  assert.ok(state.events.some((event) => event.kind === "overflow"));
  assert.ok(state.samples.length > 0);
  for (const sample of state.samples) {
    const expectedId = sample.stateKey === "old-bounded" ? first.request.id : later.at(-1).request.id;
    if (sample.valid) assert.deepEqual(sample.requestIds, [expectedId]);
  }
});

test("event and sample storage stays bounded under repeated commits and request overflow", () => {
  const f = fixture({maxEvents: 24, maxObjects: 1000});
  for (let index = 0; index < 80; index++) {
    const {data} = bound(f, index * 20 + 1);
    f.time(index * 20 + 10);
    commit(f, data, `bounded-${index}`);
    f.flush(index * 20 + 15);
    const state = snapshot(f);
    assert.ok(state.events.length <= 24);
    assert.ok(state.samples.length <= 1000);
    assert.ok(state.retainedObjects <= 1000);
  }
  assert.ok(snapshot(f).dropped > 0);
});
