import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync,existsSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createRequire} from "node:module";
import vm from "node:vm";

// In staging only, resolve existing dependencies/read-only shared modules from the source app.
const root=resolve(import.meta.dirname,".."),source=existsSync(resolve(root,"src/lib/live-config.ts"))?root:resolve(process.env.VESTORA_FRONTEND_ROOT||"C:/GitHub/Vestora/frontend");
const require=createRequire(resolve(source,"package.json")),ts=require("typescript"),viem=require("viem");
const account="0x1111111111111111111111111111111111111111",owner="0x2222222222222222222222222222222222222222",other="0x3333333333333333333333333333333333333333";
const contract="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",usdc="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9",market="0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7",zero="0x"+"0".repeat(40);
const hash="0x"+"c".repeat(64),hash2="0x"+"d".repeat(64),blockHash="0x"+"a".repeat(64);
const held="0xbf9bf852225899b667aa4c73bb082e830abb9de1";
const config={LIVE_STREAM:contract,LIVE_USDC:usdc,LIVE_MARKET:market,LIVE_RPC_URL:"https://offline.invalid"};
function memoryStorage(){const data=new Map();return {data,getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
function loader(overrides={},globals={}){
  const cache=new Map(),browserStorage=globals.localStorage||memoryStorage();
  return function load(file){
    let path=file.endsWith(".ts")?file:`${file}.ts`;path=resolve(root,path);
    if(!existsSync(path)){const relative=path.startsWith(root)?path.slice(root.length+1):file;path=resolve(source,relative);}
    if(cache.has(path))return cache.get(path);
    const module={exports:{}};cache.set(path,module.exports);
    const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const get=id=>id in overrides?overrides[id]:id==="viem"?viem:id==="viem/chains"?require(id):id==="./live-config"?config:
      id==="./live-api"?{readApi:async()=>{throw Error("External API disabled");},detailSchema:{}}:
      load(resolve(dirname(path),id));
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,BigInt,Intl,Error,console,localStorage:browserStorage,
      navigator:{locks:{request:async(_k,_o,fn)=>fn({})}},fetch:()=>{throw Error("Network disabled");},...globals})(get,module,module.exports);
    return module.exports;
  };
}
const load=loader(),model=load("src/lib/cancel-payment-model"),{createCancelPaymentEngine}=load("src/lib/cancel-payment-engine");
const baseTerms={sender:account,owner,tokenAddress:usdc,deposited:1000000n,withdrawn:0n,start:200n,end:800n};
const walletToken={account,chainId:"0xaa36a7",revision:1,provider:{request:async()=>{throw Error("No real wallet");}}};
function quote(patch={}){const terms={...baseTerms,...patch};return {...terms,...model.cancelAmounts(terms,patch.at??300n),id:"3",account,token:walletToken,block:120n,at:300n,listingSeller:zero,listingPrice:0n,...patch};}
function evidence(patch={}){return {hash,block:121n,blockHash,at:400n,logIndex:6,sender:account,recipient:owner,tokenAddress:usdc,vested:333333n,refund:666667n,withdrawnAtBlock:0n,ownerUnclaimedAtBlock:333333n,refundLogIndex:5,...patch};}
function fixture(){
  let stored=null,sends=0,receipts=0,changed=false,failSave=false;
  const session={capture:()=>walletToken,assertCurrent:async()=>{if(changed)throw Error("claim.sessionChanged");}};
  const ports={session,now:()=>123,storage:{read:()=>stored,save:r=>{if(failSave)throw Error("cancel.storageUnavailable");stored=r;},clear:r=>{if(stored&&!model.sameCancelRecord(r,stored))throw Error("cancel.storageChanged");stored=null;}},
    quote:async(t,id)=>quote({id,account:t.account,token:t}),send:async()=>{sends++;return hash;},receipt:async r=>{receipts++;return evidence({hash:r.hash});},
    verifyRecovery:async()=>{},projected:async()=>true,refresh:async()=>{},lock:async(_a,fn)=>fn()};
  return {session,ports,engine:createCancelPaymentEngine(ports),stored:()=>stored,sends:()=>sends,receipts:()=>receipts,change:()=>{changed=true;},failSave:()=>{failSave=true;}};
}
const state=f=>f.engine.getSnapshot()[account];

