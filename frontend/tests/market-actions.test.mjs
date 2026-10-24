import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync,existsSync} from "node:fs";
import {resolve,dirname,join} from "node:path";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import vm from "node:vm";

// Tests resolve dependencies read-only from the source checkout, without installing or copying shared files.
const root=resolve(import.meta.dirname,".."),source=resolve(process.env.VESTORA_SOURCE_FRONTEND||"C:/GitHub/Vestora/frontend");
const require=createRequire(join(source,"package.json")),ts=require("typescript"),viem=require("viem");
const account="0x1111111111111111111111111111111111111111",seller="0x2222222222222222222222222222222222222222",other="0x3333333333333333333333333333333333333333";
const stream="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",usdc="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9",market="0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7";
const zero="0x"+"0".repeat(40),hash="0x"+"a".repeat(64),hash2="0x"+"b".repeat(64),blockHash="0x"+"c".repeat(64);
const buy={action:"buy",id:"3",price:10_000_000n},list={action:"list",id:"3",price:10_000_000n},cancel={action:"cancel-listing",id:"3"};
const token={account,chainId:"0xaa36a7",revision:1,provider:{request:async()=>{throw Error("Real wallet access is forbidden");}}};
function loader(options={}){
  const cache=new Map(),store=options.store||new Map();
  const storage=options.storage||{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
  const api={detailSchema:{},tradeListSchema:{},readApi:options.api||(async()=>{throw Error("External API access is forbidden");})};
  const fakeViem={...viem,createPublicClient:()=>options.rpc||{},createWalletClient:()=>({writeContract:options.write||(async()=>{throw Error("Real sends are forbidden");})})};
  return function load(input){
    let path=resolve(root,input.endsWith(".ts")?input:`${input}.ts`);
    if(!existsSync(path))path=resolve(source,path.slice(root.length+1));
    if(cache.has(path))return cache.get(path);
    const module={exports:{}};cache.set(path,module.exports);
    const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
    const get=id=>id==="viem"?fakeViem:id==="viem/chains"?require(id):id==="./live-config"?{LIVE_STREAM:stream,LIVE_USDC:usdc,LIVE_MARKET:market,LIVE_RPC_URL:"https://offline.invalid"}:id==="./live-api"?api:
      load(id.startsWith("@/")?resolve(root,"src",id.slice(2)):resolve(dirname(path),id));
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,BigInt,Intl,Error,console,crypto:{randomUUID},localStorage:storage,navigator:{locks:options.locks||{request:async(_k,_o,fn)=>fn({})}},fetch:async()=>{throw Error("Network access is forbidden");}})(get,module,module.exports);
    return module.exports;
  };
}
const load=loader(),model=load("src/lib/market-action-model"),storageModel=load("src/lib/market-action-storage"),chain=load("src/lib/market-action-chain");
const {createMarketActionEngine}=load("src/lib/market-action-engine");
function quote(draft=buy,t=token,patch={}){
  return {draft:{...draft},id:draft.id,account:t.account.toLowerCase(),token:t,step:draft.action,owner:draft.action==="buy"?seller:t.account,
    seller:draft.action==="buy"?seller:t.account,price:10_000_000n,remaining:20_000_000n,withdrawn:2_000_000n,claimable:3_000_000n,
    canceled:false,cancelable:true,approved:market,approvedForAll:false,allowance:10_000_000n,block:100n,at:1_000n,...patch};
}
function record(step="buy",patch={}){
  const d=step==="nft-approval"||step==="list"?list:step==="cancel-listing"?cancel:buy;
  return {...model.marketActionRecord(quote(d,token,{step}),123,"request-one"),hash,...patch};
}
function fixture(){
  let stored=null,sends=0,receipts=0,allowance=10_000_000n,nftApproved=true,currentToken=token,now=123;
  const session={capture:()=>currentToken,assertCurrent:async t=>{if(t!==currentToken)throw Error("claim.sessionChanged");}};
  const ports={session,reservationId:()=>randomUUID(),now:()=>now++,
    storage:{read:()=>stored,save:r=>{stored={...r};},clear:()=>{stored=null;}},
    quote:async(t,d)=>quote(d,t,{step:d.action==="buy"&&allowance<d.price?"erc20-approval":d.action==="list"&&!nftApproved?"nft-approval":d.action}),
    send:async()=>{sends++;return hash;},
    receipt:async r=>{receipts++;return {hash:r.hash,block:101n,logIndex:2,id:r.id,step:r.step,price:BigInt(r.price)};},
    verifyRecovery:async()=>{},projected:async()=>true,refresh:async()=>{},lock:async(_a,fn)=>fn()};
  return {ports,engine:createMarketActionEngine(ports),stored:()=>stored,setStored:r=>{stored=r;},sends:()=>sends,receipts:()=>receipts,
    setAllowance:n=>{allowance=n;},setNftApproval:b=>{nftApproved=b;},change:()=>{currentToken={...token,revision:2};},setToken:t=>{currentToken=t;}};
}
const state=f=>f.engine.getSnapshot()[account];

