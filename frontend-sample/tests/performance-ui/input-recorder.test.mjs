import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import vm from "node:vm";
import {transformSync} from "esbuild";

function fixture(options = {}) {
  const module = {exports: {}};
  const code = transformSync(readFileSync(new URL("./input-recorder.ts", import.meta.url), "utf8"), {
    loader: "ts",
    format: "cjs",
  }).code;
  vm.runInNewContext(code, {module, exports: module.exports, structuredClone});
  let at = 0;
  let serial = 0;
  let environment = {visibility: "visible", focused: true};
  const frames = new Map();
  const scheduledFrames = new Map();
  const timers = new Map();
  const scheduledTimers = new Map();
  const recorder = module.exports.createInputRecorder({
    ...options,
    clock: () => at,
    environment: () => ({...environment}),
    frame: (callback) => {
      const id = ++serial;
      frames.set(id, callback);
      scheduledFrames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => frames.delete(id),
    setTimer: (callback, delay) => {
      const id = ++serial;
      const timer = {callback, deadline: at + delay};
      timers.set(id, timer);
      scheduledTimers.set(id, timer);
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  return {
    recorder,
    frames,
    scheduledFrames,
    timers,
    scheduledTimers,
    time: (value) => { at = value; },
    environment: (value) => { environment = {...environment, ...value}; },
    flush: (value) => {
      at = value;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(at);
    },
    expire: (value) => {
      at = value;
      for (const [id, timer] of [...timers]) {
        if (timer.deadline > at) continue;
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

function commit(f, {data = null, surface = "market", stateKey = "token=all", condition = "normal", rowCount = 3} = {}) {
  return f.recorder.commit({data, surface, stateKey, condition, rowCount});
}

function begin(f, options = {}) {
  const id = f.recorder.beginAction({action: "sort", surface: "market", ...options});
  assert.equal(typeof id, "string");
  return id;
}

function snapshot(f) {
  return JSON.parse(JSON.stringify(f.recorder.snapshot()));
}

function sampleFor(f, id) {
  const samples = snapshot(f).samples.filter((sample) => sample.id === id);
  assert.equal(samples.length, 1, `expected one sample for ${id}`);
  return samples[0];
}

function assertInvalid(sample, reason) {
  assert.equal(sample.valid, false);
  assert.equal(sample.handlerToCommitMs, null);
  assert.equal(sample.handlerToFrameMs, null);
  assert.equal(sample.source, "unclassified");
  assert.ok(sample.reasons.some((value) => typeof reason === "string" ? value === reason : reason.test(value)), JSON.stringify(sample.reasons));
}

function assertMeasured(sample, {start, commitAt, frameAt}) {
  assert.equal(sample.valid, true);
  assert.equal(sample.startedAt, start);
  assert.equal(sample.commitAt, commitAt);
  assert.equal(sample.frameAt, frameAt);
  assert.equal(sample.handlerToCommitMs, commitAt - start);
  assert.equal(sample.handlerToFrameMs, frameAt - start);
  assert.equal(sample.source, "unclassified");
  assert.deepEqual(sample.reasons, []);
}

test("same-cache local UI changes measure handler intervals without API requests", () => {
  const f = fixture();
  const data = {rows: []};
  commit(f, {data});
  assert.equal(snapshot(f).samples.length, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  f.time(24);
  commit(f, {data, stateKey: "sort=price"});
  f.flush(32);
  const sample = sampleFor(f, id);
  assert.equal(sample.action, "sort");
  assert.equal(sample.surface, "market");
  assert.equal(sample.expectedStateKey, "sort=price");
  assertMeasured(sample, {start: 10, commitAt: 24, frameAt: 32});
  assert.equal(f.timers.size, 0);
});

test("route actions require both the exact target surface and exact expected state", () => {
  const f = fixture();
  const expectedStateKey = '["MockUSDC","scheduled",null]';
  commit(f, {surface: "assets", stateKey: '["all","all",null]'});
  f.time(10);
  const id = begin(f, {action: "navigate-assets", surface: "assets", expectedStateKey, navigation: true});
  f.time(15);
  commit(f, {surface: "market", stateKey: expectedStateKey});
  f.time(18);
  commit(f, {surface: "assets", stateKey: '["MockUSDC","completed",null]'});
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 1);
  f.time(23);
  commit(f, {surface: "assets", stateKey: expectedStateKey});
  f.flush(30);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 23, frameAt: 30});
});

test("expected state matching does not normalize or partially match query strings", () => {
  const f = fixture();
  f.time(10);
  const id = begin(f, {expectedStateKey: "token=MockUSDC&sort=price"});
  f.time(15);
  commit(f, {stateKey: "sort=price&token=MockUSDC"});
  commit(f, {stateKey: "token=MockUSDC&sort=price&claim=3"});
  assert.equal(f.frames.size, 0);
  f.time(20);
  commit(f, {stateKey: "token=MockUSDC&sort=price"});
  f.flush(25);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 20, frameAt: 25});
});

test("an action without an expected key still cannot consume another surface's commit", () => {
  const f = fixture();
  f.time(5);
  const id = begin(f, {action: "open-detail", surface: "assets"});
  f.time(9);
  commit(f, {surface: "market"});
  assert.equal(f.frames.size, 0);
  f.time(12);
  commit(f, {surface: "assets", stateKey: "claim=3"});
  f.flush(20);
  assertMeasured(sampleFor(f, id), {start: 5, commitAt: 12, frameAt: 20});
});

test("refresh waits for changed data and ignores loading and refreshing commits", () => {
  const f = fixture();
  const original = {rows: []};
  const replacement = {rows: []};
  commit(f, {data: original});
  f.time(10);
  const id = begin(f, {action: "refresh", expectedStateKey: "token=all", requiresDataChange: true});
  f.time(15);
  commit(f, {data: original});
  f.time(20);
  commit(f, {data: replacement, condition: "loading"});
  f.time(25);
  commit(f, {data: replacement, condition: "refreshing"});
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 1);
  f.time(30);
  commit(f, {data: replacement});
  f.flush(40);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 30, frameAt: 40});
});

test("data change compares object identity with the baseline captured at action start", () => {
  const f = fixture();
  const data = {rows: []};
  commit(f, {data});
  f.time(10);
  const id = begin(f, {action: "refresh", requiresDataChange: true});
  data.rows.push(1);
  f.time(15);
  commit(f, {data});
  assert.equal(f.frames.size, 0);
  f.time(20);
  commit(f, {data: {rows: [1]}});
  f.flush(30);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 20, frameAt: 30});
});

