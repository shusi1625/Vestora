import assert from "node:assert/strict";
import {test,after} from "node:test";
import fs from "node:fs";
import {resolve,dirname,basename} from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import vm from "node:vm";
import http from "node:http";

function resolveSourceRoot(directory,override){
  if(override)return resolve(override);
  const relativeRoot=resolve(directory,"../..");
  return fs.existsSync(resolve(relativeRoot,"package.json"))&&fs.existsSync(resolve(relativeRoot,"tsconfig.app.json"))?relativeRoot:resolve("C:/GitHub/Vestora/frontend");
}
const fixtureDir=import.meta.dirname,sourceRoot=resolveSourceRoot(fixtureDir,process.env.VESTORA_FRONTEND_SOURCE);
const require=createRequire(resolve(sourceRoot,"package.json")),viem=require("viem"),ts=require("typescript");
const bundles=resolve(fixtureDir,"../../../..");
const A="0x1111111111111111111111111111111111111111",B="0x2222222222222222222222222222222222222222",C="0x3333333333333333333333333333333333333333";
const STREAM="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",USDC="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9",MARKET="0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7";
const addr=value=>value.toLowerCase();
const tokenAbi=viem.parseAbi(["function balanceOf(address account) view returns(uint256)","function allowance(address owner,address spender) view returns(uint256)","function approve(address spender,uint256 amount) returns(bool)","function mint(address to,uint256 amount)","event Transfer(address indexed from,address indexed to,uint256 value)"]);
const nftAbi=viem.parseAbi(["function ownerOf(uint256 id) view returns(address)","function approve(address approved,uint256 id)","function claim(uint256 id) returns(uint256)","function cancel(uint256 id) returns(uint256)"]);
const marketAbi=viem.parseAbi(["function list(uint256 id,uint256 price)","function cancelListing(uint256 id)","function buyWithProtection(uint256 id,uint256 maxPrice,uint256 minRemainingReceivable,uint256 maxWithdrawnAmount,address expectedSeller)"]);