test("market modules typecheck against source dependencies with only the parent's planned LIVE_MARKET export supplied in memory",()=>{
  const config=ts.readConfigFile(join(source,"tsconfig.app.json"),ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,source),options={...parsed.options,noEmit:true,incremental:false};
  const host=ts.createCompilerHost(options),originalRead=host.readFile;
  host.readFile=path=>{const text=originalRead(path);return path.replaceAll("\\","/").endsWith("/src/lib/live-config.ts")&&text&&!text.includes("export const LIVE_MARKET")?`${text}\nexport const LIVE_MARKET = "${market}" as const;\n`:text;};
  host.resolveModuleNames=(names,file)=>names.map(name=>{
    const local=ts.resolveModuleName(name,file,options,host).resolvedModule;if(local)return local;
    const normalized=file.replaceAll("\\","/"),prefix=root.replaceAll("\\","/");
    const mirrored=normalized.toLowerCase().startsWith(prefix.toLowerCase()+"/")?resolve(source,normalized.slice(prefix.length+1)):file;
    return ts.resolveModuleName(name,mirrored,options,host).resolvedModule;
  });
  const files=["model","engine","chain","storage"].map(name=>join(root,`src/lib/market-action-${name}.ts`));
  files.push(join(source,"src/env.d.ts"));
  const program=ts.createProgram(files,options,host),diagnostics=ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:p=>p,getNewLine:()=>"\n"}));
});
test("market TypeScript modules satisfy the source ESLint policy without source writes",async()=>{
  const {ESLint}=require("eslint"),eslint=new ESLint({cwd:source,overrideConfigFile:join(source,"eslint.config.js")});
  const results=[];
  for(const part of ["model","engine","chain","storage"]){const file=`src/lib/market-action-${part}.ts`;results.push(...await eslint.lintText(readFileSync(join(root,file),"utf8"),{filePath:join(source,file)}));}
  const messages=results.flatMap(r=>r.messages.filter(m=>m.severity===2).map(m=>`${r.filePath}:${m.line} ${m.message}`));assert.equal(messages.length,0,messages.join("\n"));
});

