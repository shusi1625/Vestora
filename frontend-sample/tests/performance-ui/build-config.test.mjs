import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { build, resolveConfig } from "vite";
import { resolveQaRunConfig, validatePublicManifest, qaEnvironmentDefines } from "./run-config.mjs";

const watchedAddress = `0x${"a".repeat(40)}`;
const planDigest = "b".repeat(64);
const requiredPaths = ["/health", "/metrics", "/streams", `/users/${watchedAddress}/trades`];
const manifest = () => ({ mode: "actual-api", planDigest, watchedAddress, allowedPaths: [...requiredPaths, "/streams/1"] });
const env = { VESTORA_QA_MODE: "actual-api", VESTORA_QA_SESSION_MANIFEST: "C:/synthetic-public/manifest.json" };
const root = resolve(import.meta.dirname, "../..");
const configFile = join(import.meta.dirname, "vite.config.ts");

test("default and explicit fixture ignore manifests without reading a file", () => {
  for (const values of [{}, { VESTORA_QA_MODE: "", VESTORA_QA_SESSION_MANIFEST: "ignored" },
    { VESTORA_QA_MODE: "fixture", VESTORA_QA_SESSION_MANIFEST: "ignored" }]) {
    const config = resolveQaRunConfig(values, () => assert.fail("fixture must never load a manifest"));
    assert.equal(config.mode, "fixture");
    assert.equal(config.source, "LOCAL FIXTURE");
    assert.equal(config.outDir, "qa-ui-dist");
    assert.equal(config.watchedAddress, `0x${"2".repeat(40)}`);
    assert.deepEqual(config.allowedPaths, []);
  }
});

test("actual config reads only the explicit local public manifest and copies immutable public fields", () => {
  const value = manifest(), reads = [];
  const config = resolveQaRunConfig(env, filename => { reads.push(filename); return JSON.stringify(value); });
  assert.deepEqual(reads, [env.VESTORA_QA_SESSION_MANIFEST]);
  assert.equal(config.mode, "actual-api");
  assert.equal(config.outDir, "qa-ui-actual-dist");
  assert.equal(config.source, "ACTUAL API VIA BOUNDED GATEWAY");
  assert.equal(config.planDigest, planDigest);
  assert.equal(config.watchedAddress, watchedAddress);
  value.allowedPaths.push("/streams/2");
  assert.equal(config.allowedPaths.length, 5);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.allowedPaths));
  assert.equal(JSON.stringify(config).includes("synthetic-public"), false);
});

test("missing, relative, UNC, URL and ambiguous manifest paths fail before reading", () => {
  for (const filename of [undefined, "", "manifest.json", "../manifest.json", "C:manifest.json",
    "\\\\server\\share\\manifest.json", "//server/share/manifest.json", "https://example.invalid/manifest.json",
    "file:///tmp/manifest.json", " C:/manifest.json", "C:/manifest.json ", "C:/a\0.json"]) {
    let reads = 0;
    assert.throws(() => resolveQaRunConfig({ ...env, VESTORA_QA_SESSION_MANIFEST: filename },
      () => { reads++; return JSON.stringify(manifest()); }), /Invalid QA public session manifest/);
    assert.equal(reads, 0);
  }
  for (const mode of ["actual", "ACTUAL-API", "Fixture", "actual-api ", "fixture ", "unknown"]) {
    assert.throws(() => resolveQaRunConfig({ VESTORA_QA_MODE: mode }, () => assert.fail("invalid mode must not read")), /Invalid QA mode/);
  }
  assert.throws(() => resolveQaRunConfig(env), /Invalid QA public session manifest/);
});

