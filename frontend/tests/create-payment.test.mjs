import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync,readdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";
const root=resolve(import.meta.dirname,".."),require=createRequire(import.meta.url),viem=require("viem");
const account="0x1111111111111111111111111111111111111111",recipient="0x2222222222222222222222222222222222222222",contract="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",usdc="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9",hash="0x"+"c".repeat(64),hash2="0x"+"d".repeat(64);
function loader(overrides={}){const cache=new Map();return function load(file){const path=resolve(root,file.endsWith(".ts")?file:`${file}.ts`);if(cache.has(path))return cache.get(path);const module={exports:{}};cache.set(path,module.exports);
  const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const get=id=>id in overrides?overrides[id]:id==="viem"?viem:id==="viem/chains"?require(id):id==="./live-config"?{LIVE_STREAM:contract,LIVE_USDC:usdc,LIVE_RPC_URL:"https://example.invalid"}:id==="./live-api"?{readApi:async()=>{throw Error("No external API");},detailSchema:{}}:load(id.startsWith("@/")?resolve(root,"src",id.slice(2)):resolve(dirname(path),id));
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,BigInt,Intl,Error,console,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},navigator:{locks:{request:async(_k,_o,fn)=>fn({})}}})(get,module,module.exports);return module.exports;};}
const load=loader(),model=load("src/lib/create-payment-model"),{createPaymentEngine}=load("src/lib/create-payment-engine");
const draft={recipient,amount:1000000n,start:200n,end:800n,cancelable:true,name:"Test payment"};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test("new-origin empty storage cannot bypass the known unresolved account hold for creation",async()=>{
  const f=fixture(),held="0xbf9bf852225899b667aa4c73bb082e830abb9de1";
  f.session.capture=()=>({account:held,chainId:"0xaa36a7",revision:1,provider:{}});
  let reads=0;f.ports.quote=async()=>{reads++;throw Error("must not quote");};
  const engine=createPaymentEngine(f.ports);await engine.review(draft);await engine.execute(held);
  assert.equal(engine.getSnapshot()[held].error,"claim.deploymentHold");
  assert.equal(reads,0);assert.equal(f.sends(),0);assert.equal(f.stored(),null);
});
function fixture(){let stored=null,sends=0,receipts=0,allowance=0n,changed=false,failSave=false;const token={account,chainId:"0xaa36a7",revision:1,provider:{request:async()=>{throw Error("No real wallet");}}};
  const session={capture:()=>token,assertCurrent:async()=>{if(changed)throw Error("claim.sessionChanged");}};
  const ports={session,now:()=>123,storage:{read:()=>stored,save:r=>{if(failSave)throw Error("create.storageUnavailable");stored=r;},clear:()=>{stored=null;}},
    quote:async(t,d)=>({draft:d,token:t,account:t.account,step:allowance<d.amount?"approval":"create",allowance,block:120n,at:100n}),
    send:async()=>{sends++;return hash;},receipt:async r=>{receipts++;return{hash:r.hash,block:121n,...(r.step==="create"?{streamId:"3"}:{})};},verifyRecovery:async()=>{},projected:async()=>true,refresh:async()=>{},lock:async(_a,fn)=>fn()};
  return{session,ports,engine:createPaymentEngine(ports),stored:()=>stored,sends:()=>sends,receipts:()=>receipts,approve:()=>{allowance=draft.amount;},change:()=>{changed=true;},failSave:()=>{failSave=true;}};
}
test("payment drafts reject zero recipients, amounts, invalid ranges and oversized integers",()=>{
  model.validatePayment(draft);for(const patch of [{recipient:"0x"+"0".repeat(40)},{amount:0n},{amount:2n**256n},{start:-1n},{end:200n},{end:2n**64n},{cancelable:"true"},{name:"x".repeat(61)}])assert.throws(()=>model.validatePayment({...draft,...patch}));
});
test("creation reservations strictly isolate deployment, account, chain and exact draft",()=>{
  const f=fixture(),r=model.paymentRecord({draft,account,step:"create"},123);assert.equal(model.decodePendingPayment(JSON.stringify(r),account).draft.amount,"1000000");
  for(const patch of [{contract:recipient},{account:recipient},{chainId:1},{step:"other"},{hash:"bad"},{draft:{...r.draft,amount:1}},{draft:{...r.draft,recipient:"bad"}}])assert.throws(()=>model.decodePendingPayment(JSON.stringify({...r,...patch}),account));
  assert.equal(f.sends(),0);
});
test("approval completes without automatically creating a payment",async()=>{
  const f=fixture();await f.engine.review(draft);assert.equal(f.engine.getSnapshot()[account].quote.step,"approval");assert.equal(f.sends(),0);
  await f.engine.execute(account);assert.equal(f.sends(),1);assert.equal(f.engine.getSnapshot()[account].phase,"approved");assert.equal(f.stored(),null);
  await f.engine.execute(account);assert.equal(f.sends(),1);f.approve();await f.engine.review(draft);assert.equal(f.engine.getSnapshot()[account].quote.step,"create");await f.engine.execute(account);assert.equal(f.sends(),2);assert.equal(f.engine.getSnapshot()[account].phase,"completed");assert.equal(f.engine.getSnapshot()[account].evidence.streamId,"3");
});
test("step drift, changed account and failed persistence prevent wallet sends",async()=>{
  const f=fixture();await f.engine.review(draft);f.approve();await f.engine.execute(account);assert.equal(f.sends(),0);assert.equal(f.engine.getSnapshot()[account].error,"create.conditionsChanged");
  await f.engine.review(draft);f.change();await f.engine.execute(account);assert.equal(f.sends(),0);
  const s=fixture();await s.engine.review(draft);s.failSave();await s.engine.execute(account);assert.equal(s.sends(),0);
});
test("double clicks and another unresolved creation do not cause duplicate sends",async()=>{
  const f=fixture();await f.engine.review(draft);await Promise.all([f.engine.execute(account),f.engine.execute(account)]);assert.equal(f.sends(),1);
  const r=model.paymentRecord({draft,account,step:"create"},123);f.ports.storage.save(r);await f.engine.review(draft);assert.equal(f.engine.getSnapshot()[account].phase,"unknown");await f.engine.execute(account);assert.equal(f.sends(),1);
});
test("wallet rejection clears reservations but ambiguous send failures remain unresolved",async()=>{
  const f=fixture();f.ports.send=async()=>{throw{code:4001};};await f.engine.review(draft);await f.engine.execute(account);assert.equal(f.engine.getSnapshot()[account].phase,"rejected");assert.equal(f.stored(),null);
  f.ports.send=async()=>{throw Error("transport lost");};await f.engine.review(draft);await f.engine.execute(account);assert.equal(f.engine.getSnapshot()[account].phase,"unknown");assert.ok(f.stored());
});
test("a proven pre-wallet guard failure releases the reservation",async()=>{
  const f=fixture();f.ports.send=async()=>{throw new model.PaymentNotSubmitted("claim.sessionChanged");};await f.engine.review(draft);await f.engine.execute(account);assert.equal(f.stored(),null);assert.equal(f.engine.getSnapshot()[account].phase,"error");
});
test("receipt timeouts survive reload and recover without resending",async()=>{
  const f=fixture();f.approve();f.ports.receipt=async()=>{throw Error("timeout");};await f.engine.review(draft);await f.engine.execute(account);assert.equal(f.stored().hash,hash);
  f.ports.receipt=async()=>({hash,block:121n,streamId:"3"});const engine=createPaymentEngine(f.ports);engine.restore(account);await engine.resume(account);assert.equal(engine.getSnapshot()[account].phase,"completed");assert.equal(f.sends(),1);
});
test("chain creation evidence is preserved across API and subsequent RPC outages",async()=>{
  const f=fixture();f.approve();f.ports.projected=async()=>false;await f.engine.review(draft);await f.engine.execute(account);assert.equal(f.engine.getSnapshot()[account].phase,"indexing");
  f.ports.receipt=async()=>{throw Error("RPC offline");};await f.engine.resume(account);assert.equal(f.engine.getSnapshot()[account].phase,"indexing");assert.equal(f.engine.getSnapshot()[account].evidence.streamId,"3");
  f.ports.projected=async()=>true;f.ports.refresh=async()=>{throw Error("API offline");};await f.engine.resume(account);assert.equal(f.engine.getSnapshot()[account].phase,"completed");assert.equal(f.engine.getSnapshot()[account].warning,"create.refreshWarning");assert.equal(f.sends(),1);
});
test("invalid recovery hash preserves pending creation and replacements follow the new hash",async()=>{
  const f=fixture();f.ports.send=async()=>{throw Error("lost");};await f.engine.review(draft);await f.engine.execute(account);f.ports.verifyRecovery=async()=>{throw Error("create.recoveryMismatch");};await f.engine.recover(account,hash);assert.equal(f.stored().hash,undefined);
  f.ports.verifyRecovery=async()=>{};f.ports.receipt=async(_r,replace)=>{replace(hash2);return{hash:hash2,block:122n};};await f.engine.recover(account,hash);assert.equal(f.engine.getSnapshot()[account].phase,"approved");assert.equal(f.engine.getSnapshot()[account].evidence.hash,hash2);
});
function adapterFixture(){const f=fixture(),calls=[];let allowance=0n,balance=10000000n,gas=10n**18n,time=100n;
  const rpc={getChainId:async()=>11155111,getBlock:async()=>({number:120n,timestamp:time}),getBalance:async()=>gas,estimateFeesPerGas:async()=>({maxFeePerGas:2n,maxPriorityFeePerGas:1n}),estimateContractGas:async()=>21000n,
    readContract:async q=>{calls.push(q);return q.functionName==="balanceOf"?balance:allowance;},simulateContract:async q=>({result:q.functionName==="approve"?true:3n})};
  const adapter=loader({viem:{...viem,createPublicClient:()=>rpc}})("src/lib/create-payment-chain");
  return{...f,rpc,adapter,calls,setAllowance:a=>{allowance=a;},setBalance:a=>{balance=a;},setGas:a=>{gas=a;},setTime:a=>{time=a;}};
}
test("adapter pins balance and allowance reads and chooses only the needed next step",async()=>{
  const f=adapterFixture(),t=f.session.capture();assert.equal((await f.adapter.quotePayment(t,draft)).step,"approval");assert.ok(f.calls.every(q=>q.blockNumber===120n));f.setAllowance(draft.amount);assert.equal((await f.adapter.quotePayment(t,draft)).step,"create");
  f.setBalance(0n);await assert.rejects(()=>f.adapter.quotePayment(t,draft),/insufficientBalance/);f.setBalance(draft.amount);f.setGas(0n);await assert.rejects(()=>f.adapter.quotePayment(t,draft),/gasInsufficient/);f.setGas(10n**18n);f.setTime(201n);await assert.rejects(()=>f.adapter.quotePayment(t,draft),/startPassed/);
});
function receiptFixture(step="create"){
  const f=adapterFixture(),d=draft,r=model.paymentRecord({draft:d,account,step},123);r.hash=hash;
  const abi=step==="create"?f.adapter.paymentAbi:f.adapter.paymentTokenAbi,eventName=step==="create"?"StreamCreated":"Approval";
  const indexed=step==="create"?{streamId:3n,sender:account,recipient}:{owner:account,spender:contract};
  const data=step==="create"?viem.encodeAbiParameters([{type:"address"},{type:"uint256"},{type:"uint256"},{type:"uint256"},{type:"bool"}],[usdc,d.amount,d.start,d.end,d.cancelable]):viem.encodeAbiParameters([{type:"uint256"}],[d.amount]);
  const log={address:step==="create"?contract:usdc,topics:viem.encodeEventTopics({abi,eventName,args:indexed}),data,logIndex:2};
  const tx={from:account,to:recipient,input:"0xabcdef01",chainId:11155111,value:0n},receipt={status:"success",transactionHash:hash,blockNumber:121n,logs:[log]};
  f.rpc.getTransaction=async()=>tx;f.rpc.getTransactionReceipt=async()=>receipt;f.rpc.waitForTransactionReceipt=async()=>receipt;
  return{...f,record:r,log,receipt,tx,ports:f.adapter.browserPaymentPorts(f.session,async()=>{})};
}
test("approval and creation accept wallet wrappers only with exact source events",async()=>{
  for(const step of ["approval","create"]){const f=receiptFixture(step),e=await f.ports.receipt(f.record,()=>{});assert.equal(e.hash,hash);assert.equal(e.streamId,step==="create"?"3":undefined);await f.ports.verifyRecovery(f.record,hash);}
});
test("creation proof rejects another sender, value, chain, event contract and mismatched terms",async()=>{
  for(const patch of [{from:recipient},{value:1n},{chainId:1}]){const f=receiptFixture();Object.assign(f.tx,patch);assert.equal(await f.ports.receipt(f.record,()=>{}),"replaced");}
  for(const patch of [{address:usdc},{removed:true},{data:"0x00"}]){const f=receiptFixture();Object.assign(f.log,patch);await assert.rejects(()=>f.ports.receipt(f.record,()=>{}),/receiptUnavailable/);}
  for(const patch of [{amount:1000001n},{start:201n},{end:801n},{cancelable:false},{recipient:account}]){const f=receiptFixture();f.record=model.paymentRecord({draft:{...draft,...patch},account,step:"create"},123);f.record.hash=hash;await assert.rejects(()=>f.ports.receipt(f.record,()=>{}),/receiptUnavailable/);}
});
test("missing or duplicate creation events, wrong approval amount and reverted receipts never succeed",async()=>{
  const f=receiptFixture();f.receipt.logs=[f.log,f.log];await assert.rejects(()=>f.ports.receipt(f.record,()=>{}),/receiptUnavailable/);f.receipt.logs=[];await assert.rejects(()=>f.ports.receipt(f.record,()=>{}),/receiptUnavailable/);
  const a=receiptFixture("approval");a.log.data=viem.encodeAbiParameters([{type:"uint256"}],[2n**256n-1n]);await assert.rejects(()=>a.ports.verifyRecovery(a.record,hash),/recoveryMismatch/);
  a.receipt.status="reverted";assert.equal(await a.ports.receipt(a.record,()=>{}),"reverted");
});
test("approval send is exact-amount and creation uses reviewed fields with transport retry disabled",async()=>{
  const f=fixture();let sent;const adapter=loader({viem:{...viem,createPublicClient:()=>({}),custom:(_p,o)=>{assert.equal(o.retryCount,0);return{};},createWalletClient:()=>({writeContract:async q=>{sent=q;return hash;}})}})("src/lib/create-payment-chain"),ports=adapter.browserPaymentPorts(f.session,async()=>{});
  const q=await f.ports.quote(f.session.capture(),draft);await ports.send(q);assert.equal(sent.address,usdc);assert.equal(sent.functionName,"approve");assert.equal(sent.args[0],contract);assert.equal(sent.args[1],1000000n);
  q.step="create";await ports.send(q);assert.equal(sent.address,contract);assert.equal(sent.functionName,"createStream");assert.deepEqual([...sent.args],[recipient,usdc,draft.amount,draft.start,draft.end,true]);assert.equal(sent.account,account);assert.equal(sent.chain.id,11155111);
  f.change();sent=null;await assert.rejects(()=>ports.send(q),/sessionChanged/);assert.equal(sent,null);
});
test("all payment phase, error and UI translation keys exist",()=>{
  const locale=JSON.parse(readFileSync(resolve(root,"public/locales/ko.json"),"utf8"));const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(p,e.name)):[resolve(p,e.name)]);
  for(const file of walk(resolve(root,"src")).filter(p=>/\.(ts|tsx)$/.test(p)))for(const m of readFileSync(file,"utf8").matchAll(/["'](create\.[\w.-]+)["']/g))assert.ok(m[1] in locale,m[1]);
  for(const phase of ["checking","review","wallet","submitted","approved","indexing","completed","rejected","reverted","replaced","unknown","error"]){assert.ok(`create.phase.${phase}` in locale);assert.ok(`create.body.${phase}` in locale);}
});
test("account revision changes invalidate a reviewed payment before execution",async()=>{
  const f=fixture();await f.engine.review(draft);f.session.capture=()=>({account:recipient,revision:2});f.engine.invalidate();assert.equal(f.engine.getSnapshot()[account].phase,"error");await f.engine.execute(account);assert.equal(f.sends(),0);
});
test("creation shares the claim lock and refuses an unresolved claim before sending",async()=>{
  const f=fixture();let requestedKey;
  const adapter=loader({"./claim-storage":{browserClaimStorage:()=>({read:()=>({hash})})},viem:{...viem,createPublicClient:()=>({})}})("src/lib/create-payment-chain");
  const ports=adapter.browserPaymentPorts(f.session,async()=>{});await assert.rejects(()=>ports.lock(account,async()=>{requestedKey="must not run";}),/otherPending/);assert.equal(requestedKey,undefined);
});
test("API creation proof requires applied checkpoint, exact hash and all original payment terms",async()=>{
  const f=fixture(),r=model.paymentRecord({draft,account,step:"create"},123);r.hash=hash;
  const data={streamId:"3",createdTxHash:hash,sender:account,recipient,token:usdc,depositedAmount:"1000000",startTime:new Date(200000).toISOString(),endTime:new Date(800000).toISOString(),cancelable:true};
  const response={data,meta:{projection:{latestProjectedBlock:"120"}}};
  const adapter=loader({"./live-api":{readApi:async()=>response,detailSchema:{}},viem:{...viem,createPublicClient:()=>({})}})("src/lib/create-payment-chain"),ports=adapter.browserPaymentPorts(f.session,async()=>{}),e={hash,block:121n,streamId:"3"};
  assert.equal(await ports.projected(r,e),false);response.meta.projection.latestProjectedBlock="121";assert.equal(await ports.projected(r,e),true);
  for(const patch of [{createdTxHash:hash2},{sender:recipient},{recipient:account},{depositedAmount:"999999"},{cancelable:false},{startTime:new Date(201000).toISOString()}]){response.data={...data,...patch};assert.equal(await ports.projected(r,e),false);}
});

test("B07 uint256 maximum is accepted as an integer and maximum plus one is rejected",()=>{
  model.validatePayment({...draft,amount:2n**256n-1n});
  assert.throws(()=>model.validatePayment({...draft,amount:2n**256n}),/invalidAmount/);
  const record=model.paymentRecord({draft:{...draft,amount:2n**256n-1n},account,step:"create"},123);
  assert.equal(model.unpackPayment(model.decodePendingPayment(JSON.stringify(record),account)).amount,2n**256n-1n);
});
test("B14 names use UTF-16 length at 0,1,59,60,61 including surrogate pairs",()=>{
  for(const name of ["","x","x".repeat(59),"x".repeat(60),"\ud83d\ude00".repeat(30)])model.validatePayment({...draft,name});
  for(const name of ["x".repeat(61),"\ud83d\ude00".repeat(30)+"x"])assert.throws(()=>model.validatePayment({...draft,name}),/invalidDraft/);
});
test("B16 start T-1,T,T+1 uses the actual chain quote guard",async()=>{
  const f=adapterFixture();f.setTime(200n);
  await assert.rejects(()=>f.adapter.quotePayment(f.session.capture(),{...draft,start:199n}),/startPassed/);
  for(const start of [200n,201n])assert.equal((await f.adapter.quotePayment(f.session.capture(),{...draft,start})).draft.start,start);
});
test("B17 end S-1,S,S+1 is validated without rounding the one-second span",async()=>{
  for(const end of [199n,200n])assert.throws(()=>model.validatePayment({...draft,end}),/invalidPeriod/);
  const f=adapterFixture();const q=await f.adapter.quotePayment(f.session.capture(),{...draft,end:201n});assert.equal(q.draft.end-q.draft.start,1n);
});
test("B18 time passing between review and execute fails before any wallet request",async()=>{
  const f=adapterFixture();f.ports.quote=f.adapter.quotePayment;const engine=createPaymentEngine(f.ports);
  await engine.review(draft);assert.equal(engine.getSnapshot()[account].phase,"review");f.setTime(201n);
  await engine.execute(account);assert.equal(f.sends(),0);assert.equal(f.stored(),null);assert.equal(engine.getSnapshot()[account].error,"create.startPassed");
});
test("B23 allowance amount-1,amount,amount+1 chooses only the required next step",async()=>{
  const f=adapterFixture();for(const [allowance,step] of [[999999n,"approval"],[1000000n,"create"],[1000001n,"create"]]){
    f.setAllowance(allowance);const q=await f.adapter.quotePayment(f.session.capture(),draft);assert.equal(q.step,step);assert.equal(q.allowance,allowance);
  }assert.equal(f.sends(),0);
});

test("QA05 approval and creation storage failures are pre-wallet errors",async()=>{
  for(const approval of [true,false]){const f=fixture();if(!approval)f.approve();await f.engine.review(draft);f.failSave();await f.engine.execute(account);
    const s=f.engine.getSnapshot()[account];assert.equal(s.phase,"error");assert.equal(s.error,"create.storageUnavailable");assert.equal(s.pending,undefined);assert.equal(f.sends(),0);
  }
});

test("approval and creation both check current maximum fees before requesting the wallet",async()=>{
  for(const approved of [false,true]){
    const f=adapterFixture();if(approved)f.setAllowance(draft.amount);
    f.rpc.estimateFeesPerGas=async()=>({maxFeePerGas:10n,maxPriorityFeePerGas:1n});
    f.setGas(209999n);await assert.rejects(()=>f.adapter.quotePayment(f.session.capture(),draft),/gasInsufficient/);
    f.setGas(210000n);const q=await f.adapter.quotePayment(f.session.capture(),draft);assert.equal(q.gasEstimate.maximumCost,210000n);assert.equal(q.step,approved?"create":"approval");
    f.ports.quote=f.adapter.quotePayment;const engine=createPaymentEngine(f.ports);await engine.review(draft);
    f.rpc.estimateFeesPerGas=async()=>({maxFeePerGas:11n,maxPriorityFeePerGas:1n});await engine.execute(account);
    assert.equal(engine.getSnapshot()[account].error,"claim.gasInsufficient");assert.equal(f.sends(),0);assert.equal(f.stored(),null);
  }
});

test("approval/create wallet gas diagnostics survive reload without permitting a retry",async()=>{
  for(const approved of [false,true]){
    const f=fixture();if(approved)f.approve();f.ports.send=async()=>{throw {code:-32603,cause:new viem.InsufficientFundsError({}),message:"private data"};};
    await f.engine.review(draft);await f.engine.execute(account);assert.equal(f.engine.getSnapshot()[account].phase,"unknown");assert.equal(f.stored().failure.reason,"insufficient-funds");
    assert.doesNotMatch(JSON.stringify(f.stored()),/private/);
    const engine=createPaymentEngine(f.ports);engine.restore(account);await engine.resume(account);await engine.review(draft);
    assert.equal(engine.getSnapshot()[account].error,"claim.walletGasUnresolved");assert.equal(f.sends(),0);
    f.ports.verifyRecovery=async()=>{throw Error("create.recoveryMismatch");};await engine.recover(account,hash);assert.ok(f.stored().failure);
  }
});

test("legacy creation records stay blocked and diagnostic metadata is strictly validated",async()=>{
  const f=fixture(),old=model.paymentRecord({draft,account,step:"create"},123);
  f.ports.storage.save(old);f.engine.restore(account);await f.engine.resume(account);await f.engine.review(draft);
  assert.equal(f.stored(),old);assert.equal(f.engine.getSnapshot()[account].phase,"unknown");assert.equal(f.sends(),0);
  assert.throws(()=>model.decodePendingPayment(JSON.stringify({...old,failure:{stage:"wallet",reason:"retry",at:123}}),account),/pendingCorrupt/);
});

test("a late creation diagnostic never overwrites another tab's recovered hash",async()=>{
  const f=fixture();f.ports.send=async()=>{f.ports.storage.save({...f.stored(),hash:hash2});throw Error("lost");};
  await f.engine.review(draft);await f.engine.execute(account);assert.equal(f.stored().hash,hash2);assert.equal(f.stored().failure,undefined);assert.equal(f.engine.getSnapshot()[account].warning,"create.storageWarning");
});

test("creation hash recovery takes the same lock and rechecks the pending record",async()=>{
  const f=fixture(),r=model.paymentRecord({draft,account,step:"create"},123);let verified=0;
  f.ports.storage.save(r);f.engine.restore(account);f.ports.lock=async()=>{throw Error("claim.tabBusy");};f.ports.verifyRecovery=async()=>{verified++;};
  await f.engine.recover(account,hash);assert.equal(verified,0);assert.equal(f.stored(),r);
  f.ports.lock=async(_a,fn)=>fn();f.ports.verifyRecovery=async()=>{verified++;f.ports.storage.save({...r,hash:hash2});};
  await f.engine.recover(account,hash);assert.equal(verified,1);assert.equal(f.stored().hash,hash2);assert.equal(f.receipts(),0);assert.equal(f.sends(),0);
});

test("creation recovery does not settle after a captured session changes",async()=>{
  const f=fixture(),r=model.paymentRecord({draft,account,step:"create"},123);f.ports.storage.save(r);f.engine.restore(account);
  f.ports.verifyRecovery=async()=>f.change();await f.engine.recover(account,hash);
  assert.equal(f.stored(),r);assert.equal(f.engine.getSnapshot()[account].error,"claim.sessionChanged");assert.equal(f.receipts(),0);assert.equal(f.sends(),0);
});