test("draft validation preserves BigInt and rejects invalid IDs, prices and actions",()=>{
  for(const d of [buy,list,cancel])model.validateMarketDraft(d);
  for(const d of [{...buy,id:"0"},{...buy,id:"03"},{...buy,id:"-1"},{...buy,id:(2n**256n).toString()},{...buy,price:0n},{...list,price:1},{...buy,price:2n**256n},{action:"mint",id:"3"},null])assert.throws(()=>model.validateMarketDraft(d));
  model.validateMarketDraft({...buy,id:(2n**256n-1n).toString(),price:2n**256n-1n});
});
for(const draft of [buy,list,cancel]){
  test(`${draft.action}: explicit execution settles only one transaction`,async()=>{
    const f=fixture();await f.engine.review(draft);assert.equal(state(f).phase,"review");assert.equal(f.sends(),0);
    await f.engine.execute(account.toUpperCase());assert.equal(f.sends(),1);assert.equal(state(f).phase,"completed");assert.equal(state(f).evidence.id,"3");assert.equal(f.stored(),null);
    await f.engine.execute(account);assert.equal(f.sends(),1);
  });
  test(`${draft.action}: explicit B reuse reaches read-only review without sending`,async()=>{
    const f=fixture(),held="0xbf9bf852225899b667aa4c73bb082e830abb9de1";
    f.setToken({...token,account:held});let quotes=0;f.ports.quote=async()=>{quotes++;throw Error("market.readFailed");};
    await f.engine.review(draft);await f.engine.execute(held);
    assert.equal(f.engine.getSnapshot()[held].error,"market.readFailed");assert.equal(quotes,1);assert.equal(f.sends(),0);
  });
}
for(const [draft,step]of [[buy,"erc20-approval"],[list,"nft-approval"]]){
  test(`${step}: approval never automatically sends the following action`,async()=>{
    const f=fixture();f.setAllowance(0n);f.setNftApproval(false);
    await f.engine.review(draft);assert.equal(state(f).quote.step,step);await f.engine.execute(account);
    assert.equal(state(f).phase,"approved");assert.equal(f.sends(),1);await f.engine.execute(account);assert.equal(f.sends(),1);
    f.setAllowance(buy.price);f.setNftApproval(true);await f.engine.review(draft);assert.equal(state(f).quote.step,draft.action);
    await f.engine.execute(account);assert.equal(f.sends(),2);assert.equal(state(f).phase,"completed");
  });
}
for(const patch of [{price:11_000_000n},{seller:other},{owner:other},{remaining:19_000_000n},{withdrawn:2_000_001n},{canceled:true},{cancelable:false},{step:"erc20-approval"},{id:"4"}]){
  test(`changed quote ${Object.keys(patch)[0]} stops before the wallet`,async()=>{
    const f=fixture();await f.engine.review(buy);f.ports.quote=async()=>quote(buy,token,patch);
    await f.engine.execute(account);assert.equal(state(f).error,"market.conditionsChanged");assert.equal(f.sends(),0);assert.equal(f.stored(),null);
  });
}
test("growing claimable value alone does not invalidate a purchase",async()=>{
  const f=fixture();await f.engine.review(buy);f.ports.quote=async()=>quote(buy,token,{claimable:4_000_000n});await f.engine.execute(account);assert.equal(state(f).phase,"completed");
});
test("account changes invalidate review and preserve account-local state",async()=>{
  const f=fixture();await f.engine.review(buy);f.change();f.engine.invalidate();await f.engine.execute(account);assert.equal(f.sends(),0);assert.equal(state(f).error,"claim.sessionChanged");
});
test("same-account concurrent execute and review cannot duplicate sends",async()=>{
  const f=fixture();let release;const wait=new Promise(r=>{release=r;});f.ports.send=async()=>{await wait;return hash;};
  await f.engine.review(buy);const execution=f.engine.execute(account);await new Promise(r=>setImmediate(r));
  await f.engine.execute(account);await f.engine.review(list);assert.equal(state(f).phase,"wallet");release();await execution;assert.equal(state(f).phase,"completed");assert.equal(f.receipts(),1);
});
for(const stage of ["review","execute","after-requote"]){
  test(`optional cross-action guard blocks at ${stage}`,async()=>{
    const f=fixture();let block=stage==="review",calls=0;
    f.ports.assertNoOtherPending=async()=>{calls++;if(block||stage==="after-requote"&&calls>=3)throw Error("market.otherPending");};
    await f.engine.review(buy);if(stage==="execute")block=true;await f.engine.execute(account);
    assert.equal(state(f).error,"market.otherPending");assert.equal(f.sends(),0);assert.equal(f.stored(),null);
  });
}
for(const key of ["actions.otherPending","actions.storageUnavailable"]){
  test(`parent guard ${key} survives review, execute and pre-wallet failure`,async()=>{
    const f=fixture();f.ports.assertNoOtherPending=async()=>{throw Error(key);};await f.engine.review(buy);assert.equal(state(f).error,key);assert.equal(f.sends(),0);
    f.ports.assertNoOtherPending=async()=>{};await f.engine.review(buy);f.ports.assertNoOtherPending=async()=>{throw Error(key);};await f.engine.execute(account);assert.equal(state(f).error,key);assert.equal(f.sends(),0);
    f.ports.assertNoOtherPending=async()=>{};await f.engine.review(buy);f.ports.send=async()=>{throw new model.MarketActionNotSubmitted(key);};await f.engine.execute(account);assert.equal(state(f).error,key);assert.equal(state(f).phase,"error");assert.equal(f.stored(),null);
  });
}
test("reservation is persisted before wallet and missing storage aborts before send",async()=>{
  const f=fixture();f.ports.storage.save=()=>{throw Error("market.storageUnavailable");};await f.engine.review(buy);await f.engine.execute(account);assert.equal(f.sends(),0);assert.equal(state(f).phase,"error");
  const g=fixture();g.ports.send=async()=>{assert.equal(g.stored().id,"3");assert.equal(g.stored().hash,undefined);return hash;};await g.engine.review(buy);await g.engine.execute(account);assert.equal(state(g).phase,"completed");
});
for(const failure of [new Error("timeout"),new viem.InsufficientFundsError(),null,"bad-hash"]){
  test(`hashless result ${failure instanceof Error?failure.name:String(failure)} preserves reservation and forbids review`,async()=>{
    const f=fixture();f.ports.send=async()=>{if(failure instanceof Error)throw failure;return failure;};await f.engine.review(buy);await f.engine.execute(account);
    assert.equal(state(f).phase,"unknown");assert.ok(f.stored());assert.equal(f.stored().hash,undefined);const reservation=f.stored().reservation;
    await f.engine.review(list);await f.engine.resume(account);assert.equal(f.stored().reservation,reservation);assert.equal(state(f).phase,"unknown");assert.equal(f.receipts(),0);
  });
}
test("explicit rejection and proven pre-wallet failure clear only the owned reservation",async()=>{
  for(const failure of [Object.assign(new Error("Rejected"),{code:4001}),new model.MarketActionNotSubmitted("claim.sessionChanged")]){
    const f=fixture();f.ports.send=async()=>{throw failure;};await f.engine.review(buy);await f.engine.execute(account);assert.equal(f.stored(),null);assert.equal(state(f).phase,failure.code===4001?"rejected":"error");
  }
});
for(const phase of ["reverted","replaced"]){
  test(`verified ${phase} is terminal`,async()=>{const f=fixture();f.ports.receipt=async()=>phase;await f.engine.review(buy);await f.engine.execute(account);assert.equal(state(f).phase,phase);assert.equal(f.stored(),null);});
}
test("receipt timeout remains pending and replacement hash is persisted",async()=>{
  const f=fixture();f.ports.receipt=async(_r,replace)=>{replace(hash2);throw Error("timeout");};await f.engine.review(buy);await f.engine.execute(account);
  assert.equal(state(f).phase,"unknown");assert.equal(f.stored().hash,hash2);
  f.ports.receipt=async r=>({hash:r.hash,id:r.id,step:r.step,price:BigInt(r.price),block:101n,logIndex:2});await f.engine.resume(account);assert.equal(state(f).phase,"completed");
});
test("receipt with inconsistent proof cannot clear pending",async()=>{
  const f=fixture();f.ports.receipt=async()=>({hash:hash2,id:"4",step:"list",price:1n,block:101n,logIndex:2});await f.engine.review(buy);await f.engine.execute(account);assert.equal(state(f).phase,"unknown");assert.ok(f.stored());
});
test("indexer lag and API failure retain successful chain evidence across resume and review",async()=>{
  const f=fixture();f.ports.projected=async()=>false;await f.engine.review(buy);await f.engine.execute(account);assert.equal(state(f).phase,"indexing");const e=state(f).evidence;
  f.ports.projected=async()=>{throw Error("API down");};await f.engine.resume(account);await f.engine.review(list);
  assert.equal(state(f).phase,"indexing");assert.equal(state(f).evidence.hash,e.hash);assert.equal(f.receipts(),1);
  f.setStored(null);await f.engine.review(cancel);assert.equal(state(f).phase,"indexing");
  f.ports.projected=async()=>true;f.ports.refresh=async()=>{throw Error("Refresh failed");};await f.engine.resume(account);assert.equal(state(f).phase,"completed");assert.equal(state(f).warning,"market.refreshWarning");
});
test("storage cleanup failure retains terminal evidence and supports cleanup by resume",async()=>{
  const f=fixture(),clear=f.ports.storage.clear;f.ports.storage.clear=()=>{throw Error("blocked");};await f.engine.review(buy);await f.engine.execute(account);
  assert.equal(state(f).phase,"completed");assert.ok(state(f).pending);assert.equal(state(f).warning,"market.storageWarning");f.ports.storage.clear=clear;await f.engine.resume(account);assert.equal(f.stored(),null);assert.equal(state(f).phase,"completed");
});
test("bad recovery retains pending; good recovery reads without sending",async()=>{
  const f=fixture();f.setStored(record("buy",{hash:undefined}));f.engine.restore(account);f.ports.verifyRecovery=async()=>{throw Error("market.recoveryMismatch");};await f.engine.recover(account,hash2);
  assert.equal(state(f).phase,"unknown");assert.equal(f.stored().hash,undefined);
  f.ports.verifyRecovery=async()=>{};await f.engine.recover(account,hash);assert.equal(state(f).phase,"completed");assert.equal(f.sends(),0);
});
test("recovery without a prior restore still exposes its unresolved reservation on mismatch",async()=>{
  const f=fixture();f.setStored(record("buy",{hash:undefined}));f.ports.verifyRecovery=async()=>{throw Error("market.recoveryMismatch");};
  await f.engine.recover(account,hash);assert.equal(state(f).phase,"unknown");assert.equal(state(f).pending.reservation,"request-one");assert.equal(f.sends(),0);
});
test("failed hash persistence cannot shadow known receipt evidence with a hashless stored record",async()=>{
  const f=fixture(),save=f.ports.storage.save,clear=f.ports.storage.clear;
  f.ports.storage.save=r=>{if(r.hash)throw Error("market.storageUnavailable");save(r);};
  f.ports.storage.clear=r=>{if(f.stored()?.hash!==r.hash)throw Error("market.storageConflict");clear(r);};
  await f.engine.review(buy);await f.engine.execute(account);assert.equal(state(f).phase,"completed");assert.equal(state(f).evidence.hash,hash);assert.equal(f.stored().hash,undefined);
  f.ports.storage.save=save;await f.engine.resume(account);assert.equal(state(f).phase,"completed");assert.equal(f.stored(),null);assert.equal(f.receipts(),1);
});
test("new account review cannot discard another account's hashless pending",async()=>{
  const f=fixture();f.ports.send=async()=>{throw Error("timeout");};await f.engine.review(buy);await f.engine.execute(account);const first=state(f);
  f.setStored(null);f.setToken({...token,account:other});await f.engine.review(list);
  assert.equal(f.engine.getSnapshot()[other].phase,"review");assert.equal(state(f).pending.reservation,first.pending.reservation);assert.equal(state(f).phase,"unknown");
});