test("data baselines remain local to each surface even before any action starts", () => {
  const f = fixture();
  const marketData = {};
  const assetsData = {};
  commit(f, {data: assetsData, surface: "assets"});
  commit(f, {data: marketData, surface: "market"});
  f.time(10);
  const id = begin(f, {action: "refresh-assets", surface: "assets", requiresDataChange: true});
  f.time(15);
  commit(f, {data: assetsData, surface: "assets"});
  assert.equal(f.frames.size, 0);
  f.time(20);
  commit(f, {data: marketData, surface: "assets"});
  f.flush(30);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 20, frameAt: 30});
});

test("loading and refreshing cannot complete ordinary state changes either", () => {
  const f = fixture();
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  for (const condition of ["loading", "refreshing"]) commit(f, {stateKey: "sort=price", condition});
  assert.equal(f.frames.size, 0);
  f.time(20);
  commit(f, {stateKey: "sort=price"});
  f.flush(30);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 20, frameAt: 30});
});

test("an already-current expected state creates an invalid no-op with null timings", () => {
  const f = fixture();
  commit(f, {stateKey: "sort=price"});
  f.time(10);
  f.recorder.beginAction({action: "sort", surface: "market", expectedStateKey: "sort=price"});
  const state = snapshot(f);
  assert.equal(state.samples.length, 1);
  assertInvalid(state.samples[0], /no-op/);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
});