if(process.argv.includes("--typecheck")){
  const config=ts.readConfigFile(resolve(sourceRoot,"tests/performance-ui/tsconfig.json"),ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,resolve(sourceRoot,"tests/performance-ui"),{noEmit:true,incremental:false});
  const host=ts.createCompilerHost(parsed.options),getSourceFile=host.getSourceFile.bind(host);
  host.getSourceFile=(file,language,onError,newFile)=>{
    const normalized=file.replaceAll("\\","/"),name=basename(file),owned=normalized.includes("/tests/manual-qa/")&&["main.tsx","wallet.ts"].includes(name);
    return owned?ts.createSourceFile(file,fs.readFileSync(resolve(fixtureDir,name),"utf8"),language,true):getSourceFile(file,language,onError,newFile);
  };
  const files=[...parsed.fileNames,...["main.tsx","wallet.ts"].map(file=>resolve(sourceRoot,"tests/manual-qa",file))];
  const program=ts.createProgram(files,parsed.options,host),diagnostics=[...parsed.errors,...ts.getPreEmitDiagnostics(program)];
  const owned=diagnostics.filter(d=>d.file&&/[/\\]tests[/\\]manual-qa[/\\](main\.tsx|wallet\.ts)$/.test(d.file.fileName));
  console.log(JSON.stringify({stagedFixtureDiagnostics:owned.length,otherSourceDiagnostics:diagnostics.length-owned.length}));
  if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>sourceRoot,getNewLine:()=>"\n"}));process.exitCode=1;}
  else console.log("Existing QA TypeScript + staged manual QA main/wallet: passed, no emit");
}else{
  // Import rewritten source in memory; dependency files remain in the original read-only checkout.
  const viemEntry=resolve(dirname(require.resolve("viem")),"../_esm/index.js");
  const serverSource=fs.readFileSync(resolve(fixtureDir,"server.mjs"),"utf8")
    .replace('from "viem"','from "'+pathToFileURL(viemEntry).href+'"')
    .replace('from "./scaled-data.mjs"','from "'+pathToFileURL(resolve(sourceRoot,"tests/manual-qa/scaled-data.mjs")).href+'"');
  const {server}=await import("data:text/javascript;base64,"+Buffer.from(serverSource).toString("base64"));
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
  const base="http://127.0.0.1:"+server.address().port,nativeFetch=globalThis.fetch;
  let requests=0,outsideAttempts=0,rpcId=0;const corePaths=new Set();
  const localFetch=(input,options={})=>{
    const url=new URL(typeof input==="string"?input:input.url);
    if(url.origin!==base){outsideAttempts++;throw Error("Smoke forbids non-isolated target "+url.origin);}
    if(++requests>550)throw Error("Bounded fixture smoke request cap");
    return nativeFetch(input,{...options,redirect:"error",signal:options.signal||AbortSignal.timeout(5000)});
  };
  globalThis.fetch=localFetch;
  after(async()=>{globalThis.fetch=nativeFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.equal(outsideAttempts,0);console.log(JSON.stringify({isolatedPort:new URL(base).port,requests,cap:550,outsideAttempts,sourceRoot,corePaths:[...corePaths]}));});
  async function json(path,body){
    const response=await localFetch(base+path,body===undefined?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;
  }
  const control=(path,body={})=>json("/qa/"+path,body);
  const reset=mode=>control("case",{mode});
  async function rpc(method,params=[]){const r=await json("/rpc",{jsonrpc:"2.0",id:++rpcId,method,params});assert.equal(r.error,undefined,JSON.stringify(r.error));return r.result;}
  const data=(abi,functionName,args)=>viem.encodeFunctionData({abi,functionName,args});
  const submit=(from,to,abi,name,args)=>json("/qa/send",{from,to,data:data(abi,name,args),value:"0x0"});
  async function balance(account,block="latest"){return BigInt(await rpc("eth_call",[{to:USDC,data:data(tokenAbi,"balanceOf",[account])},block]));}
  function modules(account=A){
    const cache=new Map(),storage=new Map(),locks=[],provider={request:async({method,params})=>{
      if(method==="eth_accounts")return[account];if(method==="eth_chainId")return"0xaa36a7";
      if(method==="eth_sendTransaction")return(await json("/qa/send",params[0])).hash;
      throw Error("No real wallet: "+method);
    }};
    const token={account:addr(account),chainId:"0xaa36a7",revision:1,provider},session={capture:()=>token,assertCurrent:async t=>assert.equal(t,token)};
    function load(file){
      let path=file.startsWith("@/")?resolve(sourceRoot,"src",file.slice(2)):resolve(file);
      if(!path.endsWith(".ts"))path+=".ts";
      const name=basename(path);
      for(const [prefix,bundle]of [["market-action-","market"],["cancel-payment-","cancel"],["mint-token-","mint"]])if(name.startsWith(prefix)){
        const integrated=resolve(sourceRoot,"src/lib",name);
        path=fs.existsSync(integrated)?integrated:resolve(bundles,bundle,"frontend/src/lib",name);corePaths.add(path);
      }
      if(!fs.existsSync(path))path=resolve(sourceRoot,"src/lib",name);
      if(cache.has(path))return cache.get(path).exports;
      const module={exports:{}};cache.set(path,module);
      const code=ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
      const get=id=>id==="viem"?viem:id==="viem/chains"?require(id):id==="./live-config"?{LIVE_STREAM:STREAM,LIVE_USDC:USDC,LIVE_MARKET:MARKET,LIVE_RPC_URL:base+"/rpc",LIVE_API_BASE:base,LIVE_SYNC_ID:"sepolia-v4"}:id==="@/lib/ui-measurement"?{uiMeasurement:undefined}:id.startsWith(".")||id.startsWith("@/")?load(id.startsWith(".")?resolve(dirname(path),id):id):require(id);
      const moduleFetch=name==="wallet.ts"?(input,options)=>{assert.equal(input,"http://127.0.0.1:4391/qa/send");return localFetch(base+"/qa/send",options);}:localFetch;
      vm.runInNewContext("(function(require,module,exports){"+code+"\n})",{console,Error,Date,BigInt,AbortSignal,crypto:globalThis.crypto,fetch:moduleFetch,URL,setTimeout,clearTimeout,
        localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
        navigator:{locks:{request:async(key,_options,fn)=>{locks.push(key);return fn({});}}}})(get,module,module.exports);
      return module.exports;
    }
    return{load,session,storage,locks,lib:name=>load(resolve(sourceRoot,"src/lib",name))};
  }

  test("source discovery honors environment, integrated relative layout and original fallback",()=>{
    assert.equal(resolveSourceRoot(fixtureDir,sourceRoot),sourceRoot);
    assert.equal(resolveSourceRoot(resolve(sourceRoot,"tests/manual-qa")),sourceRoot);
    assert.equal(resolveSourceRoot(fixtureDir,"./explicit-source-override"),resolve("./explicit-source-override"));
  });

  test("parity market exact ERC20 approve then protected buy verifies real adapter receipts and applied trades",{timeout:15000},async()=>{
    await reset("parity-market");const m=modules(A),chain=m.lib("market-action-chain"),engine=m.lib("market-action-engine").createMarketActionEngine(chain.browserMarketActionPorts(m.session,async()=>{}));
    const draft={action:"buy",id:"3",price:800000n};
    await engine.review(draft);assert.equal(engine.getSnapshot()[addr(A)].quote.step,"erc20-approval");
    await engine.execute(A);assert.equal(engine.getSnapshot()[addr(A)].phase,"approved");
    await engine.review(draft);assert.equal(engine.getSnapshot()[addr(A)].quote.step,"buy");
    await engine.execute(A);assert.equal(engine.getSnapshot()[addr(A)].phase,"indexing");
    const status=await json("/qa/status");assert.equal(status.sendCount,2);assert.equal(status.projected,false);
    const receipt=await rpc("eth_getTransactionReceipt",[status.lastHash]);assert.equal(receipt.logs.at(-1).logIndex,"0x2");
    assert.equal((await json("/streams/3")).data.currentOwner,addr(B));
    assert.equal(await balance(A),9200000n);assert.equal(await balance(B),2900000n);
    await control("applied");await engine.resume(A);assert.equal(engine.getSnapshot()[addr(A)].phase,"completed");
    assert.equal(addr((await json("/streams/3")).data.currentOwner),addr(A));
    assert.equal((await json("/users/"+A+"/trades")).data[0].logIndex,2);
    assert.ok(m.locks.every(key=>key==="vestora:claim:"+addr(STREAM)+":"+addr(A)));
  });

  test("NFT-specific approval and list/cancelListing keep ownership and exact historical listing projection",{timeout:15000},async()=>{
    await reset("parity-market");const m=modules(B),chain=m.lib("market-action-chain"),engine=m.lib("market-action-engine").createMarketActionEngine(chain.browserMarketActionPorts(m.session,async()=>{}));
    const draft={action:"list",id:"4",price:1200000n};
    await engine.review(draft);assert.equal(engine.getSnapshot()[addr(B)].quote.step,"nft-approval");
    await engine.execute(B);assert.equal(engine.getSnapshot()[addr(B)].phase,"approved");
    await engine.review(draft);await engine.execute(B);assert.equal(engine.getSnapshot()[addr(B)].phase,"indexing");
    await control("applied");await engine.resume(B);assert.equal(engine.getSnapshot()[addr(B)].phase,"completed");
    assert.equal((await json("/streams/4")).data.listing.status,"ACTIVE");
    await engine.review({action:"cancel-listing",id:"4"});await engine.execute(B);
    await control("applied");await engine.resume(B);assert.equal(engine.getSnapshot()[addr(B)].phase,"completed");
    const row=(await json("/streams/4")).data;assert.equal(row.listing.status,"CANCELED");assert.equal(addr(row.currentOwner),addr(B));
    assert.equal((await json("/qa/status")).sendCount,3);
  });

  test("listed payment cancellation conserves sender refund and current owner's vested claim",{timeout:15000},async()=>{
    await reset("parity-cancel");const m=modules(A),chain=m.lib("cancel-payment-chain"),engine=m.lib("cancel-payment-engine").createCancelPaymentEngine(chain.browserCancelPaymentPorts(m.session,async()=>{}));
    const beforeA=await balance(A),beforeB=await balance(B),beforeEscrow=await balance(STREAM);
    await engine.review("3");assert.equal(engine.getSnapshot()[addr(A)].phase,"review");assert.equal(addr(engine.getSnapshot()[addr(A)].quote.listingSeller),addr(B));
    await engine.execute(A);const state=engine.getSnapshot()[addr(A)];assert.equal(state.phase,"indexing");
    assert.equal(state.evidence.vested+state.evidence.refund,1000000n);
    assert.equal(await balance(A),beforeA+state.evidence.refund);assert.equal(await balance(B),beforeB);
    assert.equal(await balance(STREAM),beforeEscrow-state.evidence.refund);
    await control("applied");await engine.resume(A);assert.equal(engine.getSnapshot()[addr(A)].phase,"completed");
    const row=(await json("/streams/3")).data;assert.equal(row.listing.status,"ACTIVE");assert.equal(addr(row.currentOwner),addr(B));
    assert.equal(BigInt(row.computed.remainingReceivable),state.evidence.vested);
    await submit(B,STREAM,nftAbi,"claim",[3n]);assert.equal(await balance(B),beforeB+state.evidence.vested);
    const after=await json("/qa/status");assert.equal(BigInt(after.escrow),beforeEscrow-1000000n);
    await control("applied");assert.equal((await json("/streams/3")).data.computed.claimableEstimate,"0");
  });

  test("mint receipt-block balance remains distinct from delayed API projection and later mints",{timeout:15000},async()=>{
    await reset("parity-mint");const m=modules(A),chain=m.lib("mint-token-chain"),engine=m.lib("mint-token-engine").createMintTokenEngine(chain.browserMintTokenPorts(m.session,async()=>{}));
    const initial=await balance(A);await engine.review(1250000n);await engine.execute(A);
    const state=engine.getSnapshot()[addr(A)];assert.equal(state.phase,"completed");
    assert.equal(state.balance.balance,initial+1250000n);assert.equal(state.balance.source,"erc20-receipt-block");
    const status=await json("/qa/status");assert.equal(status.projectedBlock,100);
    assert.equal(await balance(A,viem.toHex(status.projectedBlock)),initial);
    await submit(A,USDC,tokenAbi,"mint",[A,500000n]);
    assert.equal(await balance(A),initial+1750000n);
    const frozen=await chain.browserMintTokenPorts(m.session,async()=>{}).balanceAt(state.pending,state.evidence);
    assert.equal(frozen.balance,initial+1250000n);
    await control("applied");const updated=await json("/qa/status");assert.equal(updated.projectedBlock,updated.head);
  });

  test("pending mining, exact transaction headers and explicit mining are bounded and never auto-project",{timeout:10000},async()=>{
    await reset("parity-mint");await control("mining",{paused:true});
    const {hash}=await submit(A,USDC,tokenAbi,"mint",[A,100n]);
    assert.equal(await rpc("eth_getTransactionReceipt",[hash]),null);assert.equal((await rpc("eth_getTransactionByHash",[hash])).blockNumber,null);
    assert.equal(await rpc("eth_getTransactionCount",[A,"latest"]),"0x0");assert.equal(await rpc("eth_getTransactionCount",[A,"pending"]),"0x1");
    assert.equal(await balance(A),10000000n);await control("mine");
    const receipt=await rpc("eth_getTransactionReceipt",[hash]),tx=await rpc("eth_getTransactionByHash",[hash]);
    assert.equal(receipt.transactionHash,hash);assert.equal(receipt.blockNumber,tx.blockNumber);assert.equal(receipt.blockHash,tx.blockHash);
    assert.equal(receipt.logs[0].transactionHash,hash);assert.equal(receipt.logs[0].blockHash,receipt.blockHash);assert.equal(receipt.logs[0].blockNumber,receipt.blockNumber);
    assert.equal(tx.nonce,"0x0");assert.equal((await json("/qa/status")).projected,false);
    assert.equal(await balance(A,receipt.blockNumber),10000100n);
  });

  test("invalid target, sender, native value and protected limits do not fabricate successful transactions",{timeout:10000},async()=>{
    await reset("parity-market");
    const valid={from:A,to:USDC,data:data(tokenAbi,"approve",[MARKET,800000n])};
    for(const input of [{...valid,to:C},{...valid,from:MARKET},{...valid,value:"0x1"},{from:A,to:MARKET,data:data(marketAbi,"buyWithProtection",[3n,799999n,1000000n,0n,B])}]){
      const response=await localFetch(base+"/qa/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});assert.equal(response.status,500);
    }
    assert.equal((await json("/qa/status")).sendCount,0);assert.equal(await balance(A),10000000n);
    const simulation=await json("/rpc",{jsonrpc:"2.0",id:99,method:"eth_call",params:[{from:A,to:MARKET,data:data(marketAbi,"buyWithProtection",[3n,800000n,1000000n,0n,B])},"latest"]});
    assert.ok(simulation.error);assert.equal((await json("/qa/status")).sendCount,0);
    const oversized=await localFetch(base+"/qa/case",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"x".repeat(32769)})});assert.equal(oversized.status,500);
  });

  test("legacy E/B/scale read and receipt cases retain their original routes and budgets",{timeout:15000},async()=>{
    for(const mode of ["normal","B22-one","B25-one","B25-two","B25-empty","B25-zero-assets","B26-tied","B31-cancelled","P01-10","P01-100","P01-1000","P02-harness","E07-pending","E07-null","E03-503","E06-trades"]){
      await reset(mode);const response=await localFetch(base+"/streams");assert.equal(response.status,mode==="E03-503"?503:200);
      if(mode.startsWith("P01-"))assert.equal((await response.json()).data.length,Number(mode.slice(4)));
      if(mode==="B31-cancelled"){const row=(await response.json()).data[0];assert.equal(row.computed.claimableEstimate,"350000");}
    }
    for(const mode of ["E18-reprice","E19-replaced","E20-revert","E21-wrapper","E22-duplicate","E23-api"]){
      await reset(mode);const {hash}=await submit(B,STREAM,nftAbi,"claim",[3n]),receipt=await rpc("eth_getTransactionReceipt",[hash]);
      if(["E18-reprice","E19-replaced"].includes(mode))assert.equal(receipt,null);
      else if(mode==="E20-revert")assert.equal(receipt.status,"0x0");
      else if(mode==="E22-duplicate")assert.equal(receipt.logs.length,2);
      else assert.equal(receipt.status,"0x1");
    }
    const source=fs.readFileSync(resolve(fixtureDir,"server.mjs"),"utf8");assert.match(source,/state\.rpcRequests>1500/);assert.match(source,/fixtureApiCap\(state\.mode\)/);
    const badOrigin=await localFetch(base+"/qa/status",{headers:{Origin:"https://example.invalid"}});assert.equal(badOrigin.status,403);
    if(++requests>550)throw Error("Bounded fixture smoke request cap");
    const badHost=await new Promise((resolve,reject)=>{
      const req=http.get({hostname:"127.0.0.1",port:new URL(base).port,path:"/qa/status",headers:{Host:"example.invalid"},timeout:5000},res=>{res.resume();resolve(res.statusCode);});
      req.on("error",reject);req.on("timeout",()=>req.destroy(Error("Host smoke deadline")));
    });assert.equal(badHost,403);
  });

  test("mock wallet account selection and deliberate hash loss stay on disposable loopback transport",{timeout:10000},async()=>{
    await reset("parity-mint");const m=modules(),{qaWallet}=m.load(resolve(fixtureDir,"wallet.ts"));qaWallet.configure("parity-mint");
    assert.deepEqual([...await qaWallet.request({method:"eth_accounts"})],[A]);
    qaWallet.loseNextResponse();
    await assert.rejects(()=>qaWallet.request({method:"eth_sendTransaction",params:[{from:A,to:USDC,data:data(tokenAbi,"mint",[A,100n])}]}),/lost after submission/);
    const status=await json("/qa/status");assert.equal(status.sendCount,1);assert.match(status.lastHash,/^0x[\da-f]{64}$/i);
    await assert.rejects(()=>qaWallet.request({method:"eth_sendTransaction",params:[{from:B,to:USDC,data:data(tokenAbi,"mint",[B,100n])}]}),error=>error.code===4100);
    qaWallet.select(B);assert.deepEqual([...await qaWallet.request({method:"eth_accounts"})],[B]);
    const hash=await qaWallet.request({method:"eth_sendTransaction",params:[{from:B,to:USDC,data:data(tokenAbi,"mint",[B,100n])}]});
    assert.equal((await rpc("eth_getTransactionByHash",[hash])).nonce,"0x0");
    assert.equal((await json("/qa/status")).sendCount,2);
    const main=fs.readFileSync(resolve(fixtureDir,"main.tsx"),"utf8");
    assert.ok(main.indexOf("Manual QA refuses non-fixture origin")<main.indexOf("const nativeStorage="));
    const unknown=await localFetch(base+"/streams/99999");assert.equal(unknown.status,404);
  });
}