test("market storage key is stream/account normalized and cannot touch claim/create stores",()=>{
  const store=new Map([[`vestora:claim-pending:11155111:${stream.toLowerCase()}:${account}`,"keep-claim"],[`vestora:create-pending:11155111:${stream.toLowerCase()}:${account}`,"keep-create"]]);
  const s=loader({store})("src/lib/market-action-storage"),storage=s.browserMarketActionStorage(),r=record();
  assert.equal(s.marketPendingKey(account.toUpperCase()),`vestora:market-pending:11155111:${stream.toLowerCase()}:${account}`);
  storage.save(r);assert.equal(storage.read(account).price,r.price);assert.throws(()=>storage.save({...r,reservation:"another"}),/storageConflict/);
  assert.throws(()=>storage.clear({...r,hash:hash2}),/storageConflict/);storage.clear(r);assert.equal(store.size,2);assert.equal(storage.read(account),null);
});
for(const patch of [{id:"03"},{account:other},{contract:other},{stream:other},{paymentToken:other},{chainId:1},{price:"-1"},{remaining:(2n**256n).toString()},{withdrawn:"1.2"},{reviewBlock:"-1"},{step:"list"},{hash:"no"},{reservation:""},{createdAt:-1},{failure:{reason:"guess"}}]){
  test(`corrupt stored ${Object.keys(patch)[0]} fails closed`,()=>assert.throws(()=>storageModel.decodePendingMarketAction(JSON.stringify({...record(),...patch}),account),/pendingCorrupt/));
}
test("storage refusal, corruption and failed readback fail closed",()=>{
  for(const storage of [{getItem:()=>{throw Error("denied");}},{getItem:()=>""},{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}]){
    const s=loader({storage})("src/lib/market-action-storage").browserMarketActionStorage();assert.throws(()=>s.save(record()));
  }
});
for(const kind of ["claim","create","cancel-payment","mint"]){
  for(const raw of ["", "{corrupt"]){
    test(`raw ${kind} ${raw?"corrupt":"empty"} pending blocks market`,()=>{
      const target=kind==="mint"?usdc:stream,key=`vestora:${kind}-pending:11155111:${target.toLowerCase()}:${account}`;
      const c=loader({store:new Map([[key,raw]])})("src/lib/market-action-chain");assert.throws(()=>c.assertNoOtherMarketPending(account.toUpperCase()),/otherPending/);
    });
  }
}
test("own market reservation is excluded and shared navigator lock is normalized",async()=>{
  let key,callbacks=0;const c=loader({store:new Map([[storageModel.marketPendingKey(account),"own-corrupt"]]),locks:{request:async(k,_o,fn)=>{key=k;await fn({});}}})("src/lib/market-action-chain");
  const p=c.browserMarketActionPorts({},async()=>{}, {assertNoOtherPending:async()=>{callbacks++;}});await p.assertNoOtherPending(account);await p.lock(account.toUpperCase(),async()=>{});
  assert.equal(key,`vestora:claim:${stream.toLowerCase()}:${account}`);assert.equal(callbacks,1);
});