test("navigation can target an already-current key without becoming a local no-op", () => {
  const f = fixture();
  commit(f, {stateKey: ""});
  f.time(10);
  const id = begin(f, {action: "navigate-market", expectedStateKey: "", navigation: true});
  f.time(20);
  commit(f, {stateKey: ""});
  f.flush(30);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 20, frameAt: 30});
});

test("another surface's current key does not turn the target action into a no-op", () => {
  const f = fixture();
  commit(f, {surface: "market", stateKey: "detail"});
  commit(f, {surface: "assets", stateKey: "overview"});
  f.time(10);
  const id = begin(f, {action: "open-detail", surface: "assets", expectedStateKey: "detail"});
  f.time(20);
  commit(f, {surface: "assets", stateKey: "detail"});
  f.flush(30);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 20, frameAt: 30});
});

test("the default deadline expires unmatched actions and ignores later commits", () => {
  const f = fixture();
  f.time(100);
  const id = begin(f, {expectedStateKey: "sort=price"});
  assert.equal([...f.timers.values()][0].deadline, 5100);
  f.expire(5099);
  assert.equal(f.timers.size, 1);
  f.expire(5100);
  const timedOut = sampleFor(f, id);
  assertInvalid(timedOut, "timeout");
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
  f.time(5200);
  commit(f, {stateKey: "sort=price"});
  f.flush(5300);
  assert.deepEqual(sampleFor(f, id), timedOut);
});

test("unrelated commits do not extend a configured deadline or become its UI result", () => {
  const f = fixture({timeoutMs: 50});
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  f.time(40);
  commit(f, {surface: "assets", stateKey: "sort=price"});
  commit(f, {surface: "market", stateKey: "sort=review"});
  f.expire(60);
  const sample = sampleFor(f, id);
  assertInvalid(sample, "timeout");
  assert.equal(sample.commitAt, null);
  assert.equal(sample.frameAt, null);
  assert.equal(f.frames.size, 0);
});

test("a matching commit before the deadline cannot time out while its frame is delayed", () => {
  const f = fixture({timeoutMs: 50});
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  f.time(59);
  commit(f, {stateKey: "sort=price"});
  f.expire(60);
  f.flush(90);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 59, frameAt: 90});
  assert.equal(f.timers.size, 0);
});

test("the default frame deadline gets a fresh five seconds after a late matching commit", () => {
  const f = fixture();
  f.time(100);
  const id = begin(f, {expectedStateKey: "sort=price"});
  const [commitTimerId, commitTimer] = [...f.timers][0];
  assert.equal(commitTimer.deadline, 5100);
  f.time(5099);
  commit(f, {stateKey: "sort=price"});
  assert.equal(f.timers.has(commitTimerId), false);
  assert.equal(f.timers.size, 1);
  const [frameTimerId, frameTimer] = [...f.timers][0];
  assert.notEqual(frameTimerId, commitTimerId);
  assert.equal(frameTimer.deadline, 10099);
  f.expire(5100);
  f.expire(10098);
  assert.equal(f.timers.has(frameTimerId), true);
  assert.equal(f.frames.size, 1);
  assert.equal(sampleFor(f, id).frameAt, null);
  assert.deepEqual(sampleFor(f, id).reasons, []);
  f.flush(10098);
  assertMeasured(sampleFor(f, id), {start: 100, commitAt: 5099, frameAt: 10098});
  assert.equal(f.timers.size, 0);
});

