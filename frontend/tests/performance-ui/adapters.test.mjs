import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { TextEncoder } from "node:util";
import vm from "node:vm";
import { build } from "esbuild";
import ts from "typescript";

const root = resolve(import.meta.dirname, "../..");
const watchedAddress = "0x1111111111111111111111111111111111111111";
const bundled = await build({
  stdin: {
    contents: `
      export { useInjectedWallet } from "./tests/performance-ui/read-only-wallet";
      export { readBalances } from "./tests/performance-ui/no-rpc";
      export { cleanup } from "react";
    `,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  metafile: true,
  platform: "browser",
  format: "cjs",
  plugins: [{
    name: "isolated-react-hooks",
    setup(build) {
      build.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "qa" }));
      build.onLoad({ filter: /.*/, namespace: "qa" }, () => ({
        contents: `
          const cleanups = [];
          export const useState = initial => [typeof initial === "function" ? initial() : initial];
          export const useSyncExternalStore = (subscribe, getSnapshot) => {
            cleanups.push(subscribe(() => {}));
            return getSnapshot();
          };
          export const useEffect = effect => { cleanups.push(effect()); };
          export const cleanup = () => {
            for (const dispose of cleanups.splice(0).reverse()) dispose?.();
          };
        `,
        loader: "js",
      }));
    },
  }],
});

function isolatedAdapters() {
  const attempts = [];
  const deny = name => () => {
    attempts.push(name);
    throw new Error(`Unexpected QA side effect: ${name}`);
  };
  const window = {};
  const sandbox = { module: { exports: {} }, window, TextEncoder };
  for (const target of [sandbox, window]) {
    for (const name of ["ethereum", "localStorage", "sessionStorage", "indexedDB"]) {
      Object.defineProperty(target, name, { get: deny(name) });
    }
    target.fetch = deny("fetch");
    target.XMLHttpRequest = deny("XMLHttpRequest");
    target.WebSocket = deny("WebSocket");
  }
  vm.runInNewContext(bundled.outputFiles[0].text, sandbox, { timeout: 5000 });
  return { adapters: sandbox.module.exports, attempts };
}

function assertDisconnected(state) {
  assert.equal(state.address, null);
  assert.equal(state.chainId, null);
  assert.equal(state.state, "disconnected");
  assert.equal(state.switching, false);
  assert.equal(state.disconnecting, false);
}

test("adapter types exactly match the production hook and balance reader", () => {
  const configPath = resolve(root, "tsconfig.app.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(config.error, undefined);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  assert.deepEqual(parsed.errors, []);
  const contractPath = resolve(import.meta.dirname, "adapter-type-contract.ts");
  const source = `
    import { useInjectedWallet } from "./read-only-wallet";
    import { useInjectedWallet as liveWallet } from "../../src/hooks/use-injected-wallet";
    import { readBalances } from "./no-rpc";
    import { readBalances as liveBalances } from "../../src/lib/live-chain";
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
      (<T>() => T extends B ? 1 : 2) ? true : false;
    type Assert<T extends true> = T;
    type WalletContract = Assert<Equal<typeof useInjectedWallet, typeof liveWallet>>;
    type BalanceContract = Assert<Equal<typeof readBalances, typeof liveBalances>>;
  `;
  const options = { ...parsed.options, types: [...(parsed.options.types ?? []), "vite/client"], noEmit: true };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = path => resolve(path) === contractPath ? source : readFile(path);
  host.fileExists = path => resolve(path) === contractPath || fileExists(path);
  const program = ts.createProgram([contractPath], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: path => path,
    getNewLine: () => "\n",
  }));
});

test("bundle excludes the live hook, RPC client and live configuration", () => {
  const inputs = Object.keys(bundled.metafile.inputs).map(path => path.replaceAll("\\", "/"));
  for (const forbidden of ["src/hooks/use-injected-wallet.ts", "src/lib/live-chain.ts", "src/lib/live-config.ts"]) {
    assert.equal(inputs.some(path => path.endsWith(forbidden)), false, forbidden);
  }
});

test("mount and cleanup never read injected providers or storage", () => {
  const { adapters, attempts } = isolatedAdapters();
  const wallet = adapters.useInjectedWallet();
  assertDisconnected(wallet);
  assertDisconnected(wallet.session.getSnapshot());
  assert.equal(wallet.error, "");
  assert.throws(() => wallet.session.capture(), /claim.walletRequired/);
  adapters.cleanup();
  assertDisconnected(wallet.session.getSnapshot());
  assert.deepEqual(attempts, []);
});

test("connect, switch, disconnect and revocation keep the actual wallet null", async () => {
  const { adapters, attempts } = isolatedAdapters();
  const wallet = adapters.useInjectedWallet();
  try {
    for (const control of [wallet, wallet.session]) {
      await control.connect();
      assert.equal(wallet.session.getSnapshot().error, "live.noWallet");
      assertDisconnected(wallet.session.getSnapshot());
      await control.switchChain();
      assert.equal(wallet.session.getSnapshot().error, "live.noWallet");
      control.disconnect();
      assertDisconnected(wallet.session.getSnapshot());
    }
    await assert.rejects(wallet.session.revokeConnection(watchedAddress), /live.disconnectAccountChanged/);
    await Promise.all([wallet.connect(), wallet.switchChain(), wallet.session.connect()]);
    assert.throws(() => wallet.session.capture(), /claim.walletRequired/);
    assertDisconnected(wallet.session.getSnapshot());
    wallet.session.stop();
    wallet.session.start();
    assertDisconnected(wallet.session.getSnapshot());
  } finally {
    adapters.cleanup();
  }
  assert.deepEqual(attempts, []);
});

test("forged watched-account tokens cannot reach a provider or authorize sends", async () => {
  const { adapters, attempts } = isolatedAdapters();
  const wallet = adapters.useInjectedWallet();
  const providerCalls = [];
  const token = {
    account: watchedAddress,
    chainId: "0xaa36a7",
    revision: wallet.revision,
    provider: { request: async args => { providerCalls.push(args); throw new Error("Denied test provider"); } },
  };
  let sends = 0;
  try {
    await assert.rejects(async () => {
      const captured = wallet.session.capture();
      await captured.provider.request({ method: "eth_sendTransaction", params: [] });
      sends++;
    }, /claim.walletRequired/);
    await assert.rejects(async () => {
      await wallet.session.assertCurrent(token);
      await token.provider.request({ method: "eth_sendTransaction", params: [] });
      sends++;
    }, /claim.sessionChanged/);
    await assert.rejects(wallet.session.revokeConnection(watchedAddress), /live.disconnectAccountChanged/);
    assertDisconnected(wallet.session.getSnapshot());
  } finally {
    adapters.cleanup();
  }
  assert.equal(sends, 0);
  assert.deepEqual(providerCalls, []);
  assert.deepEqual(attempts, []);
});

test("balance reads always reject the measurement exclusion without fetching", async () => {
  const { adapters, attempts } = isolatedAdapters();
  for (const blockNumber of [0n, 1n, 999999n]) {
    const promise = adapters.readBalances(watchedAddress, blockNumber);
    assert.equal(typeof promise.then, "function");
    await assert.rejects(promise, error => {
      assert.equal(error.name, "Error");
      assert.equal(error.message, "QA RPC measurement excluded");
      return true;
    });
  }
  assert.deepEqual(attempts, []);
});