function rpcFixture(patch={}){
  const calls=[];
  const values={paymentToken:usdc,receivableNft:stream,getListing:{seller,price:buy.price},ownerOf:seller,
    getStream:{sender:other,token:usdc,depositedAmount:22_000_000n,withdrawnAmount:2_000_000n,cancelable:true,canceled:false},vestedAmount:7_000_000n,claimableAmount:5_000_000n,
    getApproved:market,isApprovedForAll:false,balanceOf:30_000_000n,allowance:buy.price,...patch};
  const rpc={getChainId:async()=>11155111,getBlock:async()=>({number:100n,timestamp:1_000n}),getCode:async p=>{calls.push(p);return"0x1234";},
    readContract:async p=>{calls.push(p);return values[p.functionName];},getBalance:async p=>{calls.push(p);return 10n**18n;},
    simulateContract:async p=>{calls.push(p);return {result:p.address===usdc?true:undefined};},estimateContractGas:async()=>100_000n,
    estimateFeesPerGas:async()=>({maxFeePerGas:2_000_000_000n,maxPriorityFeePerGas:1_000_000_000n})};
  return {rpc,values,calls};
}
test("chain quote pins reads/deployments to one block and sends the four protected buy constraints",async()=>{
  const f=rpcFixture();const q=await chain.readMarketActionQuote(token,buy,f.rpc),r=chain.marketActionRequest(record());
  assert.equal(q.remaining,20_000_000n);assert.equal(q.claimable,5_000_000n);assert.equal(q.gasEstimate.scope,"public-rpc-direct");
  assert.equal(r.functionName,"buyWithProtection");assert.equal(r.args.map(String).join(","),[3n,buy.price,20_000_000n,2_000_000n,seller].map(String).join(","));
  assert.ok(f.calls.every(c=>c.blockNumber===100n));
});
for(const [name,patch,error]of [
  ["market token",{paymentToken:other},"deploymentMismatch"],["market NFT",{receivableNft:other},"deploymentMismatch"],
  ["stream token",{getStream:{token:other}},"tokenUnsupported"],["seller ownership",{ownerOf:other},"sellerNotOwner"],
  ["listing removal",{getListing:{seller:zero,price:0n}},"notListed"],["price change",{getListing:{seller,price:9n}},"conditionsChanged"],
  ["self purchase",{getListing:{seller:account,price:buy.price}},"selfPurchase"],["NFT approval",{getApproved:zero},"notApproved"],
  ["token balance",{balanceOf:0n},"insufficientBalance"],
  ["remaining",{getStream:{token:usdc,depositedAmount:1n,withdrawnAmount:1n,canceled:false}},"noRemaining"],
  ["overpriced",{getStream:{token:usdc,depositedAmount:2n,withdrawnAmount:1n,canceled:false}},"priceAboveRemaining"],
]){
  test(`preflight rejects ${name}`,async()=>{const f=rpcFixture(patch);await assert.rejects(chain.readMarketActionQuote(token,buy,f.rpc),new RegExp(error));});
}
test("chain/deployment/native gas uncertainty blocks requests before signing",async()=>{
  for(const [method,replacement,error]of [["getChainId",async()=>1,"chainUnavailable"],["getCode",async()=>"0x","deploymentMismatch"],["getBalance",async()=>0n,"gasInsufficient"],["estimateFeesPerGas",async()=>{throw Error("fee unavailable");},"fee unavailable"]]){
    const f=rpcFixture();f.rpc[method]=replacement;await assert.rejects(chain.readMarketActionQuote(token,buy,f.rpc),new RegExp(error));
  }
  await assert.rejects(chain.readMarketActionQuote({...token,chainId:"0x1"},buy,rpcFixture().rpc),/network/);
});
test("canceled-stream value uses vested ceiling, not original deposit",async()=>{
  const f=rpcFixture();f.values.getStream.canceled=true;f.values.vestedAmount=15_000_000n;
  const q=await chain.readMarketActionQuote(token,buy,f.rpc);assert.equal(q.remaining,13_000_000n);assert.equal(q.canceled,true);
});
test("new approvals are exact ERC20 amount and individual NFT only",async()=>{
  const f=rpcFixture({allowance:0n}),q=await chain.readMarketActionQuote(token,buy,f.rpc);assert.equal(q.step,"erc20-approval");
  const approval=chain.marketActionRequest(record("erc20-approval"));assert.equal(approval.address,usdc);assert.equal(approval.args[0],market);assert.equal(approval.args[1],buy.price);
  const g=rpcFixture({ownerOf:account,getListing:{seller:zero,price:0n},getApproved:zero}),n=await chain.readMarketActionQuote(token,list,g.rpc);assert.equal(n.step,"nft-approval");
  const nft=chain.marketActionRequest(record("nft-approval"));assert.equal(nft.functionName,"approve");assert.equal(nft.args[1],3n);
  g.values.isApprovedForAll=true;assert.equal((await chain.readMarketActionQuote(token,list,g.rpc)).step,"list");
  f.rpc.simulateContract=async()=>({result:false});await assert.rejects(chain.readMarketActionQuote(token,buy,f.rpc),/simulationFailed/);
});
test("list and cancellation validate current rights; stale seller can cancel without NFT approval",async()=>{
  const f=rpcFixture({ownerOf:account,getListing:{seller:zero,price:0n}});assert.equal((await chain.readMarketActionQuote(token,list,f.rpc)).step,"list");
  f.values.ownerOf=other;await assert.rejects(chain.readMarketActionQuote(token,list,f.rpc),/notOwner/);
  f.values.ownerOf=account;f.values.getListing={seller:account,price:buy.price};await assert.rejects(chain.readMarketActionQuote(token,list,f.rpc),/alreadyListed/);
  f.values.ownerOf=other;f.values.getApproved=zero;assert.equal((await chain.readMarketActionQuote(token,cancel,f.rpc)).step,"cancel-listing");
  f.values.getListing.seller=other;await assert.rejects(chain.readMarketActionQuote(token,cancel,f.rpc),/notSeller/);
});
for(const draft of [buy,list,cancel]){
  test(`browser send ${draft.action} rechecks chain and session, then emits one exact request`,async()=>{
    const f=rpcFixture(draft.action==="buy"?{}:{ownerOf:account,getListing:{seller:draft.action==="list"?zero:account,price:draft.action==="list"?0n:buy.price}});
    let writes=0,request;const c=loader({rpc:f.rpc,write:async r=>{writes++;request=r;return hash;}})("src/lib/market-action-chain");
    const p=c.browserMarketActionPorts({assertCurrent:async()=>{}},async()=>{}),q=await p.quote(token,draft);
    assert.equal(await p.send(q),hash);assert.equal(writes,1);assert.equal(request.functionName,draft.action==="buy"?"buyWithProtection":draft.action==="list"?"list":"cancelListing");
  });
}
test("browser send fails before the wallet on late conditions or cross-action pending",async()=>{
  const f=rpcFixture();let writes=0;const store=new Map(),c=loader({rpc:f.rpc,store,write:async()=>{writes++;return hash;}})("src/lib/market-action-chain");
  const p=c.browserMarketActionPorts({assertCurrent:async()=>{}},async()=>{}),q=await p.quote(token,buy);
  f.values.getListing.price=9n;await assert.rejects(p.send(q),/conditionsChanged/);assert.equal(writes,0);
  f.values.getListing.price=buy.price;store.set(`vestora:mint-pending:11155111:${usdc.toLowerCase()}:${account}`,"corrupt");await assert.rejects(p.send(q),/otherPending/);assert.equal(writes,0);
});