test("frame-timeout cancels the pending frame and rejects its late callback", () => {
  const f = fixture({timeoutMs: 50});
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  f.time(59);
  commit(f, {stateKey: "sort=price"});
  const callback = [...f.scheduledFrames.values()][0];
  const frameTimer = [...f.timers.values()][0];
  assert.equal(frameTimer.deadline, 109);
  assert.equal(f.frames.size, 1);
  f.expire(108);
  assert.equal(f.timers.size, 1);
  assert.equal(f.frames.size, 1);
  f.expire(109);
  const timedOut = sampleFor(f, id);
  assertInvalid(timedOut, "frame-timeout");
  assert.equal(timedOut.commitAt, 59);
  assert.equal(timedOut.frameAt, null);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
  f.time(200);
  callback(200);
  callback(200);
  frameTimer.callback();
  assert.deepEqual(sampleFor(f, id), timedOut);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
});

test("duplicate old commit deadlines are ignored while the matched frame is still pending", () => {
  const f = fixture({timeoutMs: 50});
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  const oldTimer = [...f.timers.values()][0];
  f.time(20);
  commit(f, {stateKey: "sort=price"});
  const [frameTimerId, frameTimer] = [...f.timers][0];
  assert.equal(frameTimer.deadline, 70);
  const matched = sampleFor(f, id);
  f.time(60);
  oldTimer.callback();
  oldTimer.callback();
  assert.deepEqual(sampleFor(f, id), matched);
  assert.equal(f.timers.size, 1);
  assert.equal(f.timers.has(frameTimerId), true);
  assert.equal(f.frames.size, 1);
  f.flush(65);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 20, frameAt: 65});
  assert.equal(f.timers.size, 0);
});

for (const phase of ["commit", "frame"]) {
  test(`interrupting before ${phase} clears work and cannot become valid after visibility returns`, () => {
    const f = fixture();
    f.time(10);
    const id = begin(f, {expectedStateKey: "sort=price"});
    if (phase === "frame") {
      f.time(20);
      commit(f, {stateKey: "sort=price"});
      assert.equal(f.frames.size, 1);
    }
    const callbacks = [...f.scheduledFrames.values()];
    const deadlines = [...f.scheduledTimers.values()];
    f.time(25);
    f.environment({visibility: "hidden"});
    f.recorder.interrupt("hidden");
    const interrupted = sampleFor(f, id);
    assertInvalid(interrupted, "hidden");
    assert.equal(interrupted.commitAt, phase === "commit" ? null : 20);
    assert.equal(interrupted.frameAt, null);
    assert.equal(f.timers.size, 0);
    assert.equal(f.frames.size, 0);
    f.time(30);
    f.environment({visibility: "visible"});
    commit(f, {stateKey: "sort=price"});
    assert.equal(f.frames.size, 0);
    f.time(40);
    for (const callback of callbacks) {
      callback(40);
      callback(40);
    }
    for (const timer of deadlines) {
      timer.callback();
      timer.callback();
    }
    f.flush(50);
    assert.deepEqual(sampleFor(f, id), interrupted);
    assert.equal(f.timers.size, 0);
    assert.equal(f.frames.size, 0);
  });
}

for (const condition of ["stale", "pending-index"]) {
  test(`${condition} commits retain non-normal-data and null handler intervals after their frame`, () => {
    const f = fixture();
    f.time(10);
    const id = begin(f, {expectedStateKey: "sort=price"});
    f.time(20);
    commit(f, {data: {}, stateKey: "sort=price", condition});
    assertInvalid(sampleFor(f, id), "non-normal-data");
    f.flush(30);
    const sample = sampleFor(f, id);
    assertInvalid(sample, "non-normal-data");
    assert.equal(sample.condition, condition);
    assert.equal(sample.commitAt, 20);
    assert.equal(sample.frameAt, 30);
    assert.equal(f.timers.size, 0);
    assert.equal(f.frames.size, 0);
  });
}

