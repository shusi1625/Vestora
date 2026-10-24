import assert from "node:assert/strict";
import {test,after} from "node:test";
import fs from "node:fs";
import {resolve,dirname} from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import vm from "node:vm";

const relativeRoot=resolve(import.meta.dirname,"../..");
const root=process.env.VESTORA_FRONTEND_SOURCE?resolve(process.env.VESTORA_FRONTEND_SOURCE):fs.existsSync(resolve(relativeRoot,"package.json"))?relativeRoot:"C:/GitHub/Vestora/frontend";
const require=createRequire(resolve(root,"package.json")),viem=require("viem"),ts=require("typescript");
const B="0x2222222222222222222222222222222222222222",USDC="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9",STREAM="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a";
const viemEntry=resolve(dirname(require.resolve("viem")),"../_esm/index.js");
const source=fs.readFileSync(resolve(import.meta.dirname,"server.mjs"),"utf8")
  .replace('from "viem"','from "'+pathToFileURL(viemEntry).href+'"')
  .replace('from "./scaled-data.mjs"','from "'+pathToFileURL(resolve(root,"tests/manual-qa/scaled-data.mjs")).href+'"');
const {server}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
await new Promise((done,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",done);});
const base="http://127.0.0.1:"+server.address().port,nativeFetch=globalThis.fetch;
let requests=0,outsideAttempts=0,walletAttempts=0;
const localFetch=(input,options={})=>{
  const url=new URL(typeof input==="string"?input:input.url);
  if(url.origin!==base){outsideAttempts++;throw Error("Balance check forbids non-loopback transport");}
  if(++requests>96)throw Error("Balance check request cap");
  return nativeFetch(input,{...options,redirect:"error",signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)});
};
globalThis.fetch=localFetch;
after(async()=>{
  globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(done=>server.close(done));
  assert.equal(outsideAttempts,0);assert.equal(walletAttempts,0);
  console.log(JSON.stringify({isolatedPort:new URL(base).port,requests,cap:96,outsideAttempts,walletAttempts,sourceRoot:root}));
});
async function json(path,body){
  const response=await localFetch(base+path,body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal(response.status,200);return response.json();
}
const reset=mode=>json("/qa/case",{mode});
const cache=new Map();
function load(file){
  const full=resolve(root,file.endsWith(".ts")?file:file+".ts");
  if(cache.has(full))return cache.get(full).exports;
  const module={exports:{}};cache.set(full,module);
  const code=ts.transpileModule(fs.readFileSync(full,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const localRequire=id=>id==="./live-config"?{LIVE_RPC_URL:base+"/rpc",LIVE_API_BASE:base,LIVE_STREAM:STREAM,LIVE_USDC:USDC,LIVE_SYNC_ID:"sepolia-v4"}:
    id==="@/lib/ui-measurement"?{uiMeasurement:undefined}:id.startsWith(".")?load(resolve(dirname(full),id)):require(id);
  vm.runInNewContext("(function(require,module,exports){"+code+"\n})",{console,Error,Date,BigInt,AbortSignal,URL,fetch:localFetch,setTimeout,clearTimeout})(localRequire,module,module.exports);
  return module.exports;
}
const {readBalances}=load("src/lib/live-chain.ts"),{readClaimQuote}=load("src/lib/claim-chain.ts");
const token={account:B,chainId:"0xaa36a7",revision:1,provider:{request:()=>{walletAttempts++;throw Error("No wallet access permitted");}}};
const abi=viem.parseAbi(["function decimals() view returns(uint8)","function balanceOf(address account) view returns(uint256)"]);
let rpcId=0;
const rpc=(method,params)=>json("/rpc",{jsonrpc:"2.0",id:++rpcId,method,params});

test("ETH-only fault keeps token reads valid but blocks portfolio and claim preflight; normal reads recover",{timeout:15000},async()=>{
  await reset("E05-eth-balance");
  const tokenRead=await rpc("eth_call",[{to:USDC,data:viem.encodeFunctionData({abi,functionName:"balanceOf",args:[B]})},"0x64"]);
  assert.equal(tokenRead.error,undefined);assert.equal(BigInt(tokenRead.result),2000000n);
  await assert.rejects(()=>readBalances(B,100n),/native balance RPC unavailable/);
  await assert.rejects(()=>readClaimQuote(token,"3"),/native balance RPC unavailable/);
  assert.equal((await json("/qa/status")).sendCount,0);
  await json("/qa/recover",{});
  const balances=await readBalances(B,100n),quote=await readClaimQuote(token,"3");
  assert.equal(balances.balances[0].raw,2000000n);assert.equal(balances.gasRaw,1000000000000000n);
  assert.equal(quote.amount,1000000n);assert.equal(quote.gasEstimate.balance,1000000000000000n);
  assert.equal((await json("/qa/status")).sendCount,0);
});

test("token-balance-only fault preserves metadata and incoming claim review without authorizing any send",{timeout:15000},async()=>{
  await reset("E05-token-balance");
  const decimals=await rpc("eth_call",[{to:USDC,data:viem.encodeFunctionData({abi,functionName:"decimals"})},"0x64"]);
  assert.equal(decimals.error,undefined);assert.equal(BigInt(decimals.result),6n);
  const native=await rpc("eth_getBalance",[B,"0x64"]);assert.equal(native.error,undefined);assert.equal(BigInt(native.result),1000000000000000n);
  await assert.rejects(()=>readBalances(B,100n),/token balance RPC unavailable/);
  const quote=await readClaimQuote(token,"3");assert.equal(quote.amount,1000000n);
  assert.equal((await json("/qa/status")).sendCount,0);
  await json("/qa/recover",{});
  assert.equal((await readBalances(B,100n)).balances[0].raw,2000000n);
  assert.equal((await json("/qa/status")).sendCount,0);
});