test("staged modules typecheck against actual shared dependencies through a read-only compiler overlay",()=>{
  const names=["cancel-payment-model","cancel-payment-storage","cancel-payment-engine","cancel-payment-chain"];
  const overlays=new Map(names.map(name=>[resolve(source,`src/lib/${name}.ts`).replaceAll("\\","/").toLowerCase(),readFileSync(resolve(root,`src/lib/${name}.ts`),"utf8")]));
  const livePath=resolve(source,"src/lib/live-config.ts"),liveSource=readFileSync(livePath,"utf8");
  overlays.set(livePath.replaceAll("\\","/").toLowerCase(),liveSource+(/export const LIVE_MARKET\b/.test(liveSource)?"":`\nexport const LIVE_MARKET = "${market}" as const;\n`));
  const configFile=ts.readConfigFile(resolve(source,"tsconfig.app.json"),ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(configFile.config,ts.sys,source),host=ts.createCompilerHost(parsed.options),read=host.readFile,exists=host.fileExists;
  const key=p=>resolve(p).replaceAll("\\","/").toLowerCase();host.readFile=p=>overlays.get(key(p))??read(p);host.fileExists=p=>overlays.has(key(p))||exists(p);
  const roots=names.map(name=>resolve(source,`src/lib/${name}.ts`));
  for(const p of parsed.fileNames)if(p.endsWith(".d.ts"))roots.push(p);
  const program=ts.createProgram(roots,{...parsed.options,noEmit:true},host),diagnostics=ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>source,getNewLine:()=>"\n"}));
});
test("integer accounting preserves vested rights after prior claims and changes refunds with chain time",()=>{
  assert.deepEqual({...model.cancelAmounts({...baseTerms,withdrawn:100000n},400n)},{vested:333333n,refund:666667n,ownerUnclaimed:233333n});
  assert.equal(model.cancelAmounts({...baseTerms,withdrawn:0n},199n).refund,1000000n);
  assert.equal(model.cancelAmounts(baseTerms,800n).refund,0n);
  assert.equal(model.cancelAmounts({...baseTerms,deposited:1n},799n).refund,1n);
  assert.throws(()=>model.cancelAmounts({...baseTerms,withdrawn:333334n},400n),/conditionsChanged/);
  assert.equal(model.cancelAmounts({...baseTerms,owner:account},400n).refund+model.cancelAmounts(baseTerms,400n).ownerUnclaimed,1000000n);
});
test("staged TypeScript modules pass the repository's existing ESLint rules without writing outputs",async()=>{
  const {ESLint}=require("eslint"),eslint=new ESLint({cwd:source});
  for(const name of ["cancel-payment-model","cancel-payment-storage","cancel-payment-engine","cancel-payment-chain"]){
    const results=await eslint.lintText(readFileSync(resolve(root,`src/lib/${name}.ts`),"utf8"),{filePath:resolve(source,`src/lib/${name}.ts`)});
    const errors=results.flatMap(r=>r.messages.filter(m=>m.severity===2).map(m=>`${name}:${m.line} ${m.message}`));assert.deepEqual(errors,[]);
  }
});
test("strict pending validation isolates account, chain, contract, snapshot and diagnostics",()=>{
  const r=model.cancelPaymentRecord(quote(),123);assert.equal(model.decodePendingCancelPayment(JSON.stringify(r),account).id,"3");
  for(const patch of [{version:2},{chainId:1},{account:owner},{contract:usdc},{id:"0"},{id:"03"},{id:String(2n**256n)},{createdAt:-1},{hash:"0x00"},{quoteAt:"800"},{estimatedRefund:"1"},
    {terms:{...r.terms,tokenAddress:other}},{terms:{...r.terms,start:"-1"}},{failure:{stage:"wallet",reason:"retry",at:123}},{evidence:{hash}}])
    assert.throws(()=>model.decodePendingCancelPayment(JSON.stringify({...r,...patch}),account),/pendingCorrupt/);
  for(const raw of ["", "null", "{}", "false", "[]"])assert.throws(()=>model.decodePendingCancelPayment(raw,account),/pendingCorrupt/);
  assert.equal(model.decodePendingCancelPayment(null,account),null);
});
test("pending evidence validates actual mined math independently of the original quote",()=>{
  const r={...model.cancelPaymentRecord(quote(),123),hash,evidence:model.packCancelEvidence(evidence())};
  assert.equal(model.unpackCancelEvidence(model.decodePendingCancelPayment(JSON.stringify(r),account)).refund,666667n);
  for(const patch of [{refund:"833334"},{recipient:zero},{blockHash:"bad"},{refundLogIndex:4},{refundLogIndex:-1,logIndex:0},{withdrawnAtBlock:"333334"},{at:"299"},{ownerUnclaimedAtBlock:"0"}])
    assert.throws(()=>model.decodePendingCancelPayment(JSON.stringify({...r,evidence:{...r.evidence,...patch}}),account),/pendingCorrupt/);
});
test("storage uses exact lowercase keys, read-back persistence and compare-before-clear",()=>{
  const localStorage=memoryStorage(),m=loader({}, {localStorage}),storage=m("src/lib/cancel-payment-storage").browserCancelPaymentStorage(),r=model.cancelPaymentRecord(quote(),123);
  storage.save(r);assert.equal(storage.read(account.toUpperCase()).id,"3");
  assert.equal([...localStorage.data.keys()][0],`vestora:cancel-payment-pending:11155111:${contract.toLowerCase()}:${account}`);
  storage.save({...r,hash:hash2});assert.throws(()=>storage.clear(r),/storageChanged/);assert.equal(storage.read(account).hash,hash2);
  storage.clear({...r,hash:hash2});assert.equal(storage.read(account),null);
});
test("storage corruption and blocked browser storage fail closed",()=>{
  for(const storage of [{getItem:()=>"corrupt"},{getItem:()=>{throw Error("denied");}},{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}]){
    const s=loader({}, {localStorage:storage})("src/lib/cancel-payment-storage").browserCancelPaymentStorage();
    if(storage.setItem)assert.throws(()=>s.save(model.cancelPaymentRecord(quote(),123)),/storageUnavailable/);else assert.throws(()=>s.read(account),/pendingCorrupt|storageUnavailable/);
  }
});
test("review is read-only and success exposes a distinct actual refund",async()=>{
  const f=fixture();let updates=0;const stop=f.engine.subscribe(()=>updates++);
  await f.engine.review("3");assert.equal(state(f).phase,"review");assert.equal(f.sends(),0);assert.equal(state(f).quote.refund,833334n);
  await f.engine.execute(account);assert.equal(state(f).phase,"completed");assert.equal(state(f).evidence.refund,666667n);assert.equal(state(f).quote.refund,833334n);assert.equal(f.stored(),null);assert.ok(updates>=5);
  stop();await f.engine.execute(account);assert.equal(f.sends(),1);
});
test("double clicks, uppercase account aliases and parallel review do not duplicate requests",async()=>{
  const f=fixture();await f.engine.review("3");await Promise.all([f.engine.execute(account),f.engine.execute(account.toUpperCase()),f.engine.review("3")]);assert.equal(f.sends(),1);
});
test("owner, withdrawn, static terms, listing or backward block drift require new review",async()=>{
  for(const patch of [{owner:other},{withdrawn:1n},{deposited:2000000n},{start:201n},{end:801n},{listingSeller:owner},{listingPrice:1n},{block:119n},{at:299n}]){
    const f=fixture();await f.engine.review("3");f.ports.quote=async()=>quote(patch);await f.engine.execute(account);assert.equal(f.sends(),0);assert.equal(state(f).error,"cancel.conditionsChanged");
  }
});
test("normal time progression refreshes estimates before requesting the wallet",async()=>{
  const f=fixture();await f.engine.review("3");f.ports.quote=async()=>quote({at:400n,...model.cancelAmounts(baseTerms,400n),block:121n});
  f.ports.send=async q=>{assert.equal(q.refund,666667n);return hash;};await f.engine.execute(account);assert.equal(state(f).quote.refund,666667n);assert.equal(f.stored(),null);
});
test("explicit B reuse reaches cancellation preflight without sending",async()=>{
  const f=fixture();f.session.capture=()=>({...walletToken,account:held});let quotes=0;f.ports.quote=async()=>{quotes++;throw Error("cancel.readFailed");};
  await f.engine.review("3");assert.equal(f.engine.getSnapshot()[held].error,"cancel.readFailed");assert.equal(quotes,1);assert.equal(f.sends(),0);
});
test("optional cross-action guard is rechecked after the final quote and prevents sends",async()=>{
  const f=fixture();let otherPending=false;f.ports.assertNoOtherPending=async()=>{if(otherPending)throw Error("cancel.otherPending");};await f.engine.review("3");
  f.ports.quote=async()=>{otherPending=true;return quote();};await f.engine.execute(account);assert.equal(f.sends(),0);assert.equal(f.stored(),null);assert.equal(state(f).error,"cancel.otherPending");
});
test("parent actions namespace errors survive the optional guard without being flattened",async()=>{
  for(const error of ["actions.otherPending","actions.storageUnavailable"]){
    const f=fixture();f.ports.assertNoOtherPending=()=>{throw Error(error);};await f.engine.review("3");assert.equal(state(f).error,error);assert.equal(f.sends(),0);
  }
});
test("no wallet call occurs if reservation persistence or lock acquisition fails",async()=>{
  for(const fail of [f=>f.failSave(),f=>{f.ports.lock=async()=>{throw Error("claim.tabBusy");};}]){
    const f=fixture();await f.engine.review("3");fail(f);await f.engine.execute(account);assert.equal(f.sends(),0);assert.equal(state(f).phase,"error");
  }
});
test("session changes before execution invalidate reviews without changing pending work",async()=>{
  const f=fixture();await f.engine.review("3");f.change();await f.engine.execute(account);assert.equal(f.sends(),0);assert.equal(state(f).error,"claim.sessionChanged");
  const g=fixture();await g.engine.review("3");g.session.capture=()=>({...walletToken,revision:2});g.engine.invalidateReviews();assert.equal(state(g).phase,"error");await g.engine.execute(account);assert.equal(g.sends(),0);
});
test("user rejection and proven pre-wallet failures release only their reservation",async()=>{
  for(const err of [{code:4001},new model.CancelPaymentNotSubmitted("claim.sessionChanged")]){
    const f=fixture();f.ports.send=async()=>{throw err;};await f.engine.review("3");await f.engine.execute(account);
    assert.equal(f.stored(),null);assert.equal(state(f).phase,err.code===4001?"rejected":"error");
  }
});
test("ambiguous wallet errors are sanitized, survive reload and forbid resend",async()=>{
  const f=fixture();f.ports.send=async()=>{throw {code:-32603,cause:new viem.InsufficientFundsError({}),message:"private provider text"};};
  await f.engine.review("3");await f.engine.execute(account);assert.equal(state(f).phase,"unknown");assert.equal(f.stored().failure.reason,"insufficient-funds");assert.doesNotMatch(JSON.stringify(f.stored()),/private/);
  f.engine=createCancelPaymentEngine(f.ports);f.engine.restore(account);await f.engine.resume(account);await f.engine.review("3");await f.engine.execute(account);
  assert.equal(state(f).error,"claim.walletGasUnresolved");assert.equal(f.receipts(),0);assert.equal(f.sends(),0);
});
test("invalid returned hash and timeouts keep a blocking reservation",async()=>{
  const f=fixture();f.ports.send=async()=>"bad";await f.engine.review("3");await f.engine.execute(account);assert.equal(state(f).phase,"unknown");assert.ok(f.stored());
  const g=fixture();g.ports.receipt=async()=>{throw Error("timeout");};await g.engine.review("3");await g.engine.execute(account);assert.equal(g.stored().hash,hash);await g.engine.review("3");assert.equal(g.sends(),1);
});
test("hash lost in storage stays blocked in memory even if localStorage is later empty",async()=>{
  const f=fixture();f.ports.send=async()=>{f.failSave();return hash;};f.ports.receipt=async()=>{throw Error("timeout");};
  await f.engine.review("3");await f.engine.execute(account);assert.equal(state(f).pending.hash,hash);assert.equal(state(f).warning,"cancel.storageWarning");
  f.ports.storage.read=()=>null;await f.engine.review("3");await f.engine.execute(account);assert.equal(state(f).phase,"unknown");assert.equal(state(f).pending.hash,hash);
});
test("projection lag, refresh errors and repeated resume never resend or downgrade receipt proof",async()=>{
  const f=fixture();f.ports.projected=async()=>false;await f.engine.review("3");await f.engine.execute(account);assert.equal(state(f).phase,"indexing");assert.ok(f.stored().evidence);
  f.ports.receipt=async()=>{throw Error("RPC offline");};f.ports.projected=async()=>{throw Error("API offline");};await f.engine.resume(account);assert.equal(state(f).phase,"indexing");assert.equal(state(f).evidence.refund,666667n);
  f.ports.projected=async()=>true;f.ports.refresh=async()=>{throw Error("refresh offline");};await f.engine.resume(account);assert.equal(state(f).phase,"completed");assert.equal(state(f).warning,"cancel.refreshWarning");assert.equal(f.sends(),1);
});
test("reload retains evidence but requires new chain verification before API can complete",async()=>{
  const f=fixture();f.ports.projected=async()=>false;await f.engine.review("3");await f.engine.execute(account);
  f.engine=createCancelPaymentEngine(f.ports);f.engine.restore(account);assert.equal(state(f).warning,"cancel.receiptRecheckWarning");
  let projections=0;f.ports.projected=async()=>{projections++;return true;};f.ports.receipt=async()=>{throw Error("RPC offline");};await f.engine.resume(account);
  assert.equal(state(f).phase,"indexing");assert.equal(projections,0);assert.equal(state(f).evidence.refund,666667n);assert.ok(f.stored());
  f.ports.receipt=async()=>evidence();await f.engine.resume(account);assert.equal(state(f).phase,"completed");assert.equal(projections,1);assert.equal(f.sends(),1);
});
test("storage read/clear failures preserve receipt evidence and block a new review",async()=>{
  const f=fixture();f.ports.projected=async()=>false;await f.engine.review("3");await f.engine.execute(account);
  f.ports.storage.read=()=>{throw Error("cancel.storageUnavailable");};await f.engine.resume(account);assert.equal(state(f).phase,"indexing");assert.ok(state(f).evidence);
  await f.engine.review("3");assert.equal(state(f).phase,"indexing");assert.equal(f.sends(),1);
});
test("replacement hash is persisted even when receipt waiting later times out",async()=>{
  const f=fixture();f.ports.receipt=async(_r,replaced)=>{replaced(hash2);throw Error("timeout");};await f.engine.review("3");await f.engine.execute(account);
  assert.equal(f.stored().hash,hash2);assert.equal(state(f).pending.hash,hash2);assert.equal(state(f).phase,"unknown");
  f.ports.receipt=async r=>evidence({hash:r.hash});await f.engine.resume(account);assert.equal(state(f).phase,"completed");assert.equal(state(f).evidence.hash,hash2);assert.equal(f.sends(),1);
});
test("revert and proven replacement complete monitoring without triggering a new wallet request",async()=>{
  for(const result of ["reverted","replaced"]){const f=fixture();f.ports.receipt=async()=>result;await f.engine.review("3");await f.engine.execute(account);assert.equal(state(f).phase,result);assert.equal(f.stored(),null);await f.engine.resume(account);await f.engine.execute(account);assert.equal(f.sends(),1);}
});
test("recovery mismatch, wrong wallet, changed pending, changed session and lock contention preserve records",async()=>{
  for(const setup of [f=>{f.ports.verifyRecovery=async()=>{throw Error("cancel.recoveryMismatch");};},f=>{f.session.capture=()=>({...walletToken,account:owner});},
    f=>{f.ports.verifyRecovery=async()=>f.ports.storage.save({...f.stored(),hash:hash2});},f=>{f.ports.verifyRecovery=async()=>f.change();},f=>{f.ports.lock=async()=>{throw Error("claim.tabBusy");};}]){
    const f=fixture(),r=model.cancelPaymentRecord(quote(),123);f.ports.storage.save(r);f.engine.restore(account);setup(f);await f.engine.recover(account,hash);
    assert.ok(f.stored());assert.equal(f.receipts(),0);assert.equal(f.sends(),0);assert.equal(state(f).phase,"unknown");
  }
});
test("valid hash recovery takes shared lock and restores receipt monitoring without sending",async()=>{
  const f=fixture(),r=model.cancelPaymentRecord(quote(),123);f.ports.storage.save(r);f.engine.restore(account);
  await f.engine.recover(account,"bad");assert.equal(state(f).phase,"unknown");await f.engine.recover(account,hash);assert.equal(state(f).phase,"completed");assert.equal(f.stored(),null);assert.equal(f.sends(),0);
});
test("a late diagnostic cannot overwrite another tab's recovered transaction",async()=>{
  const f=fixture();f.ports.send=async()=>{f.ports.storage.save({...f.stored(),hash:hash2});throw Error("lost");};await f.engine.review("3");await f.engine.execute(account);
  assert.equal(f.stored().hash,hash2);assert.equal(f.stored().failure,undefined);assert.equal(state(f).warning,"cancel.storageWarning");
  f.ports.receipt=async r=>{assert.equal(r.hash,hash2);return evidence({hash:hash2});};await f.engine.resume(account);assert.equal(state(f).phase,"completed");assert.equal(state(f).evidence.hash,hash2);
});