for (const change of ["replacement", "same-object", "same-null"]) {
  test(`failure with ${change} data is terminal error UI and clears its deadline`, () => {
    const f = fixture();
    const before = change === "same-null" ? null : {};
    commit(f, {data: before});
    f.time(10);
    const id = begin(f, {action: "refresh", requiresDataChange: true});
    f.time(20);
    commit(f, {data: change === "replacement" ? {} : before, condition: "failure"});
    assertInvalid(sampleFor(f, id), "terminal-error-ui");
    assert.equal(f.timers.size, 0);
    f.flush(30);
    assertInvalid(sampleFor(f, id), "terminal-error-ui");
  });
}

test("cleanup before the frame rejects late callbacks and clears the action timer", () => {
  const f = fixture();
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  f.time(20);
  const cleanup = commit(f, {stateKey: "sort=price"});
  const callbacks = [...f.scheduledFrames.values()];
  assert.equal(typeof cleanup, "function");
  cleanup();
  cleanup();
  assert.equal(f.frames.size, 0);
  assert.equal(f.timers.size, 0);
  const cancelled = sampleFor(f, id);
  assertInvalid(cancelled, /cancel.*superseded/);
  f.time(30);
  for (const callback of callbacks) callback(30);
  assert.deepEqual(sampleFor(f, id), cancelled);
});

test("duplicate frame and timer callbacks cannot duplicate or overwrite a finished sample", () => {
  const f = fixture();
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  const timer = [...f.scheduledTimers.values()][0];
  f.time(20);
  const cleanup = commit(f, {stateKey: "sort=price"});
  const callbacks = [...f.scheduledFrames.values()];
  f.flush(30);
  const completed = sampleFor(f, id);
  assertMeasured(completed, {start: 10, commitAt: 20, frameAt: 30});
  f.time(6000);
  for (const callback of callbacks) callback(6000);
  timer.callback();
  cleanup();
  assert.deepEqual(sampleFor(f, id), completed);
  assert.equal(snapshot(f).samples.length, 1);
  assert.equal(f.timers.size, 0);
});

test("duplicate commits cannot replace the first matched commit or create duplicate samples", () => {
  const f = fixture();
  const data = {};
  f.time(10);
  const id = begin(f, {expectedStateKey: "sort=price"});
  f.time(20);
  commit(f, {data, stateKey: "sort=price"});
  f.time(25);
  commit(f, {data, stateKey: "sort=price"});
  f.flush(30);
  assertMeasured(sampleFor(f, id), {start: 10, commitAt: 20, frameAt: 30});
  assert.equal(snapshot(f).samples.length, 1);
});

test("new actions supersede unfinished actions and ignore their old target commits", () => {
  const f = fixture();
  f.time(10);
  const oldId = begin(f, {action: "sort-price", expectedStateKey: "sort=price"});
  const oldTimer = [...f.scheduledTimers.values()][0];
  f.time(20);
  const newId = begin(f, {action: "sort-review", expectedStateKey: "sort=review"});
  assert.notEqual(oldId, newId);
  assertInvalid(sampleFor(f, oldId), "superseded");
  assert.equal(f.timers.size, 1);
  f.time(25);
  oldTimer.callback();
  commit(f, {stateKey: "sort=price"});
  assert.equal(f.frames.size, 0);
  f.time(30);
  commit(f, {stateKey: "sort=review"});
  f.flush(40);
  assertMeasured(sampleFor(f, newId), {start: 20, commitAt: 30, frameAt: 40});
  assertInvalid(sampleFor(f, oldId), "superseded");
  assert.equal(f.timers.size, 0);
});

test("superseding a pending frame prevents its late callback from finishing either action", () => {
  const f = fixture();
  f.time(10);
  const oldId = begin(f, {expectedStateKey: "sort=price"});
  f.time(20);
  commit(f, {stateKey: "sort=price"});
  const oldCallbacks = [...f.scheduledFrames.values()];
  f.time(25);
  const newId = begin(f, {action: "open-detail", surface: "assets", expectedStateKey: "claim=3"});
  f.time(30);
  for (const callback of oldCallbacks) callback(30);
  assertInvalid(sampleFor(f, oldId), "superseded");
  f.time(35);
  commit(f, {surface: "assets", stateKey: "claim=3"});
  f.flush(45);
  assertMeasured(sampleFor(f, newId), {start: 25, commitAt: 35, frameAt: 45});
  assertInvalid(sampleFor(f, oldId), "superseded");
});