function receiptFor(r,patch={}){
  const nft=r.step==="nft-approval",approval=nft||r.step==="erc20-approval",eventName=approval?"Approval":r.step==="buy"?"Purchased":r.step==="list"?"Listed":"ListingCanceled";
  const abi=approval?(nft?chain.marketNftAbi:chain.marketTokenAbi):chain.marketActionAbi;
  const args=approval?(nft?{owner:r.account,approved:market,tokenId:BigInt(r.id)}:{owner:r.account,spender:market}):{streamId:BigInt(r.id),seller:r.seller,...(r.step==="buy"?{buyer:r.account}:{})};
  const topics=viem.encodeEventTopics({abi,eventName,args});
  const data=approval&&!nft||r.step==="buy"||r.step==="list"?viem.encodeAbiParameters([{type:"uint256"}],[BigInt(r.price)]):"0x";
  const log={address:approval?(nft?stream:usdc):market,topics,data,logIndex:2,removed:false,transactionHash:r.hash||hash,blockNumber:101n,blockHash};
  return {status:"success",transactionHash:r.hash||hash,blockNumber:101n,blockHash,logs:[log],...patch};
}
function txRpc(r,receipt=receiptFor(r),patch={}){
  const tx={hash:r.hash||hash,from:r.account,to:chain.marketActionRequest(r).address,value:0n,chainId:11155111,nonce:7,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,input:viem.encodeFunctionData(chain.marketActionRequest(r)),...patch};
  return {getChainId:async()=>11155111,getTransaction:async()=>tx,getTransactionReceipt:async()=>receipt,waitForTransactionReceipt:async()=>receipt};
}
for(const step of ["buy","list","cancel-listing","erc20-approval","nft-approval"]){
  test(`${step}: direct and wrapped success both require the one exact authoritative event`,async()=>{
    const r=record(step),receipt=receiptFor(r);assert.equal(chain.marketReceiptEvidence(r,receipt).step,step);
    const rpc=txRpc(r,receipt);assert.equal(await chain.marketTransactionKind(r,hash,rpc),"direct");await chain.verifyMarketActionRecovery(r,hash,rpc);
    const wrapped=txRpc(r,receipt,{to:other,input:"0x1234"});assert.equal(await chain.marketTransactionKind(r,hash,wrapped),"wrapped");await chain.verifyMarketActionRecovery(r,hash,wrapped);
    assert.equal((await chain.readMarketActionReceipt(r,()=>{},wrapped)).id,"3");
    await assert.rejects(chain.verifyMarketActionRecovery(r,hash,txRpc(r,{...receipt,logs:[]},{to:other,input:"0x1234"})),/recoveryMismatch/);
    assert.equal(chain.marketReceiptEvidence(r,{...receipt,logs:[receipt.logs[0],{...receipt.logs[0],logIndex:3}]}),undefined);
  });
}
for(const [label,mutate]of [
  ["wrong id",r=>({...r,id:"4"})],["wrong seller",r=>({...r,seller:other})],["wrong buyer",r=>({...r,account:other})],["changed price",r=>({...r,price:"1"})],
]){
  test(`receipt cannot falsely prove ${label}`,()=>{const r=record(),receipt=receiptFor(mutate(r));assert.equal(chain.marketReceiptEvidence(r,receipt),undefined);});
}
for(const [label,patch]of [["wrong contract",{address:other}],["removed",{removed:true}],["bad index",{logIndex:-1}],["another transaction",{transactionHash:hash2}],["another block",{blockNumber:99n}],["another block hash",{blockHash:hash2}],["malformed data",{data:"0x01"}],["extra topic",{topics:[...receiptFor(record()).logs[0].topics,hash]}]]){
  test(`receipt ignores ${label}`,()=>{const r=record(),receipt=receiptFor(r);receipt.logs=[{...receipt.logs[0],...patch}];assert.equal(chain.marketReceiptEvidence(r,receipt),undefined);});
}
test("wrong transaction sender, target, chain, value or calldata never proves recovery",async()=>{
  const r=record();for(const patch of [{from:other},{to:usdc},{chainId:1},{value:1n},{input:viem.encodeFunctionData(chain.marketActionRequest({...r,id:"4"}))},{hash:hash2}]){
    const rpc=txRpc(r,receiptFor(r),patch);assert.equal(await chain.marketTransactionKind(r,hash,rpc),"mismatch");await assert.rejects(chain.verifyMarketActionRecovery(r,hash,rpc),/recoveryMismatch/);
  }
});
test("same-nonce repricing accepts exact receipt; an unproven unrelated original hash stays unresolved",async()=>{
  const r=record(),receipt=receiptFor({...r,hash:hash2}),rpc=txRpc({...r,hash:hash2},receipt);let seen;
  rpc.waitForTransactionReceipt=async opts=>{opts.onReplaced({transactionReceipt:receipt,replacedTransaction:{hash,from:account,nonce:7},transaction:{hash:hash2,from:account,nonce:7}});return receipt;};
  assert.equal((await chain.readMarketActionReceipt(r,h=>{seen=h;},rpc)).hash,hash2);assert.equal(seen,hash2);
  const unrelated=txRpc(r,receiptFor(r),{input:"0x"});await assert.rejects(chain.readMarketActionReceipt(r,()=>{},unrelated),/receiptUnavailable/);
  const reverted=txRpc(r,receiptFor(r,{status:"reverted"}));assert.equal(await chain.readMarketActionReceipt(r,()=>{},reverted),"reverted");
});
test("replacement requires the previous hash, account and exact nonce before publishing a new hash",async()=>{
  const r=record(),receipt=receiptFor({...r,hash:hash2});
  for(const patch of [{hash:hash2},{from:other},{nonce:8},{nonce:-1},{nonce:undefined}]){
    const rpc=txRpc({...r,hash:hash2},receipt);let callbacks=0;
    rpc.waitForTransactionReceipt=async opts=>{opts.onReplaced({transactionReceipt:receipt,replacedTransaction:{hash,from:account,nonce:7,...patch},transaction:{hash:hash2,from:account,nonce:7}});return receipt;};
    await assert.rejects(chain.readMarketActionReceipt(r,()=>callbacks++,rpc),/receiptUnavailable/);assert.equal(callbacks,0);
  }
});
test("proven same-nonce different calls or empty self-cancellations terminate monitoring, not purchase success",async()=>{
  const r=record();
  for(const patch of [{to:market,input:"0x"},{to:account,input:"0x",value:0n}]){
    const receipt=receiptFor({...r,hash:hash2},{logs:[]}),rpc=txRpc({...r,hash:hash2},receipt,patch);
    rpc.waitForTransactionReceipt=async opts=>{opts.onReplaced({transactionReceipt:receipt,replacedTransaction:{hash,from:account,nonce:7},transaction:{hash:hash2,from:account,nonce:7}});return receipt;};
    assert.equal(await chain.readMarketActionReceipt(r,()=>{},rpc),"replaced");
  }
});
test("receipt transaction block/hash/nonce mismatches cannot clear reservations even for a revert",async()=>{
  const r=record();for(const status of ["success","reverted"])for(const patch of [{blockNumber:99n},{blockHash:hash2},{nonce:-1},{nonce:undefined}]){
    await assert.rejects(chain.readMarketActionReceipt(r,()=>{},txRpc(r,receiptFor(r,{status}),patch)),/receiptUnavailable/);
  }
});
test("malformed receipt status is not proof of a failed or completed transaction",async()=>{
  const r=record();for(const status of [undefined,"pending","0x2"]){
    await assert.rejects(chain.readMarketActionReceipt(r,()=>{},txRpc(r,receiptFor(r,{status}))),/receiptUnavailable/);
  }
});
test("manual recovery to a different known hash needs the original sender's same nonce",async()=>{
  const r=record(),receipt=receiptFor({...r,hash:hash2});
  for(const nonce of [7,8]){
    const rpc=txRpc({...r,hash:hash2},receipt),candidate=await rpc.getTransaction();
    rpc.getTransaction=async({hash:requested})=>requested===hash?{...candidate,hash,nonce}:{...candidate,nonce:7};
    if(nonce===7)await chain.verifyMarketActionRecovery(r,hash2,rpc);else await assert.rejects(chain.verifyMarketActionRecovery(r,hash2,rpc),/recoveryMismatch/);
  }
});
test("receipt hash mismatch or success without exact event stays unresolved",async()=>{
  const r=record();await assert.rejects(chain.readMarketActionReceipt(r,()=>{},txRpc(r,receiptFor(r,{transactionHash:hash2}))),/receiptUnavailable/);
  await assert.rejects(chain.readMarketActionReceipt(r,()=>{},txRpc(r,receiptFor(r,{logs:[]}))),/receiptUnavailable/);
});
test("old matching receipts and mixed duplicate events cannot prove a fresh reservation",async()=>{
  const r=record(),old=receiptFor(r,{blockNumber:100n});old.logs[0].blockNumber=100n;
  assert.equal(chain.marketReceiptEvidence(r,old),undefined);await assert.rejects(chain.verifyMarketActionRecovery(r,hash,txRpc(r,old)),/recoveryMismatch/);
  const receipt=receiptFor(r),unrelated=receiptFor({...r,id:"4"});receipt.logs.push({...unrelated.logs[0],logIndex:3});assert.equal(chain.marketReceiptEvidence(r,receipt),undefined);
});
test("API projection requires applied checkpoint and exact market fields",async()=>{
  const r=record(),e=chain.marketReceiptEvidence(r,receiptFor(r));let response={meta:{projection:{latestProjectedBlock:"101"}},data:[{streamId:"3",seller,buyer:account,price:r.price,transactionHash:hash,logIndex:2}]};
  const c=loader({api:async()=>response})("src/lib/market-action-chain");assert.equal(await c.marketActionProjected(r,e),true);
  response.meta.projection.latestProjectedBlock="100";assert.equal(await c.marketActionProjected(r,e),false);response.meta.projection.latestProjectedBlock="101";
  response.data[0].buyer=other;assert.equal(await c.marketActionProjected(r,e),false);
  const l=record("list");response={meta:{projection:{latestProjectedBlock:"101"}},data:{streamId:"3",token:usdc,listing:{streamId:"3",seller:account,price:l.price,listingTxHash:hash,status:"ACTIVE"}}};
  assert.equal(await c.marketActionProjected(l,{...e,step:"list"}),true);response.data.listing.listingTxHash=hash2;assert.equal(await c.marketActionProjected(l,{...e,step:"list"}),false);
  response.data.listing.status="CANCELED";assert.equal(await c.marketActionProjected(record("cancel-listing"),{...e,step:"cancel-listing"}),true);
});