function adapterFixture(){
  const localStorage=memoryStorage(),calls=[];let time=300n,receiptTime=400n,balance=10n**18n,chainId=11155111,fee=10n;
  const stream={sender:account,token:usdc,depositedAmount:1000000n,withdrawnAmount:0n,startTime:200n,endTime:800n,cancelable:true,canceled:false,canceledAt:0n};
  const listing={seller:zero,price:0n};let nft=contract,paymentToken=usdc,nftOwner=owner;
  const rpc={getChainId:async()=>chainId,getBlock:async args=>args?.blockNumber===121n?{number:121n,timestamp:receiptTime,hash:blockHash}:{number:120n,timestamp:time,hash:"0x"+"b".repeat(64)},
    readContract:async q=>{calls.push(q);if(q.functionName==="getStream")return q.blockNumber===121n?{...stream,canceled:true,canceledAt:receiptTime}:stream;
      if(q.functionName==="ownerOf")return nftOwner;if(q.functionName==="getListing")return listing;if(q.functionName==="receivableNft")return nft;if(q.functionName==="paymentToken")return paymentToken;throw Error(q.functionName);},
    getBalance:async q=>{calls.push(q);return balance;},simulateContract:async q=>{calls.push(q);return {result:model.cancelAmounts({...baseTerms,withdrawn:stream.withdrawnAmount},time).refund};},
    estimateContractGas:async()=>21000n,estimateFeesPerGas:async()=>({maxFeePerGas:fee,maxPriorityFeePerGas:1n})};
  const session={capture:()=>walletToken,assertCurrent:async()=>{}},adapter=loader({viem:{...viem,createPublicClient:()=>rpc}},{localStorage})("src/lib/cancel-payment-chain");
  return {rpc,adapter,ports:adapter.browserCancelPaymentPorts(session,async()=>{}),session,stream,listing,calls,localStorage,setTime:n=>{time=n;},setReceiptTime:n=>{receiptTime=n;},setBalance:n=>{balance=n;},setChain:n=>{chainId=n;},setFee:n=>{fee=n;},setNft:n=>{nft=n;},setToken:n=>{paymentToken=n;},setOwner:n=>{nftOwner=n;}};
}
async function receiptFixture(){
  const f=adapterFixture(),q=await f.adapter.readCancelPaymentQuote(walletToken,"3"),r={...model.cancelPaymentRecord(q,123),hash};
  const metadata={blockNumber:121n,blockHash,transactionHash:hash,transactionIndex:1,removed:false};
  const refundLog={...metadata,address:usdc,logIndex:5,topics:viem.encodeEventTopics({abi:f.adapter.cancelTokenAbi,eventName:"Transfer",args:{from:contract,to:account}}),data:viem.encodeAbiParameters([{type:"uint256"}],[666667n])};
  const cancelLog={...metadata,address:contract,logIndex:6,topics:viem.encodeEventTopics({abi:f.adapter.cancelPaymentAbi,eventName:"StreamCanceled",args:{streamId:3n,sender:account,recipient:owner}}),data:viem.encodeAbiParameters([{type:"uint256"},{type:"uint256"}],[333333n,666667n])};
  const receipt={status:"success",transactionHash:hash,blockNumber:121n,blockHash,transactionIndex:1,logs:[refundLog,cancelLog]};
  const tx={hash,from:account,to:contract,input:viem.encodeFunctionData({abi:f.adapter.cancelPaymentAbi,functionName:"cancel",args:[3n]}),value:0n,chainId:11155111,blockNumber:121n,blockHash};
  f.rpc.waitForTransactionReceipt=async()=>receipt;f.rpc.getTransactionReceipt=async()=>receipt;f.rpc.getTransaction=async()=>tx;
  return {...f,r,q,receipt,tx,refundLog,cancelLog};
}
test("chain quote pins every view and simulation to one block and reads current owner and gas",async()=>{
  const f=adapterFixture(),q=await f.adapter.readCancelPaymentQuote(walletToken,"3");assert.equal(q.owner,owner);assert.equal(q.refund,833334n);assert.equal(q.ownerUnclaimed,166666n);assert.equal(q.gasEstimate.maximumCost,210000n);
  assert.ok(f.calls.every(q=>q.blockNumber===120n));assert.ok(f.calls.some(q=>q.address===market&&q.functionName==="getListing"));
});
test("quote rejects sender, cancelability, canceled, end-time, token, malformed listing and marketplace mismatch",async()=>{
  for(const [mutate,reason] of [[f=>{f.stream.sender=owner;},"notSender"],[f=>{f.stream.cancelable=false;},"notCancelable"],[f=>{f.stream.canceled=true;},"alreadyCanceled"],
    [f=>f.setTime(800n),"ended"],[f=>{f.stream.token=other;},"tokenUnsupported"],[f=>{f.listing.seller=owner;},"conditionsChanged"],
    [f=>{f.listing.price=1n;},"conditionsChanged"],[f=>f.setNft(other),"marketplaceMismatch"],[f=>f.setToken(other),"marketplaceMismatch"],[f=>f.setChain(1),"chainUnavailable"]]){
    const f=adapterFixture();mutate(f);await assert.rejects(()=>f.adapter.readCancelPaymentQuote(walletToken,"3"),new RegExp(reason));
  }
});
test("before-start and uneven boundaries stay exact; quote reorgs fail closed",async()=>{
  const f=adapterFixture();f.setTime(200n);assert.equal((await f.adapter.readCancelPaymentQuote(walletToken,"3")).refund,1000000n);
  f.setTime(799n);assert.equal((await f.adapter.readCancelPaymentQuote(walletToken,"3")).refund,1667n);
  const g=adapterFixture(),read=g.rpc.getBlock;g.rpc.getBlock=async q=>({...await read(q),...(q?.blockNumber===120n?{hash:hash2}:{})});
  await assert.rejects(()=>g.adapter.readCancelPaymentQuote(walletToken,"3"),/chainUnavailable/);
});
test("active sale registrations remain cancelable with explicit seller/price risk and exact rights",async()=>{
  const f=adapterFixture();f.listing.seller=owner;f.listing.price=450000n;
  const q=await f.adapter.readCancelPaymentQuote(walletToken,"3");
  assert.equal(q.listingSeller,owner);assert.equal(q.listingPrice,450000n);assert.equal(q.sender,account);assert.equal(q.owner,owner);assert.equal(q.refund,833334n);assert.equal(q.ownerUnclaimed,166666n);
  const engine=createCancelPaymentEngine({...fixture().ports,quote:f.adapter.readCancelPaymentQuote});
  await engine.review("3");await engine.execute(account);assert.equal(engine.getSnapshot()[account].phase,"completed");
});
test("time passing, owner or listing changes between review and execute are checked before the wallet",async()=>{
  for(const [change,reason] of [[f=>f.setTime(800n),"ended"],[f=>f.setOwner(other),"conditionsChanged"],[f=>{f.listing.seller=owner;f.listing.price=1n;},"conditionsChanged"]]){
    const f=adapterFixture(),g=fixture();g.ports.quote=f.adapter.readCancelPaymentQuote;g.engine=createCancelPaymentEngine(g.ports);
    await g.engine.review("3");change(f);await g.engine.execute(account);assert.equal(g.sends(),0);assert.match(state(g).error,new RegExp(reason));assert.equal(g.stored(),null);
  }
});
test("failed reads, simulation disagreement, invalid IDs and insufficient maximum gas all block preflight",async()=>{
  const f=adapterFixture();for(const id of ["0","-1","01",String(2n**256n)])await assert.rejects(()=>f.adapter.readCancelPaymentQuote(walletToken,id));
  f.rpc.simulateContract=async()=>({result:1n});await assert.rejects(()=>f.adapter.readCancelPaymentQuote(walletToken,"3"),/conditionsChanged/);
  const g=adapterFixture();g.setBalance(209999n);await assert.rejects(()=>g.adapter.readCancelPaymentQuote(walletToken,"3"),/gasInsufficient/);g.setBalance(210000n);assert.ok(await g.adapter.readCancelPaymentQuote(walletToken,"3"));g.setFee(11n);await assert.rejects(()=>g.adapter.readCancelPaymentQuote(walletToken,"3"),/gasInsufficient/);
  const h=adapterFixture();h.rpc.readContract=async()=>{throw Error("RPC offline");};await assert.rejects(()=>h.adapter.readCancelPaymentQuote(walletToken,"3"));
});
test("all other action raw reservations block cancel even if corrupted, own kind is excluded",async()=>{
  for(const prefix of [`claim-pending:11155111:${contract.toLowerCase()}`,`create-pending:11155111:${contract.toLowerCase()}`,`market-pending:11155111:${contract.toLowerCase()}`,`mint-pending:11155111:${usdc.toLowerCase()}`]){
    for(const raw of ["", "corrupt", "null"]){const f=adapterFixture();f.localStorage.setItem(`vestora:${prefix}:${account}`,raw);await assert.rejects(()=>f.adapter.readCancelPaymentQuote(walletToken,"3"),/otherPending/);}
  }
  const f=adapterFixture();f.localStorage.setItem(model.cancelPaymentPendingKey(account),"own");assert.ok(await f.adapter.readCancelPaymentQuote(walletToken,"3"));
});
test("send uses current session, original cancel calldata, no token approval and disabled retries",async()=>{
  let sent,requests=0;const session={assertCurrent:async()=>{requests++;},capture:()=>walletToken};
  const adapter=loader({viem:{...viem,createPublicClient:()=>({getChainId:async()=>11155111}),custom:(_p,o)=>{assert.equal(o.retryCount,0);return {};},createWalletClient:()=>({writeContract:async q=>{sent=q;return hash;}})}})("src/lib/cancel-payment-chain");
  const ports=adapter.browserCancelPaymentPorts(session,async()=>{});await ports.send(quote());assert.equal(sent.functionName,"cancel");assert.equal(sent.address,contract);assert.deepEqual([...sent.args],[3n]);assert.equal(sent.account,account);assert.equal(sent.chain.id,11155111);assert.equal(requests,2);
  sent=null;session.assertCurrent=async()=>{throw Error("claim.sessionChanged");};await assert.rejects(()=>ports.send(quote()),/sessionChanged/);assert.equal(sent,null);
});
test("adapter's lock preserves existing shared key and fails on unavailable locks or tab contention",async()=>{
  let key;const globals={navigator:{locks:{request:async(k,_o,fn)=>{key=k;return fn({});}}}};
  const ports=loader({viem:{...viem,createPublicClient:()=>({})}},globals)("src/lib/cancel-payment-chain").browserCancelPaymentPorts({},async()=>{});
  await ports.lock(account.toUpperCase(),async()=>{});assert.equal(key,`vestora:claim:${contract.toLowerCase()}:${account}`);
  for(const navigator of [{},{locks:{request:async(_k,_o,fn)=>fn(null)}}]){const p=loader({viem:{...viem,createPublicClient:()=>({})}},{navigator})("src/lib/cancel-payment-chain").browserCancelPaymentPorts({},async()=>{});await assert.rejects(()=>p.lock(account,async()=>{}),/lockUnavailable|tabBusy/);}
});
test("receipt proves mined values, recipient and token transfer without assuming the quote amount",async()=>{
  const f=await receiptFixture(),e=await f.ports.receipt(f.r,()=>{});assert.equal(e.refund,666667n);assert.notEqual(e.refund,f.q.refund);assert.equal(e.vested,333333n);assert.equal(e.recipient,owner);assert.equal(e.tokenAddress,usdc);assert.equal(e.at,400n);
  await f.ports.verifyRecovery(f.r,hash);
});
test("wrapper success needs the same exact authoritative event and token transfer",async()=>{
  const f=await receiptFixture();f.tx.to=other;f.tx.input="0xabcdef01";assert.equal((await f.ports.receipt(f.r,()=>{})).refund,666667n);await f.ports.verifyRecovery(f.r,hash);
  f.receipt.logs=[];await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);await assert.rejects(()=>f.ports.verifyRecovery(f.r,hash),/recoveryMismatch/);
});
test("identity mismatch without a proven nonce replacement stays unresolved",async()=>{
  for(const patch of [{from:owner},{chainId:1},{chainId:undefined},{value:1n},{input:"0xabcdef01"},{hash:hash2}]){const f=await receiptFixture();Object.assign(f.tx,patch);await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);}
  const f=await receiptFixture();f.receipt.status="reverted";assert.equal(await f.ports.receipt(f.r,()=>{}),"reverted");await assert.rejects(()=>f.ports.verifyRecovery(f.r,hash),/recoveryMismatch/);
});
test("a proven same-nonce replacement follows its hash and distinguishes reprice from cancellation",async()=>{
  for(const cancelled of [false,true]){
    const f=await receiptFixture(),prior={...f.tx,nonce:7};f.tx.hash=hash2;f.tx.nonce=7;
    if(cancelled){f.tx.to=account;f.tx.input="0x";f.receipt.logs=[];}
    f.receipt.transactionHash=hash2;for(const l of f.receipt.logs)l.transactionHash=hash2;
    f.rpc.waitForTransactionReceipt=async options=>{options.onReplaced({reason:cancelled?"cancelled":"repriced",replacedTransaction:prior,transaction:f.tx,transactionReceipt:f.receipt});return f.receipt;};
    let replaced;const result=await f.ports.receipt(f.r,h=>{replaced=h;});assert.equal(replaced,hash2);assert.equal(cancelled?result:result.hash,cancelled?"replaced":hash2);
  }
});
test("unproven replacements and noncanonical reverts keep the reservation unresolved",async()=>{
  const f=await receiptFixture();f.receipt.transactionHash=hash2;
  f.rpc.waitForTransactionReceipt=async options=>{options.onReplaced({reason:"repriced",replacedTransaction:{hash,from:account,nonce:7},transaction:{hash:hash2,from:owner,nonce:7},transactionReceipt:f.receipt});return f.receipt;};
  await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);
  const g=await receiptFixture();g.receipt.status="reverted";g.rpc.getBlock=async()=>({number:121n,hash:hash2,timestamp:400n});await assert.rejects(()=>g.ports.receipt(g.r,()=>{}),/receiptUnavailable/);
  const h=await receiptFixture();h.receipt.status=undefined;await assert.rejects(()=>h.ports.receipt(h.r,()=>{}),/receiptUnavailable/);
});
test("wrong event source, metadata, amounts, recipient, stream or duplicate proof never succeeds",async()=>{
  for(const patch of [{address:usdc},{removed:true},{logIndex:-1},{transactionHash:hash2},{blockHash:hash2},{blockNumber:120n},{transactionIndex:2},{data:"0x00"}]){
    const f=await receiptFixture();Object.assign(f.cancelLog,patch);await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);
  }
  for(const args of [{streamId:4n,sender:account,recipient:owner},{streamId:3n,sender:owner,recipient:owner},{streamId:3n,sender:account,recipient:other}]){
    const f=await receiptFixture();f.cancelLog.topics=viem.encodeEventTopics({abi:f.adapter.cancelPaymentAbi,eventName:"StreamCanceled",args});await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);
  }
  for(const amounts of [[166666n,833334n],[333334n,666666n]]){const f=await receiptFixture();f.cancelLog.data=viem.encodeAbiParameters([{type:"uint256"},{type:"uint256"}],amounts);await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);}
  const f=await receiptFixture();f.receipt.logs.push({...f.cancelLog});await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);
});
test("refund transfer must come from escrow, go to sender, use exact token and mined amount",async()=>{
  for(const patch of [{address:other},{removed:true},{transactionHash:hash2},{logIndex:4},{data:viem.encodeAbiParameters([{type:"uint256"}],[833334n])}]){
    const f=await receiptFixture();Object.assign(f.refundLog,patch);await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);
  }
  for(const args of [{from:owner,to:account},{from:contract,to:owner}]){const f=await receiptFixture();f.refundLog.topics=viem.encodeEventTopics({abi:f.adapter.cancelTokenAbi,eventName:"Transfer",args});await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);}
  const f=await receiptFixture();f.receipt.logs=[f.cancelLog];await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);
});
test("receipt block timestamp/hash and canceled stream state must all agree",async()=>{
  for(const patch of [{canceled:false},{canceledAt:399n},{token:other},{sender:owner},{depositedAmount:2000000n},{endTime:801n},{cancelable:false},{withdrawnAmount:333334n}]){
    const f=await receiptFixture(),read=f.rpc.readContract;f.rpc.readContract=async q=>({...await read(q),...(q.functionName==="getStream"?patch:{})});
    await assert.rejects(()=>f.ports.receipt(f.r,()=>{}));
  }
  const f=await receiptFixture();f.rpc.getBlock=async()=>({number:121n,hash:hash2,timestamp:400n});await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);
});
test("a cancellation mined after end can succeed with zero actual refund and no token transfer",async()=>{
  const f=await receiptFixture();f.setReceiptTime(800n);f.cancelLog.data=viem.encodeAbiParameters([{type:"uint256"},{type:"uint256"}],[1000000n,0n]);f.receipt.logs=[f.cancelLog];
  const e=await f.ports.receipt(f.r,()=>{});assert.equal(e.refund,0n);assert.equal(e.refundLogIndex,undefined);assert.equal(e.ownerUnclaimedAtBlock,1000000n);
  model.decodePendingCancelPayment(JSON.stringify({...f.r,evidence:model.packCancelEvidence(e)}),account);
});
test("current NFT owner may change while mining; later same-block owner ambiguity fails closed",async()=>{
  const f=await receiptFixture();f.setOwner(other);f.cancelLog.topics=viem.encodeEventTopics({abi:f.adapter.cancelPaymentAbi,eventName:"StreamCanceled",args:{streamId:3n,sender:account,recipient:other}});
  assert.equal((await f.ports.receipt(f.r,()=>{})).recipient,other);
  f.setOwner(owner);await assert.rejects(()=>f.ports.receipt(f.r,()=>{}),/receiptUnavailable/);
});
test("claims elsewhere in the same block affect only explicitly labeled block-end remaining rights",async()=>{
  const f=await receiptFixture();f.stream.withdrawnAmount=100000n;const e=await f.ports.receipt(f.r,()=>{});assert.equal(e.vested,333333n);assert.equal(e.refund,666667n);assert.equal(e.withdrawnAtBlock,100000n);assert.equal(e.ownerUnclaimedAtBlock,233333n);
});
test("API readiness needs applied checkpoint, exact cancellation time and original terms",async()=>{
  const r={...model.cancelPaymentRecord(quote(),123),hash},e=evidence();
  const s={streamId:"3",sender:account,token:usdc,depositedAmount:"1000000",withdrawnAmount:"0",cancelable:true,startTime:new Date(200000).toISOString(),endTime:new Date(800000).toISOString(),canceledAt:new Date(400000).toISOString()};
  const response={data:s,meta:{projection:{projectionStatus:"applied",latestProjectedBlock:"121"}}};
  const ports=loader({"./live-api":{readApi:async()=>response,detailSchema:{}},viem:{...viem,createPublicClient:()=>({})}})("src/lib/cancel-payment-chain").browserCancelPaymentPorts({},async()=>{});
  assert.equal(await ports.projected(r,e),true);
  for(const patch of [{canceledAt:null},{canceledAt:new Date(300000).toISOString()},{sender:owner},{token:other},{depositedAmount:"999999"},{withdrawnAmount:"333334"},{cancelable:false},{endTime:new Date(801000).toISOString()}]){response.data={...s,...patch};assert.equal(await ports.projected(r,e),false);}
  response.data=s;for(const p of [{projectionStatus:"pending",latestProjectedBlock:"121"},{projectionStatus:"applied",latestProjectedBlock:null},{projectionStatus:"applied",latestProjectedBlock:"120"}]){response.meta.projection=p;assert.equal(await ports.projected(r,e),false);}
});