for (const environment of [{visibility: "hidden", focused: true}, {visibility: "visible", focused: false}]) {
  for (const phase of ["commit", "frame"]) {
    test(`${JSON.stringify(environment)} at ${phase} cannot yield a valid input sample`, () => {
      const f = fixture();
      f.time(10);
      const id = begin(f, {expectedStateKey: "sort=price"});
      if (phase === "commit") f.environment(environment);
      f.time(20);
      commit(f, {stateKey: "sort=price"});
      if (phase === "commit") f.environment({visibility: "visible", focused: true});
      else f.environment(environment);
      f.flush(30);
      assertInvalid(sampleFor(f, id), environment.focused ? /hidden|visibility/ : /unfocused|focus/);
      assert.equal(f.timers.size, 0);
    });
  }
}

test("sample overflow is counted, bounded and never turns rejected actions into zero-duration successes", () => {
  const f = fixture({maxSamples: 3, maxEvents: 1000});
  for (let index = 0; index < 20; index++) {
    const start = index * 20 + 1;
    f.time(start);
    const id = f.recorder.beginAction({action: `sort-${index}`, surface: "market", expectedStateKey: `sort=${index}`});
    f.time(start + 5);
    commit(f, {stateKey: `sort=${index}`});
    f.flush(start + 10);
    const state = snapshot(f);
    assert.ok(state.samples.length <= 3);
    assert.ok(state.events.length <= 1000);
    for (const sample of state.samples.filter((sample) => sample.valid)) {
      assert.ok(sample.handlerToCommitMs > 0);
      assert.ok(sample.handlerToFrameMs > 0);
      assert.equal(sample.source, "unclassified");
    }
    if (id === null) assert.equal(f.timers.size, 0);
  }
  assert.ok(snapshot(f).dropped > 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
});

test("event overflow is independently counted while its buffer stays hard bounded", () => {
  const f = fixture({maxSamples: 100, maxEvents: 5});
  for (let index = 0; index < 20; index++) {
    f.time(index * 20 + 1);
    f.recorder.beginAction({action: `sort-${index}`, surface: "market", expectedStateKey: `sort=${index}`});
    f.time(index * 20 + 6);
    commit(f, {stateKey: `sort=${index}`});
    f.flush(index * 20 + 11);
    const state = snapshot(f);
    assert.ok(state.events.length <= 5);
    assert.ok(state.samples.length <= 100);
    for (const sample of state.samples) {
      assert.equal(sample.source, "unclassified");
      if (sample.valid) {
        assert.ok(sample.handlerToCommitMs > 0);
        assert.ok(sample.handlerToFrameMs > 0);
      }
    }
  }
  assert.ok(snapshot(f).dropped > 0);
  assert.equal(f.timers.size, 0);
});

test("the default sample limit bounds a burst of overlapping actions and their live timers", () => {
  const f = fixture();
  for (let index = 0; index < 550; index++) {
    f.time(index + 1);
    f.recorder.beginAction({action: `action-${index}`, surface: "market", expectedStateKey: `state-${index}`});
    assert.ok(f.timers.size <= 1);
  }
  f.expire(10000);
  const state = snapshot(f);
  assert.ok(state.samples.length <= 500);
  assert.ok(state.events.length <= 4000);
  assert.ok(state.dropped > 0);
  assert.equal(new Set(state.samples.map((sample) => sample.id)).size, state.samples.length);
  assert.equal(state.samples.filter((sample) => sample.valid).length, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
});