test("mixed-separator UNC and Windows device paths fail before invoking readManifest", () => {
  const paths = [
    String.raw`\\server\share\manifest.json`, "//server/share/manifest.json",
    String.raw`/\server\share\manifest.json`, String.raw`\/server/share/manifest.json`,
    String.raw`\\?\C:\manifest.json`, "//?/C:/manifest.json",
    String.raw`/\?\C:\manifest.json`, String.raw`\/?/C:/manifest.json`,
    String.raw`\\.\C:\manifest.json`, "//./C:/manifest.json",
    String.raw`/\.\C:\manifest.json`, String.raw`\/./C:/manifest.json`,
    String.raw`\\?\UNC\server\share\manifest.json`, String.raw`/\?\UNC\server\share\manifest.json`,
    String.raw`\??\C:\manifest.json`, "/??/C:/manifest.json",
    String.raw`/??\C:\manifest.json`, String.raw`\??/C:/manifest.json`,
  ];
  for (const filename of paths) {
    const reads = [];
    assert.throws(() => resolveQaRunConfig({ ...env, VESTORA_QA_SESSION_MANIFEST: filename },
      path => { reads.push(path); return JSON.stringify(manifest()); }), /Invalid QA public session manifest/, filename);
    assert.deepEqual(reads, [], filename);
  }
});

test("normal Windows and POSIX absolute paths reach readManifest unchanged", () => {
  for (const filename of ["C:/synthetic-public/manifest.json", String.raw`C:\synthetic-public\manifest.json`,
    String.raw`C:/synthetic-public\manifest.json`, "c:/synthetic-public/manifest.json",
    "/tmp/synthetic-public/manifest.json", "/manifest.json"]) {
    const reads = [];
    const config = resolveQaRunConfig({ ...env, VESTORA_QA_SESSION_MANIFEST: filename },
      path => { reads.push(path); return JSON.stringify(manifest()); });
    assert.deepEqual(reads, [filename]);
    assert.equal(config.mode, "actual-api");
  }
});

test("manifest loading errors are sanitized and never contain file paths or file contents", () => {
  for (const read of [() => { throw new Error("PRIVATE APPROVAL PATH"); }, () => "SECRET invalid json"]) {
    assert.throws(() => resolveQaRunConfig(env, read), error => error.message === "Invalid QA public session manifest");
  }
});

test("manifest requires exactly the public schema and rejects authorization attributes", () => {
  for (const value of [null, [], {}, "manifest", { ...manifest(), mode: "fixture" },
    ...["approved", "status", "token", "credentials", "expiresAt", "runId"].map(key => ({ ...manifest(), [key]: true }))]) {
    assert.throws(() => validatePublicManifest(value), /Invalid QA public session manifest/);
  }
  for (const key of Object.keys(manifest())) {
    const value = manifest(); delete value[key];
    assert.throws(() => validatePublicManifest(value), /Invalid QA public session manifest/, key);
  }
});

test("digest and watched address are validated and watch paths use lowercase canonical addresses", () => {
  for (const planDigest of [null, 1, "a".repeat(63), "a".repeat(65), "g".repeat(64), "0x" + "a".repeat(64), "a".repeat(64) + "\n"]) {
    assert.throws(() => validatePublicManifest({ ...manifest(), planDigest }), /Invalid QA public session manifest/);
  }
  for (const watchedAddress of [null, 1, "0x1234", "0x" + "g".repeat(40), " " + manifest().watchedAddress, manifest().watchedAddress + "\n"]) {
    assert.throws(() => validatePublicManifest({ ...manifest(), watchedAddress }), /Invalid QA public session manifest/);
  }
  assert.equal(validatePublicManifest({ ...manifest(), watchedAddress: `0x${"A".repeat(40)}` }).watchedAddress, watchedAddress);
  assert.throws(() => validatePublicManifest({ ...manifest(), allowedPaths: requiredPaths.map(path => path.replaceAll("a", "A")) }), /Invalid QA/);
});

test("all four baseline paths are mandatory with only one watched-account trades path", () => {
  for (const path of requiredPaths) assert.throws(() => validatePublicManifest({ ...manifest(),
    allowedPaths: manifest().allowedPaths.filter(value => value !== path) }), /Invalid QA/);
  assert.throws(() => validatePublicManifest({ ...manifest(), allowedPaths: [...requiredPaths, `/users/0x${"c".repeat(40)}/trades`] }), /Invalid QA/);
});

