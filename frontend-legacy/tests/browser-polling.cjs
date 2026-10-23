const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { decodeFunctionData, encodeFunctionResult, multicall3Abi } = require('viem');

(async () => {
  const root = path.resolve(__dirname, '..');
  const contracts = await import(pathToFileURL(path.join(root, 'lib/contracts.ts')).href);
  const abis = [contracts.erc20Abi, contracts.receivableStreamAbi, contracts.receivableMarketplaceAbi];
  const addresses = contracts.sepoliaContracts;
  const zero = '0x' + '0'.repeat(40);
  const account = '0x' + '1'.repeat(40);
  const now = 1767225600n;
  let claimReads = 0;
  let failReads = false;
  function call(data) {
    try {
      const multi = decodeFunctionData({ abi: multicall3Abi, data });
      if (multi.functionName === 'aggregate3') return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: multi.args[0].map((item) => {
        try { return { success: true, returnData: call(item.callData) }; }
        catch { return { success: false, returnData: '0x' }; }
      }) });
    } catch {}
    for (const abi of abis) {
      let decoded;
      try { decoded = decodeFunctionData({ abi, data }); } catch { continue; }
      const name = decoded.functionName;
      if (name === 'claimableAmount') claimReads++;
      if (failReads && ['claimableAmount', 'vestedAmount', 'getStream'].includes(name)) throw new Error('simulated read failure');
      const result = {
        name: 'Mock USDC', symbol: 'mUSDC', decimals: 6, balanceOf: 1000000n, nextStreamId: 2n,
        paymentToken: addresses.mockUSDC, receivableNft: addresses.receivableStream, ownerOf: account,
        vestedAmount: 500000n, claimableAmount: 500000n,
        getListing: { seller: zero, price: 0n },
        getStream: { sender: account, token: addresses.mockUSDC, depositedAmount: 1000000n,
          startTime: now - 500n, endTime: now + 500n, withdrawnAmount: 0n, cancelable: false, canceled: false, canceledAt: 0n },
      }[name];
      return encodeFunctionResult({ abi, functionName: name, result });
    }
    throw new Error('Unknown fixture call');
  }
  const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3196'], {
    cwd: root, env: { ...process.env, NEXT_PUBLIC_VESTORA_API_URL: 'http://127.0.0.1:3197' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let log = '';
  server.stdout.on('data', (data) => { log += data; });
  server.stderr.on('data', (data) => { log += data; });
  const exited = once(server, 'exit');
  let browser;
  try {
    const deadline = Date.now() + 60000;
    while (!log.includes('Ready in')) {
      if (server.exitCode !== null || Date.now() > deadline) throw new Error(log);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__testVisible = true;
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__testVisible ? 'visible' : 'hidden' });
    });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname === '127.0.0.1' && url.port === '3196') return route.continue();
      if (url.port === '3197') return route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'Offline fixture' } }) });
      if (request.method() !== 'POST') return route.abort();
      let payload;
      try { payload = request.postDataJSON(); } catch { return route.abort(); }
      const respond = (rpc) => {
        try {
          const result = rpc.method === 'eth_call' ? call(rpc.params[0].data)
            : rpc.method === 'eth_chainId' ? '0xaa36a7'
            : rpc.method === 'eth_blockNumber' ? '0x64'
            : rpc.method === 'eth_getBlockByNumber' ? { number: '0x64', timestamp: '0x' + now.toString(16), hash: '0x' + '1'.repeat(64), transactions: [] }
            : null;
          return { jsonrpc: '2.0', id: rpc.id, result };
        } catch { return { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Fixture read failed' } }; }
      };
      return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(Array.isArray(payload) ? payload.map(respond) : respond(payload)) });
    });
    await page.goto('http://127.0.0.1:3196');
    await page.getByText('3. Stream Details', { exact: true }).waitFor();
    await page.waitForFunction(() => document.body.innerText.includes('Recent'));
    assert.ok(claimReads > 0);
    const initial = claimReads;
    await page.waitForTimeout(16500);
    assert.ok(claimReads > initial, 'visible page must refresh chain reads');
    await page.evaluate(() => { window.__testVisible = false; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(1000);
    const hidden = claimReads;
    await page.waitForTimeout(16500);
    assert.equal(claimReads, hidden, 'hidden page must not poll claimable');
    failReads = true;
    await page.evaluate(() => { window.__testVisible = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByText('Read error; values may be stale', { exact: true }).waitFor({ timeout: 20000 });
    console.log('PASS: browser visible polling, hidden suspension, resumed read error without wallet transactions');
  } finally {
    if (browser) await browser.close();
    if (server.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true });
      else server.kill();
    }
    await exited;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