test("path allowlist rejects duplicates, full URLs, query, fragment, wildcard, escaping and noncanonical IDs", () => {
  for (const path of ["/streams", "https://example.invalid/streams", "//streams", "streams", "/streams?limit=1",
    "/streams?", "/streams#", "/streams/*", "/streams/0", "/streams/01", "/streams/-1", "/streams/+1",
    "/streams/1.0", "/streams/1e1", "/streams/1/", "/streams/1\n", "/streams/1/claims", "/streams/%31", "/streams/1/../2",
    "/streams/" + "9".repeat(79), "/streams/" + (1n << 256n), "/health/", "/Health", "/metrics\n", "/rpc", null, 1]) {
    assert.throws(() => validatePublicManifest({ ...manifest(), allowedPaths: [...requiredPaths, path] }), /Invalid QA/, String(path));
  }
  for (const allowedPaths of [null, {}, "streams"]) assert.throws(() => validatePublicManifest({ ...manifest(), allowedPaths }), /Invalid QA/);
  const largest = `/streams/${(1n << 256n) - 1n}`;
  assert.ok(validatePublicManifest({ ...manifest(), allowedPaths: [...requiredPaths, largest] }).allowedPaths.includes(largest));
});

test("34 distinct stream details plus four baseline paths fit the build budget; 35 fail", () => {
  const details = Array.from({ length: 34 }, (_, index) => `/streams/${index + 1}`);
  assert.equal(validatePublicManifest({ ...manifest(), allowedPaths: [...requiredPaths, ...details] }).allowedPaths.length, 38);
  assert.throws(() => validatePublicManifest({ ...manifest(), allowedPaths: [...requiredPaths, ...details, "/streams/35"] }), /Invalid QA/);
});

test("Vite definitions keep API/RPC pinned and encode allowed paths as a JSON string", () => {
  for (const mode of [undefined, "fixture", "actual-api"]) {
    const config = resolveQaRunConfig({ ...env, VESTORA_QA_MODE: mode,
      VITE_VESTORA_API_URL: "https://forbidden.invalid/api", VITE_SEPOLIA_RPC_URL: "https://forbidden.invalid/rpc",
      PORT: "4999", VESTORA_QA_PORT: "4999", VESTORA_QA_PREVIEW_PORT: "4999" }, () => JSON.stringify(manifest()));
    const values = Object.fromEntries(Object.entries(qaEnvironmentDefines(config)).map(([key, value]) => [key, JSON.parse(value)]));
    const gateway = mode === "actual-api" ? "http://127.0.0.1:4394" : "http://127.0.0.1:4393";
    assert.equal(values["import.meta.env.VITE_VESTORA_API_URL"], `${gateway}/api`);
    assert.equal(values["import.meta.env.VITE_SEPOLIA_RPC_URL"], `${gateway}/rpc-blocked`);
    assert.equal(typeof values["import.meta.env.VITE_QA_ALLOWED_PATHS"], "string");
    assert.deepEqual(JSON.parse(values["import.meta.env.VITE_QA_ALLOWED_PATHS"]), mode === "actual-api" ? manifest().allowedPaths : []);
    assert.equal(JSON.stringify(values).includes("synthetic-public"), false);
    assert.equal(JSON.stringify(values).includes("forbidden.invalid"), false);
    assert.equal(JSON.stringify(values).includes("4999"), false);
  }
});

test("real Vite fixture and actual-mode compilations keep fixed isolated transports and read-only adapters", async () => {
  const directory = mkdtempSync(join(tmpdir(), "vestora-qa-public-build-"));
  const filename = join(directory, "synthetic-public-session.json");
  const previous = Object.fromEntries(["VESTORA_QA_MODE", "VESTORA_QA_SESSION_MANIFEST", "VITE_VESTORA_API_URL",
    "VITE_SEPOLIA_RPC_URL", "PORT", "VESTORA_QA_PORT", "VESTORA_QA_PREVIEW_PORT"].map(key => [key, process.env[key]]));
  try {
    writeFileSync(filename, JSON.stringify(manifest()));
    process.env.VITE_VESTORA_API_URL = "https://forbidden.invalid/api";
    process.env.VITE_SEPOLIA_RPC_URL = "https://forbidden.invalid/rpc";
    process.env.PORT = process.env.VESTORA_QA_PORT = process.env.VESTORA_QA_PREVIEW_PORT = "4999";
    delete process.env.VESTORA_QA_MODE;
    delete process.env.VESTORA_QA_SESSION_MANIFEST;
    const fixture = await resolveConfig({ root, configFile, configLoader: "runner", envFile: false, logLevel: "silent" }, "build");
    assert.equal(fixture.build.outDir, "qa-ui-dist");
    assert.equal(fixture.server.port, 4340);
    assert.equal(fixture.preview.port, 4341);
    process.env.VESTORA_QA_MODE = "actual-api";
    process.env.VESTORA_QA_SESSION_MANIFEST = filename;
    const actual = await resolveConfig({ root, configFile, configLoader: "runner", envFile: false, logLevel: "silent" }, "build");
    assert.equal(actual.build.outDir, "qa-ui-actual-dist");
    assert.notEqual(actual.build.outDir, fixture.build.outDir);
    assert.equal(actual.server.port, 4343);
    assert.equal(actual.preview.port, 4342);
    for (const [config, port] of [[fixture, 4393], [actual, 4394]]) {
      for (const transport of [config.server, config.preview]) {
        assert.equal(transport.host, "127.0.0.1");
        assert.equal(transport.strictPort, true);
      }
      assert.equal(JSON.parse(config.define["import.meta.env.VITE_VESTORA_API_URL"]), `http://127.0.0.1:${port}/api`);
      assert.equal(JSON.parse(config.define["import.meta.env.VITE_SEPOLIA_RPC_URL"]), `http://127.0.0.1:${port}/rpc-blocked`);
    }
    writeFileSync(filename, JSON.stringify({ ...manifest(), allowedPaths: [...requiredPaths,
      ...Array.from({ length: 35 }, (_, index) => `/streams/${index + 1}`)] }));
    await assert.rejects(resolveConfig({ root, configFile, configLoader: "runner", envFile: false, logLevel: "silent" }, "build"),
      /Invalid QA public session manifest/);
    writeFileSync(filename, JSON.stringify(manifest()));
    // Compile actual then fixture in memory to catch cross-mode configuration leakage.
    for (const [mode, port, otherPort] of [["actual-api", 4394, 4393], ["fixture", 4393, 4394]]) {
      process.env.VESTORA_QA_MODE = mode;
      const result = await build({ root, configFile, configLoader: "runner", envFile: false, logLevel: "silent", build: { write: false } });
      const chunks = result.output.filter(output => output.type === "chunk");
      const modules = chunks.flatMap(chunk => chunk.moduleIds).map(id => id.replaceAll("\\", "/"));
      for (const file of ["runtime.ts", "read-only-wallet.ts", "no-rpc.ts"]) {
        assert.ok(modules.some(id => id.endsWith(`/tests/performance-ui/${file}`)), `${mode}: ${file}`);
      }
      for (const file of ["/src/main.tsx", "/src/lib/ui-measurement.ts", "/src/lib/live-chain.ts", "/src/hooks/use-injected-wallet.ts"]) {
        assert.equal(modules.some(id => id.endsWith(file)), false, `${mode}: ${file}`);
      }
      assert.ok(modules.some(id => id.endsWith("/src/App.tsx")));
      const javascript = chunks.map(chunk => chunk.code).join("\n");
      assert.ok(javascript.includes(mode === "actual-api" ? "ACTUAL API VIA BOUNDED GATEWAY" : "LOCAL FIXTURE"));
      assert.equal(javascript.includes(planDigest), mode === "actual-api");
      assert.ok(javascript.includes(`http://127.0.0.1:${port}/api`), mode);
      assert.equal(javascript.includes(`http://127.0.0.1:${otherPort}/api`), false, mode);
      for (const forbidden of ["synthetic-public-session.json", "VESTORA_QA_SESSION_MANIFEST", "gateway.mjs", "forbidden.invalid", "4999"]) {
        assert.equal(javascript.includes(forbidden), false, `${mode}: ${forbidden}`);
      }
    }
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    // The target is the exact mkdtemp-created test directory, never a user path.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
