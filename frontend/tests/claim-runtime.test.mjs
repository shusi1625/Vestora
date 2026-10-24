import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync,readdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";
const root=resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
const snapshotActionHookStubs={
  "./use-market-action":{useMarketAction:()=>({})},
  "./use-cancel-payment":{useCancelPayment:()=>({})},
  "./use-mint-token":{useMintToken:()=>({})},
  "./use-live-action-history":{useLiveActionHistory:(_address,apiRows,_engines)=>{
    if(!Array.isArray(apiRows))throw new TypeError("Expected useLiveActionHistory API rows argument");
    return {records:apiRows,warning:undefined};
  }},
};
const realViem=require("viem"),a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222";
const contract="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",usdc="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9",hash="0x"+"a".repeat(64),hash2="0x"+"b".repeat(64);
function loader(overrides={},DateValue=Date,globals={}){
  const cache=new Map();
  function load(file){const path=resolve(root,file.endsWith(".ts")?file:`${file}.ts`);if(cache.has(path))return cache.get(path);const module={exports:{}};cache.set(path,module.exports);
    const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const localRequire=id=>id in overrides?overrides[id]:id==="viem"?realViem:id==="viem/chains"?require(id):id==="./live-config"?{LIVE_STREAM:contract,LIVE_USDC:usdc,LIVE_RPC_URL:"https://example.invalid"}:id==="./live-api"?{readApi:async()=>{throw Error("No external API in tests");},detailSchema:{}}:load(id.startsWith("@/")?resolve(root,"src",id.slice(2)):resolve(dirname(path),id));
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date:DateValue,BigInt,Intl,Error,console,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},navigator:{locks:{request:async(_key,_options,fn)=>fn({})}},...globals})(localRequire,module,module.exports);return module.exports;
  }return load;
}
const load=loader(),{createWalletSession,walletRejected}=load("src/lib/wallet-session"),{createClaimEngine}=load("src/lib/claim-engine"),policy=load("src/lib/claim-policy");
test("explicit B reuse removes only the static hold and retains own unresolved claims",async()=>{
  const f=await fixture(),account="0xbf9bf852225899b667aa4c73bb082e830abb9de1";
  f.wallet.accounts=[account];f.wallet.emit("accountsChanged",[account]);
  let reads=0;f.ports.quote=async()=>{reads++;throw Error("claim.readFailed");};
  const engine=createClaimEngine(f.ports);
  await engine.review("3");
  assert.equal(engine.getSnapshot()[account].error,"claim.readFailed");
  await engine.review("4");await engine.execute(account);
  assert.equal(reads,2);assert.equal(f.stored(),null);assert.equal(f.counts().sendCount,0);
  assert.equal(policy.deploymentAccountHeld(account.toUpperCase(),contract.toUpperCase()),false);
  assert.equal(policy.deploymentAccountHeld(a,contract),false);
  assert.equal(policy.deploymentAccountHeld(account,"0x"+"1".repeat(40)),false);
  const pending={version:1,account,contract,chainId:11155111,id:"3",createdAt:123};
  f.ports.storage.save(pending);await engine.review("4");await engine.execute(account);
  assert.equal(engine.getSnapshot()[account].phase,"unknown");assert.equal(f.stored(),pending);
  assert.equal(reads,2);assert.equal(f.counts().sendCount,0);
  f.session.stop();
});

test("shared pending callback fails closed at review and both execute checks with no reservation or send",async()=>{
  for(const key of ["actions.otherPending","actions.storageUnavailable"])for(const stage of ["review","execute","after-requote"]){
    const f=await fixture();let checks=0,quotes=0;
    const quote=f.ports.quote;f.ports.quote=async(...args)=>{quotes++;return quote(...args);};
    f.ports.assertNoOtherPending=async account=>{assert.equal(account,a);checks++;if(stage==="review"||stage==="execute"&&checks===2||stage==="after-requote"&&checks===3)throw Error(key);};
    try{
      await f.engine.review("2");await f.engine.execute(a);
      assert.equal(f.engine.getSnapshot()[a].phase,"error");assert.equal(f.engine.getSnapshot()[a].error,key);
      assert.equal(f.counts().sendCount,0);assert.equal(f.counts().receiptCount,0);assert.equal(f.stored(),null);
      assert.equal(quotes,stage==="review"?0:stage==="execute"?1:2);assert.equal(checks,stage==="review"?1:stage==="execute"?2:3);
    }finally{f.session.stop();}
  }
});

test("claim resume and hash recovery remain read-only with a corrupt foreign reservation",async()=>{
  const guard=load("src/lib/transaction-guard");
  for(const method of ["resume","recover"]){
    const f=await fixture(),foreignKey=guard.livePendingKeys(a).market,foreign=new Map([[foreignKey,"{unresolved-market"]]);let checks=0,verifies=0;
    f.ports.assertNoOtherPending=async account=>{checks++;guard.assertNoOtherLivePending(account,"claim",{getItem:key=>foreign.get(key)??null});};
    f.ports.verifyRecovery=async(record,candidate)=>{verifies++;assert.equal(record.id,"2");assert.equal(candidate,hash);};
    f.ports.quote=async()=>{assert.fail("Read-only recovery cannot quote a new claim");};
    f.ports.storage.save({version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123,...(method==="resume"?{hash}:{})});
    try{
      f.engine.restore(a);if(method==="resume")await f.engine.resume(a);else await f.engine.recover(a,hash);
      assert.equal(f.engine.getSnapshot()[a].phase,"completed");assert.equal(f.engine.getSnapshot()[a].evidence.hash,hash);
      assert.equal(checks,0);assert.equal(verifies,method==="recover"?1:0);assert.equal(f.counts().receiptCount,1);assert.equal(f.counts().sendCount,0);
      assert.equal(f.stored(),null);assert.equal(foreign.get(foreignKey),"{unresolved-market");
      assert.ok(!f.wallet.calls.some(method=>["eth_sendTransaction","eth_sign","personal_sign","eth_signTypedData_v4","wallet_sendCalls"].includes(method)));
    }finally{f.session.stop();}
  }
});

test("browserClaimPorts applies the foreign guard only to new-send checks, preserving storage and recovery locks",async()=>{
  const f=await receiptFixture(),ownKey=policy.claimPendingKey(a,contract),foreignKey=`vestora:market-pending:11155111:${contract.toLowerCase()}:${a}`;
  const entries=new Map([[ownKey,JSON.stringify(f.record)],[foreignKey,"foreign-corrupt"]]),locks=[];
  const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
  const adapter=loader({viem:{...realViem,createPublicClient:()=>f.rpc,createWalletClient:()=>{assert.fail("Recovery cannot create a signing client");}}},Date,
    {localStorage:storage,navigator:{locks:{request:async(key,options,fn)=>{locks.push({key,options});await fn({});}}}})("src/lib/claim-chain");
  const ports=adapter.browserClaimPorts(f.session,async()=>{});
  try{
    assert.throws(()=>ports.assertNoOtherPending(a),/actions.otherPending/);
    assert.equal(ports.storage.read(a).hash,hash);
    await ports.lock(a,async()=>{await ports.verifyRecovery(f.record,hash);});
    const evidence=await ports.receipt(f.record,()=>{assert.fail("No replacement expected");});assert.equal(evidence.amount,3066667n);
    assert.equal(locks.length,1);assert.equal(locks[0].key,`vestora:claim:${contract.toLowerCase()}:${a}`);assert.equal(locks[0].options.ifAvailable,true);
    assert.equal(entries.get(foreignKey),"foreign-corrupt");assert.equal(JSON.parse(entries.get(ownKey)).hash,hash);
  }finally{f.session.stop();}
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function fakeWallet(){
  const listeners=new Map();
  const provider={accounts:[a],chain:"0xaa36a7",calls:[],authorize:null,permissionRequest:null,revoke:null,permissions:[{parentCapability:"eth_accounts"}],requests:[],
    on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},
    removeListener:(name,fn)=>listeners.get(name)?.delete(fn),emit:(name,value)=>listeners.get(name)?.forEach(fn=>fn(value)),
    async request({method,params}){this.calls.push(method);this.requests.push({method,params});if(method==="eth_accounts")return this.accounts;if(method==="eth_chainId")return this.chain;if(method==="wallet_requestPermissions")return this.permissionRequest?this.permissionRequest():this.permissions;if(method==="eth_requestAccounts")return this.authorize?this.authorize():this.accounts;if(method==="wallet_revokePermissions"){if(this.revoke)return this.revoke();this.permissions=[];this.accounts=[];this.emit("accountsChanged",[]);return null;}if(method==="wallet_getPermissions")return this.permissions;if(method==="wallet_switchEthereumChain"){this.chain=params[0].chainId;this.emit("chainChanged",this.chain);return null;}throw Error(`Unexpected wallet method ${method}`);},
    listenerCount:()=>[...listeners.values()].reduce((sum,s)=>sum+s.size,0),
  };return provider;
}
async function fixture(){
  const wallet=fakeWallet(),session=createWalletSession(()=>wallet);session.start();await tick();
  let stored=null,sendCount=0,receiptCount=0,refreshCount=0;
  const ports={contract,session,now:()=>123,
    storage:{read:()=>stored,save:r=>{stored=r;},clear:()=>{stored=null;}},
    quote:async(token,id)=>({id,account:token.account,amount:400n,withdrawn:100n,block:120n,at:123n,token}),
    send:async()=>{sendCount++;return hash;},receipt:async()=>{receiptCount++;return {hash,block:121n,amount:410n,logIndex:2};},
    verifyRecovery:async()=>{},projected:async()=>true,refresh:async()=>{refreshCount++;},lock:async(_account,fn)=>fn(),
  };
  return{wallet,session,ports,engine:createClaimEngine(ports),stored:()=>stored,counts:()=>({sendCount,receiptCount,refreshCount})};
}

test("wallet account and chain events synchronously invalidate captured sessions",async()=>{
  const f=await fixture(),token=f.session.capture();f.wallet.accounts=[b];f.wallet.emit("accountsChanged",[b]);
  assert.equal(f.session.getSnapshot().address,b);await assert.rejects(()=>f.session.assertCurrent(token));await tick();
  f.wallet.chain="0x1";f.wallet.emit("chainChanged","0x1");assert.throws(()=>f.session.capture(),/claim.network/);
  await f.session.switchChain();assert.equal(f.session.capture().chainId,"0xaa36a7");
  f.session.stop();assert.equal(f.wallet.listenerCount(),0);
});
test("late injected provider attaches event listeners and rejection remains non-transactional",async()=>{
  let provider;const session=createWalletSession(()=>provider);session.start();await session.connect();assert.equal(session.getSnapshot().error,"live.noWallet");
  provider=fakeWallet();provider.authorize=async()=>{throw {code:4001};};await session.connect();assert.equal(session.getSnapshot().error,"live.walletRejected");
  provider.authorize=null;await session.connect();assert.equal(session.getSnapshot().address,a);assert.equal(provider.listenerCount(),3);session.stop();
});
test("disconnect during wallet permission does not reconnect from a late result",async()=>{
  const f=await fixture(),pending=deferred();f.session.disconnect();f.wallet.authorize=()=>pending.promise;
  const connecting=f.session.connect();f.session.disconnect();pending.resolve([a]);await connecting;assert.equal(f.session.getSnapshot().address,null);
  f.wallet.emit("accountsChanged",[a]);assert.equal(f.session.getSnapshot().address,null);f.session.stop();
});
test("silent account drift without an event also fails the execution guard",async()=>{
  const f=await fixture(),token=f.session.capture();f.wallet.accounts=[b];await assert.rejects(()=>f.session.assertCurrent(token),/sessionChanged/);f.session.stop();
});
test("a superseded wallet permission promise cannot erase a newer connection",async()=>{
  const f=await fixture(),old=deferred();f.session.disconnect();f.wallet.authorize=()=>old.promise;const first=f.session.connect();f.session.disconnect();f.wallet.authorize=null;await f.session.connect();old.resolve([b]);await first;assert.equal(f.session.getSnapshot().address,a);f.session.stop();
});
test("nested and cyclic wallet errors are classified without matching prose",()=>{
  assert.equal(walletRejected({cause:{code:4001}}),true);const e={message:"user rejected"};e.cause=e;assert.equal(walletRejected(e),false);
});

test("explicit disconnect revokes and verifies only this site's account permission",async()=>{
  const f=await fixture(),token=f.session.capture();await f.session.revokeConnection(a);
  assert.equal(f.session.getSnapshot().address,null);assert.equal(f.session.getSnapshot().disconnecting,false);
  assert.equal(f.wallet.calls.filter(method=>method==="wallet_revokePermissions").length,1);
  const request=f.wallet.requests.find(r=>r.method==="wallet_revokePermissions");assert.equal(JSON.stringify(request.params),JSON.stringify([{eth_accounts:{}}]));
  assert.ok(f.wallet.calls.includes("wallet_getPermissions"));assert.throws(()=>f.session.capture());await assert.rejects(()=>f.session.assertCurrent(token));
  f.wallet.emit("accountsChanged",[a]);await tick();assert.equal(f.session.getSnapshot().address,null);
  f.wallet.accounts=[a];f.wallet.permissions=[{parentCapability:"eth_accounts"}];await f.session.connect();assert.equal(f.session.getSnapshot().address,a);f.session.stop();
});

test("local watch-only detach never revokes wallet permission",async()=>{
  const f=await fixture();f.session.disconnect();assert.equal(f.session.getSnapshot().address,null);
  assert.equal(f.wallet.calls.includes("wallet_revokePermissions"),false);assert.equal(f.wallet.accounts[0],a);f.session.stop();
});

test("explicit connect requests account selection even when a cached grant already exists",async()=>{
  const f=await fixture();assert.equal(f.wallet.calls.includes("wallet_requestPermissions"),false);
  f.wallet.permissionRequest=async()=>{f.wallet.accounts=[b];return f.wallet.permissions;};
  await f.session.connect();assert.equal(f.session.getSnapshot().address,b);
  const request=f.wallet.requests.find(r=>r.method==="wallet_requestPermissions");
  assert.equal(JSON.stringify(request.params),JSON.stringify([{eth_accounts:{}}]));
  assert.ok(f.wallet.calls.indexOf("wallet_requestPermissions")<f.wallet.calls.indexOf("eth_requestAccounts"));
  assert.equal(f.wallet.calls.includes("wallet_revokePermissions"),false);f.session.stop();
});

test("account selection deduplicates requests and blocks quotes until selection settles",async()=>{
  const f=await fixture(),gate=deferred(),token=f.session.capture();f.wallet.permissionRequest=()=>gate.promise;
  const first=f.session.connect(),second=f.session.connect();assert.equal(first,second);
  assert.equal(f.session.getSnapshot().state,"connecting");assert.throws(()=>f.session.capture());await assert.rejects(()=>f.session.assertCurrent(token));
  f.wallet.accounts=[b];f.wallet.emit("accountsChanged",[b]);f.wallet.emit("chainChanged","0x1");
  assert.equal(f.session.getSnapshot().state,"connecting");assert.equal(f.session.getSnapshot().address,a);
  gate.resolve([{parentCapability:"eth_accounts"}]);await first;assert.equal(f.session.getSnapshot().address,b);
  assert.equal(f.wallet.calls.filter(method=>method==="wallet_requestPermissions").length,1);assert.equal(f.counts().sendCount,0);f.session.stop();
});

test("declining account selection never silently reconnects the previously permitted account",async()=>{
  for(const code of [4001,4100]){
    const f=await fixture();f.wallet.permissionRequest=async()=>{throw {code};};await f.session.connect();
    assert.equal(f.session.getSnapshot().address,null);assert.equal(f.session.getSnapshot().error,"live.walletRejected");
    assert.equal(f.wallet.calls.includes("eth_requestAccounts"),false);f.wallet.emit("accountsChanged",[a]);
    assert.equal(f.session.getSnapshot().address,null);assert.equal(f.counts().sendCount,0);f.session.stop();
  }
});

test("unsupported account selection has no silent cached-account fallback",async()=>{
  for(const code of [-32601,4200]){
    const f=await fixture();f.wallet.permissionRequest=async()=>{throw {cause:{code}};};await f.session.connect();
    assert.equal(f.session.getSnapshot().address,null);assert.equal(f.session.getSnapshot().error,"live.accountSelectionUnsupported");
    assert.equal(f.wallet.calls.includes("eth_requestAccounts"),false);f.session.stop();
  }
});

test("missing or malformed account permission never establishes a connection",async()=>{
  for(const value of [null,[],[null],[{parentCapability:"other"}]]){
    const f=await fixture();f.wallet.permissionRequest=async()=>value;await f.session.connect();
    assert.equal(f.session.getSnapshot().address,null);assert.equal(f.session.getSnapshot().error,"live.walletPermissionUnverified");
    assert.equal(f.wallet.calls.includes("eth_requestAccounts"),false);f.session.stop();
  }
});

test("a late account selection after local detach never requests accounts or reconnects",async()=>{
  const f=await fixture(),gate=deferred();f.wallet.permissionRequest=()=>gate.promise;
  const pending=f.session.connect();f.session.disconnect();gate.resolve([{parentCapability:"eth_accounts"}]);await pending;
  assert.equal(f.session.getSnapshot().address,null);assert.equal(f.wallet.calls.includes("eth_requestAccounts"),false);f.session.stop();
});

test("reselecting an account preserves unresolved reservations and never signs or sends",async()=>{
  const f=await fixture(),record={version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123,hash};f.ports.storage.save(record);
  f.wallet.permissionRequest=async()=>{f.wallet.accounts=[b];return f.wallet.permissions;};await f.session.connect();
  assert.equal(f.stored(),record);assert.equal(f.counts().sendCount,0);
  assert.equal(f.wallet.calls.some(method=>method.includes("sign")||method.includes("send")),false);f.session.stop();
});

test("revocation invalidates quotes immediately and shares duplicate requests",async()=>{
  const f=await fixture(),gate=deferred(),token=f.session.capture();
  f.wallet.revoke=async()=>{await gate.promise;f.wallet.accounts=[];f.wallet.permissions=[];return null;};
  const first=f.session.revokeConnection(a),second=f.session.revokeConnection(a);assert.equal(first,second);
  assert.equal(f.session.getSnapshot().disconnecting,true);assert.throws(()=>f.session.capture());await assert.rejects(()=>f.session.assertCurrent(token));
  const connects=f.wallet.calls.filter(c=>c==="eth_requestAccounts").length;const connecting=f.session.connect();await tick();assert.equal(f.wallet.calls.filter(c=>c==="eth_requestAccounts").length,connects);
  gate.resolve();await Promise.all([first,second,connecting]);assert.equal(f.wallet.calls.filter(c=>c==="wallet_revokePermissions").length,1);f.session.stop();
});

test("unsupported, rejected and failed revocations do not pretend disconnection",async()=>{
  for(const [error,key] of [[{code:-32601},"live.disconnectUnsupported"],[{cause:{code:4200}},"live.disconnectUnsupported"],[{code:4001},"live.disconnectRejected"],[Error("transport"),"live.disconnectFailed"]]){
    const f=await fixture(),token=f.session.capture();f.wallet.revoke=async()=>{throw error;};
    await assert.rejects(()=>f.session.revokeConnection(a),new RegExp(key));assert.equal(f.session.getSnapshot().address,a);assert.equal(f.session.getSnapshot().disconnecting,false);assert.equal(f.session.getSnapshot().error,key);
    await assert.rejects(()=>f.session.assertCurrent(token));assert.equal(f.counts().sendCount,0);f.session.stop();
  }
});

test("null revoke response alone is not proof when permission or accounts remain",async()=>{
  for(const mode of ["permission","accounts","malformed"]){
    const f=await fixture();f.wallet.revoke=async()=>{if(mode==="permission")f.wallet.accounts=[];else if(mode==="accounts")f.wallet.permissions=[];else f.wallet.permissions=[null];return null;};
    await assert.rejects(()=>f.session.revokeConnection(a),/live.disconnectUnverified/);assert.equal(f.session.getSnapshot().error,"live.disconnectUnverified");f.session.stop();
  }
});

test("verification failure after revocation is reported as unverified, not unsupported",async()=>{
  const f=await fixture(),request=f.wallet.request.bind(f.wallet);f.wallet.request=async args=>{if(args.method==="wallet_getPermissions")throw {code:-32601};return request(args);};
  await assert.rejects(()=>f.session.revokeConnection(a),/live.disconnectUnverified/);f.session.stop();
});

test("changed account or provider never revokes an unintended connection",async()=>{
  const f=await fixture();f.wallet.accounts=[b];await assert.rejects(()=>f.session.revokeConnection(a),/live.disconnectAccountChanged/);assert.equal(f.wallet.calls.includes("wallet_revokePermissions"),false);assert.equal(f.session.getSnapshot().address,b);f.session.stop();
  let provider=fakeWallet();const session=createWalletSession(()=>provider);session.start();await tick();provider=fakeWallet();await assert.rejects(()=>session.revokeConnection(a),/live.disconnectAccountChanged/);assert.equal(provider.calls.includes("wallet_revokePermissions"),false);session.stop();
});

test("late revocation cannot alter a replacement provider or a watch-only detach",async()=>{
  const old=fakeWallet(),gate=deferred();let provider=old;const session=createWalletSession(()=>provider);session.start();await tick();old.revoke=()=>gate.promise;
  const pending=session.revokeConnection(a);await tick();provider=fakeWallet();provider.accounts=[b];session.start();await tick();gate.resolve(null);await assert.rejects(()=>pending,/live.disconnectAccountChanged/);assert.equal(provider.accounts[0],b);assert.equal(provider.calls.includes("wallet_revokePermissions"),false);assert.equal(session.getSnapshot().address,null);await session.connect();assert.equal(session.getSnapshot().address,b);session.stop();
  const f=await fixture(),late=deferred();f.wallet.revoke=()=>late.promise;const action=f.session.revokeConnection(a);await tick();f.session.disconnect();late.resolve(null);await assert.rejects(()=>action,/live.disconnectAccountChanged/);assert.equal(f.session.getSnapshot().address,null);f.session.stop();
});

test("disconnect preserves unresolved transaction reservations and never sends",async()=>{
  const f=await fixture(),record={version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123,hash};f.ports.storage.save(record);
  await f.session.revokeConnection(a);assert.equal(f.stored(),record);assert.equal(f.counts().sendCount,0);assert.equal(f.wallet.calls.some(method=>method.includes("send")||method.includes("sign")),false);f.session.stop();
});
test("review is read-only and actual amount comes from the receipt",async()=>{
  const f=await fixture();await f.engine.review("2");assert.equal(f.engine.getSnapshot()[a].phase,"review");assert.equal(f.counts().sendCount,0);
  await f.engine.execute(a);assert.equal(f.counts().sendCount,1);assert.equal(f.engine.getSnapshot()[a].phase,"completed");assert.equal(f.engine.getSnapshot()[a].evidence.amount,410n);assert.equal(f.stored(),null);f.session.stop();
});
test("changed withdrawals, decreased amounts and ownership rejection never open a wallet",async()=>{
  for(const mutation of [q=>({...q,withdrawn:101n}),q=>({...q,amount:399n})]){
    const f=await fixture();await f.engine.review("2");const original=f.ports.quote;f.ports.quote=async(...args)=>mutation(await original(...args));await f.engine.execute(a);assert.equal(f.counts().sendCount,0);assert.equal(f.engine.getSnapshot()[a].error,"claim.conditionsChanged");f.session.stop();
  }
  const f=await fixture();f.ports.quote=async()=>{throw Error("claim.notOwner");};await f.engine.review("2");assert.equal(f.counts().sendCount,0);assert.equal(f.engine.getSnapshot()[a].error,"claim.notOwner");f.session.stop();
});
test("an account or network change after review blocks send",async()=>{
  const f=await fixture();await f.engine.review("2");f.wallet.chain="0x1";f.wallet.emit("chainChanged","0x1");await f.engine.execute(a);assert.equal(f.counts().sendCount,0);f.session.stop();
});
test("synchronous double clicks send only once",async()=>{
  const f=await fixture(),gate=deferred();f.ports.send=async()=>{f.ports.sendCalls=(f.ports.sendCalls||0)+1;return gate.promise;};await f.engine.review("2");
  const first=f.engine.execute(a),second=f.engine.execute(a);await tick();gate.resolve(hash);await Promise.all([first,second]);assert.equal(f.ports.sendCalls,1);f.session.stop();
});
test("another tab reservation blocks the new send",async()=>{
  const f=await fixture();await f.engine.review("2");f.ports.storage.save({version:1,account:a,contract,chainId:11155111,id:"1",createdAt:22,hash});await f.engine.execute(a);assert.equal(f.counts().sendCount,0);assert.equal(f.engine.getSnapshot()[a].id,"1");f.session.stop();
});
test("user rejection clears the reservation, ambiguous provider failure keeps it",async()=>{
  const f=await fixture();f.ports.send=async()=>{throw {code:4001};};await f.engine.review("2");await f.engine.execute(a);assert.equal(f.engine.getSnapshot()[a].phase,"rejected");assert.equal(f.stored(),null);
  f.ports.send=async()=>{throw Error("transport ended");};await f.engine.review("2");await f.engine.execute(a);assert.equal(f.engine.getSnapshot()[a].phase,"unknown");assert.ok(f.stored());assert.equal(f.stored().hash,undefined);
  await f.engine.review("2");assert.equal(f.engine.getSnapshot()[a].phase,"unknown");f.session.stop();
});
test("storage failure before the request sends nothing",async()=>{
  const f=await fixture();f.ports.storage.save=()=>{throw Error("claim.storageUnavailable");};await f.engine.review("2");await f.engine.execute(a);assert.equal(f.counts().sendCount,0);f.session.stop();
});
test("a final pre-submission session guard can safely release the reservation",async()=>{
  const f=await fixture();f.ports.send=async()=>{throw new policy.ClaimNotSubmitted("claim.sessionChanged");};await f.engine.review("2");await f.engine.execute(a);assert.equal(f.stored(),null);assert.equal(f.engine.getSnapshot()[a].phase,"error");f.session.stop();
});
test("receipt timeout retains the hash and a fresh engine resumes without resending",async()=>{
  const f=await fixture();f.ports.receipt=async()=>{throw Error("timeout");};await f.engine.review("2");await f.engine.execute(a);assert.equal(f.engine.getSnapshot()[a].phase,"unknown");assert.equal(f.stored().hash,hash);
  f.ports.receipt=async()=>({hash,block:121n,amount:410n,logIndex:2});const resumed=createClaimEngine(f.ports);resumed.restore(a);await resumed.resume(a);assert.equal(resumed.getSnapshot()[a].phase,"completed");assert.equal(f.counts().sendCount,1);f.session.stop();
});
test("on-chain success remains success-pending when API refresh fails",async()=>{
  const f=await fixture();f.ports.projected=async()=>{throw Error("API down");};await f.engine.review("2");await f.engine.execute(a);assert.equal(f.engine.getSnapshot()[a].phase,"indexing");assert.equal(f.engine.getSnapshot()[a].evidence.amount,410n);assert.ok(f.stored());
  f.ports.projected=async()=>true;f.ports.refresh=async()=>{throw Error("RPC down");};await f.engine.resume(a);assert.equal(f.engine.getSnapshot()[a].phase,"completed");assert.equal(f.engine.getSnapshot()[a].warning,"claim.refreshWarning");assert.equal(f.counts().sendCount,1);f.session.stop();
});
test("a receipt already verified in memory is not downgraded by a later RPC outage",async()=>{
  const f=await fixture();f.ports.projected=async()=>false;await f.engine.review("2");await f.engine.execute(a);f.ports.receipt=async()=>{throw Error("RPC down");};await f.engine.resume(a);assert.equal(f.engine.getSnapshot()[a].phase,"indexing");assert.equal(f.engine.getSnapshot()[a].evidence.amount,410n);f.session.stop();
});
test("repricing follows the new hash; non-claim replacements and reverts are not success",async()=>{
  const f=await fixture();f.ports.receipt=async(_r,replace)=>{replace(hash2);return {hash:hash2,block:122n,amount:410n,logIndex:3};};await f.engine.review("2");await f.engine.execute(a);assert.equal(f.engine.getSnapshot()[a].evidence.hash,hash2);
  for(const phase of ["reverted","replaced"]){f.ports.receipt=async()=>phase;await f.engine.review("2");await f.engine.execute(a);assert.equal(f.engine.getSnapshot()[a].phase,phase);assert.equal(f.stored(),null);}f.session.stop();
});
test("stored receipt claims are reverified after reload",async()=>{
  const f=await fixture();f.ports.storage.save({version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123,hash,evidence:{block:"121",amount:"410",logIndex:2}});
  f.ports.receipt=async()=>"replaced";f.engine.restore(a);await f.engine.resume(a);assert.equal(f.engine.getSnapshot()[a].phase,"replaced");f.session.stop();
});
test("recovery mismatch preserves the unresolved reservation",async()=>{
  const f=await fixture();f.ports.storage.save({version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123});f.engine.restore(a);f.ports.verifyRecovery=async()=>{throw Error("claim.recoveryMismatch");};await f.engine.recover(a,hash);assert.equal(f.engine.getSnapshot()[a].phase,"unknown");assert.equal(f.stored().hash,undefined);f.session.stop();
});
test("projection proof requires the applied block AND the exact claim event",()=>{
  const e={hash,block:121n,amount:410n,logIndex:2},rows=[{transactionHash:hash,recipient:a,streamId:"2",amount:"410",logIndex:2}];
  assert.equal(policy.projectionHasClaim("120",e,rows,a,"2"),false);assert.equal(policy.projectionHasClaim("121",e,rows,a,"2"),true);assert.equal(policy.projectionHasClaim("122",e,[{...rows[0],recipient:b}],a,"2"),false);
});
test("pending decoder isolates account, contract, chain and malformed state",()=>{
  const record={version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123,hash};assert.equal(policy.decodeClaimPending(JSON.stringify(record),a,contract).hash,hash);
  for(const changed of [{...record,account:b},{...record,chainId:1},{...record,hash:"bad"},{...record,id:"-1"},{...record,id:2}])assert.throws(()=>policy.decodeClaimPending(JSON.stringify(changed),a,contract));
});
test("all literal and phase translation keys for claim UI exist",()=>{
  const locale=JSON.parse(readFileSync(resolve(root,"public/locales/ko.json"),"utf8"));
  const walk=path=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(path,e.name)):[resolve(path,e.name)]);
  for(const file of walk(resolve(root,"src")).filter(p=>/\.(ts|tsx)$/.test(p)))for(const match of readFileSync(file,"utf8").matchAll(/["']((?:claim|live)\.[\w.-]+)["']/g))assert.ok(match[1] in locale,`${file}: ${match[1]}`);
  for(const phase of ["idle","preparing","review","wallet","submitted","indexing","completed","rejected","reverted","replaced","unknown","error"]){assert.ok(`claim.phase.${phase}` in locale);assert.ok(`claim.body.${phase}` in locale);}
});

test("viem adapter pins reads and rejects wrong owner, zero claim and unsupported token",async()=>{
  let owner=a,amount=400n,token=usdc;const calls=[];
  const rpc={getChainId:async()=>11155111,getBlock:async()=>({number:120n,timestamp:123n}),getBalance:async()=>10n**18n,estimateFeesPerGas:async()=>({maxFeePerGas:2n,maxPriorityFeePerGas:1n}),estimateContractGas:async()=>21_000n,
    readContract:async args=>{calls.push(args);return args.functionName==="ownerOf"?owner:args.functionName==="getStream"?{token,withdrawnAmount:100n}:amount;},simulateContract:async()=>({result:amount})};
  const adapter=loader({viem:{...realViem,createPublicClient:()=>rpc}})("src/lib/claim-chain");const f=await fixture(),walletToken=f.session.capture();
  const quote=await adapter.readClaimQuote(walletToken,"2");assert.equal(quote.amount,400n);assert.ok(calls.every(c=>c.blockNumber===120n));
  owner=b;await assert.rejects(()=>adapter.readClaimQuote(walletToken,"2"),/notOwner/);owner=a;amount=0n;await assert.rejects(()=>adapter.readClaimQuote(walletToken,"2"),/nothing/);amount=400n;token=b;await assert.rejects(()=>adapter.readClaimQuote(walletToken,"2"),/tokenUnsupported/);f.session.stop();
});
test("receipt adapter only accepts matching contract events and request identity",async()=>{
  let input,from=a;const topics=realViem.encodeEventTopics({abi:realViem.parseAbi(["event StreamClaimed(uint256 indexed streamId,address indexed recipient,uint256 amount)"]),eventName:"StreamClaimed",args:{streamId:2n,recipient:a}});
  const rpc={getChainId:async()=>11155111,getTransaction:async()=>({from,to:contract,input,value:0n,chainId:11155111}),waitForTransactionReceipt:async()=>({status:"success",transactionHash:hash,blockNumber:121n,logs:[{address:contract,topics,data:realViem.encodeAbiParameters([{type:"uint256"}],[410n]),logIndex:2}]})};
  const adapter=loader({viem:{...realViem,createPublicClient:()=>rpc}})("src/lib/claim-chain"),f=await fixture();input=realViem.encodeFunctionData({abi:adapter.claimAbi,functionName:"claim",args:[2n]});
  const ports=adapter.browserClaimPorts(f.session,async()=>{}),record={version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123,hash};
  assert.equal((await ports.receipt(record,()=>{})).amount,410n);from=b;assert.equal(await ports.receipt(record,()=>{}),"replaced");await assert.rejects(()=>ports.verifyRecovery(record,hash),/recoveryMismatch/);f.session.stop();
});

async function receiptFixture(){
  const f=await fixture();
  const eventAbi=realViem.parseAbi(["event StreamClaimed(uint256 indexed streamId,address indexed recipient,uint256 amount)"]);
  const log={address:contract,topics:realViem.encodeEventTopics({abi:eventAbi,eventName:"StreamClaimed",args:{streamId:2n,recipient:a}}),data:realViem.encodeAbiParameters([{type:"uint256"}],[3066667n]),logIndex:138};
  const tx={from:a,to:"0xdb9b1e94b5b69df7e401ddbede43491141047db3",input:"0xcef6d209",value:0n,chainId:11155111};
  const receipt={status:"success",transactionHash:hash,blockNumber:11953647n,logs:[log]};
  const rpc={getChainId:async()=>11155111,getTransaction:async()=>tx,getTransactionReceipt:async()=>receipt,waitForTransactionReceipt:async()=>receipt};
  const adapter=loader({viem:{...realViem,createPublicClient:()=>rpc}})("src/lib/claim-chain");
  return{...f,eventAbi,log,tx,receipt,rpc,adapter,ports:adapter.browserClaimPorts(f.session,async()=>{}),record:{version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123,hash}};
}
test("wallet-wrapped claim succeeds from the exact deployed-contract event without a router allowlist",async()=>{
  const f=await receiptFixture();let sends=0;f.wallet.request=async()=>{sends++;throw Error("No wallet requests during receipt recovery");};
  const evidence=await f.ports.receipt(f.record,()=>{});assert.equal(evidence.amount,3066667n);assert.equal(evidence.logIndex,138);
  await f.ports.verifyRecovery(f.record,hash);assert.equal(sends,0);f.session.stop();
});
test("wrapped claim cannot bypass sender, chain, value or configured deployment checks",async()=>{
  for(const change of [{from:b},{chainId:1},{value:1n},{to:null}]){
    const f=await receiptFixture();Object.assign(f.tx,change);assert.equal(await f.ports.receipt(f.record,()=>{}),"replaced");await assert.rejects(()=>f.ports.verifyRecovery(f.record,hash),/recoveryMismatch/);f.session.stop();
  }
  const f=await receiptFixture();assert.equal(await f.ports.receipt({...f.record,contract:b},()=>{}),"replaced");f.session.stop();
});
test("wrapped receipt requires one positive event for the correct contract, stream and recipient",async()=>{
  for(const change of [{address:b},{data:realViem.encodeAbiParameters([{type:"uint256"}],[0n])},{removed:true},{logIndex:-1},{topics:["0x00"]},
    {topics:realViem.encodeEventTopics({abi:realViem.parseAbi(["event StreamClaimed(uint256 indexed streamId,address indexed recipient,uint256 amount)"]),eventName:"StreamClaimed",args:{streamId:1n,recipient:a}})},
    {topics:realViem.encodeEventTopics({abi:realViem.parseAbi(["event StreamClaimed(uint256 indexed streamId,address indexed recipient,uint256 amount)"]),eventName:"StreamClaimed",args:{streamId:2n,recipient:b}})}]){
    const f=await receiptFixture();Object.assign(f.log,change);await assert.rejects(()=>f.ports.receipt(f.record,()=>{}),/receiptUnavailable/);await assert.rejects(()=>f.ports.verifyRecovery(f.record,hash),/recoveryMismatch/);f.session.stop();
  }
});
test("missing or duplicate claim events are not inferred from the quote or wrapper calldata",async()=>{
  const f=await receiptFixture();f.receipt.logs=[];await assert.rejects(()=>f.ports.receipt(f.record,()=>{}),/receiptUnavailable/);
  f.receipt.logs=[f.log,{...f.log,logIndex:139}];await assert.rejects(()=>f.ports.receipt(f.record,()=>{}),/receiptUnavailable/);
  f.receipt.logs=[{...f.log,address:b},f.log];assert.equal((await f.ports.receipt(f.record,()=>{})).amount,3066667n);f.session.stop();
});
test("direct calls still require the exact claim input and successful recovery requires a mined receipt",async()=>{
  const f=await receiptFixture();f.tx.to=contract;f.tx.input=realViem.encodeFunctionData({abi:f.adapter.claimAbi,functionName:"claim",args:[1n]});assert.equal(await f.ports.receipt(f.record,()=>{}),"replaced");
  f.tx.input=realViem.encodeFunctionData({abi:f.adapter.claimAbi,functionName:"claim",args:[2n]});assert.equal((await f.ports.receipt(f.record,()=>{})).amount,3066667n);
  f.receipt.status="reverted";assert.equal(await f.ports.receipt(f.record,()=>{}),"reverted");await assert.rejects(()=>f.ports.verifyRecovery(f.record,hash),/recoveryMismatch/);
  f.receipt.status="success";f.receipt.transactionHash=hash2;await assert.rejects(()=>f.ports.verifyRecovery(f.record,hash),/recoveryMismatch/);f.session.stop();
});
test("a previously misclassified claim can be reconciled by hash without any send or quote",async()=>{
  const f=await fixture();f.ports.quote=async()=>{throw Error("No quote for already completed claims");};let verified=0;
  f.ports.verifyRecovery=async(record,candidate)=>{verified++;assert.equal(record.id,"2");assert.equal(candidate,hash);};
  await f.engine.reconcile("2",hash);assert.equal(verified,1);assert.equal(f.counts().sendCount,0);assert.equal(f.engine.getSnapshot()[a].phase,"completed");assert.equal(f.stored(),null);f.session.stop();
});
test("hash reconciliation refuses an unrelated receipt and never replaces another pending claim",async()=>{
  const f=await fixture();f.ports.verifyRecovery=async()=>{throw Error("claim.recoveryMismatch");};await f.engine.reconcile("2",hash);assert.equal(f.engine.getSnapshot()[a].phase,"error");assert.equal(f.stored(),null);
  f.ports.storage.save({version:1,account:a,contract,chainId:11155111,id:"1",createdAt:22,hash:hash2});await f.engine.reconcile("2",hash);assert.equal(f.engine.getSnapshot()[a].id,"1");assert.equal(f.stored().hash,hash2);assert.equal(f.counts().sendCount,0);f.session.stop();
});
test("hash reconciliation serializes duplicate checks and obeys the cross-tab lock",async()=>{
  const f=await fixture(),gate=deferred();let verifies=0;f.ports.verifyRecovery=async()=>{verifies++;await gate.promise;};
  const first=f.engine.reconcile("2",hash),second=f.engine.reconcile("2",hash);await tick();gate.resolve();await Promise.all([first,second]);assert.equal(verifies,1);assert.equal(f.counts().sendCount,0);
  f.ports.lock=async()=>{throw Error("claim.tabBusy");};await f.engine.reconcile("2",hash);assert.equal(f.engine.getSnapshot()[a].error,"claim.tabBusy");assert.equal(f.stored(),null);f.session.stop();
});
test("send adapter fixes the chain, contract, account, function and disables transport retry",async()=>{
  const f=await fixture();let sent;
  const adapter=loader({viem:{...realViem,
    createPublicClient:()=>({}),custom:(provider,options)=>{assert.equal(provider,f.wallet);assert.equal(options.retryCount,0);return {};},
    createWalletClient:options=>{assert.equal(options.chain.id,11155111);assert.equal(options.account,a);return{writeContract:async args=>{sent=args;return hash;}};},
  }})("src/lib/claim-chain");
  const ports=adapter.browserClaimPorts(f.session,async()=>{}),quote=await f.ports.quote(f.session.capture(),"2");
  assert.equal(await ports.send(quote),hash);assert.equal(sent.address,contract);assert.equal(sent.functionName,"claim");assert.equal(sent.args[0],2n);assert.equal(sent.account,a);assert.equal(sent.chain.id,11155111);
  f.wallet.accounts=[b];f.wallet.emit("accountsChanged",[b]);sent=null;await assert.rejects(()=>ports.send(quote),/sessionChanged/);assert.equal(sent,null);f.session.stop();
});

test("B27 applied receipt-1,equal,+1 needs the exact event at every eligible block",()=>{
  const e={hash,block:121n,amount:410n,logIndex:2},claim={transactionHash:hash,recipient:a,streamId:"2",amount:"410",logIndex:2};
  for(const [block,expected] of [["120",false],["121",true],["122",true]]){
    assert.equal(policy.projectionHasClaim(block,e,[claim],a,"2"),expected);
    for(const patch of [{transactionHash:hash2},{recipient:b},{streamId:"3"},{amount:"411"},{logIndex:3}])assert.equal(policy.projectionHasClaim(block,e,[{...claim,...patch}],a,"2"),false);
  }
});

test("B28 the actual snapshot hook is fresh at 119999 and 120000ms, stale at 120001ms",()=>{
  for(const [age,expected] of [[119999,"normal"],[120000,"normal"],[120001,"stale"]]){
    const clock=class extends Date{static now(){return age;}};
    const data={claims:[],listings:[],history:[],balance:{balances:[],gasRaw:0n},unsupported:0,now:new Date(0),projection:{projectionStatus:"applied",latestProjectedBlock:"100",latestIndexedBlock:"100",status:"synced"}};
    const hook=loader({...snapshotActionHookStubs,react:{useState:()=>[null,()=>{}]},"@tanstack/react-query":{useQuery:()=>({data,isPending:false,isError:false,isFetching:false,refetch:async()=>({data})})},
      "./use-injected-wallet":{useInjectedWallet:()=>({address:null,session:{}})},"./use-claim-transaction":{useClaimTransaction:()=>({})},"./use-create-payment":{useCreatePayment:()=>({})},
      "@/lib/live-api":{},"@/lib/live-config":{LIVE_API_BASE:"http://fixture.invalid"},"@/lib/live-mapping":{},"@/lib/live-chain":{},
    },clock)("src/hooks/use-live-snapshot");
    assert.equal(hook.useLiveSnapshot().scenario.dataCondition,expected);
  }
});

test("QA05 pre-wallet storage failure is an error, never an ambiguous broadcast",async()=>{
  const f=await fixture();await f.engine.review("2");f.ports.storage.save=()=>{throw Error("claim.storageUnavailable");};
  await f.engine.execute(a);const s=f.engine.getSnapshot()[a];assert.equal(s.phase,"error");assert.equal(s.error,"claim.storageUnavailable");assert.equal(s.pending,undefined);assert.equal(f.counts().sendCount,0);f.session.stop();
});

test("maximum fee preflight uses maxFeePerGas, including exact balance boundaries",async()=>{
  const safety=load("src/lib/transaction-safety");
  assert.throws(()=>safety.gasEstimate(21000n,{maxFeePerGas:10n,maxPriorityFeePerGas:1n},209999n),/gasInsufficient/);
  for(const balance of [210000n,210001n])assert.equal(safety.gasEstimate(21000n,{maxFeePerGas:10n,maxPriorityFeePerGas:1n},balance).maximumCost,210000n);
  for(const [limit,max,priority] of [[0n,1n,1n],[1n,-1n,0n],[1n,0n,0n],[1n,1n,2n]])assert.throws(()=>safety.gasEstimate(limit,{maxFeePerGas:max,maxPriorityFeePerGas:priority},100n),/gasEstimateUnavailable/);
});

test("direct RPC estimates never imply a wallet cap or silently apply a fee floor",()=>{
  const safety=load("src/lib/transaction-safety");
  const q=safety.gasEstimate(50000n,{maxFeePerGas:17n,maxPriorityFeePerGas:0n},850000n);
  assert.equal(q.scope,"public-rpc-direct");assert.equal(q.maximumCost,850000n);assert.equal(q.maxFeePerGas,17n);
  assert.equal(q.walletMaximumCost,undefined);
  assert.throws(()=>safety.gasEstimate(1n,{maxFeePerGas:1n,maxPriorityFeePerGas:0n},-1n),/gasEstimateUnavailable/);
});

test("claim adapter blocks an unaffordable max fee before any send and requotes fees",async()=>{
  let balance=209999n,max=10n;
  const rpc={getChainId:async()=>11155111,getBlock:async()=>({number:120n,timestamp:123n}),getBalance:async()=>balance,estimateContractGas:async()=>21000n,
    estimateFeesPerGas:async args=>{assert.equal(args.type,"eip1559");return{maxFeePerGas:max,maxPriorityFeePerGas:1n};},
    readContract:async q=>q.functionName==="ownerOf"?a:q.functionName==="getStream"?{token:usdc,withdrawnAmount:0n}:400n,simulateContract:async()=>({result:400n})};
  const adapter=loader({viem:{...realViem,createPublicClient:()=>rpc}})("src/lib/claim-chain"),f=await fixture();
  f.ports.quote=adapter.readClaimQuote;
  await f.engine.review("2");assert.equal(f.engine.getSnapshot()[a].error,"claim.gasInsufficient");assert.equal(f.counts().sendCount,0);
  balance=210000n;await f.engine.review("2");assert.equal(f.engine.getSnapshot()[a].quote.gasEstimate.maximumCost,210000n);
  max=11n;await f.engine.execute(a);assert.equal(f.engine.getSnapshot()[a].error,"claim.gasInsufficient");assert.equal(f.counts().sendCount,0);assert.equal(f.stored(),null);f.session.stop();
});

test("gas-like wallet errors remain unknown, with redacted diagnostics after reload",async()=>{
  const f=await fixture(),cause=new realViem.InsufficientFundsError({});
  f.ports.send=async()=>{throw {code:-32603,cause,message:"secret RPC URL must not persist",stack:"private stack"};};
  await f.engine.review("2");await f.engine.execute(a);
  assert.equal(f.engine.getSnapshot()[a].phase,"unknown");assert.equal(f.engine.getSnapshot()[a].error,"claim.walletGasUnresolved");
  assert.equal(f.stored().failure.reason,"insufficient-funds");assert.equal(f.stored().failure.code,-32603);
  assert.doesNotMatch(JSON.stringify(f.stored()),/secret|private|stack|RPC URL/);
  const engine=createClaimEngine(f.ports);engine.restore(a);await engine.resume(a);await engine.review("2");
  assert.equal(engine.getSnapshot()[a].error,"claim.walletGasUnresolved");assert.equal(engine.getSnapshot()[a].phase,"unknown");assert.equal(f.counts().sendCount,0);f.session.stop();
});

test("generic provider codes and prose never prove non-submission",async()=>{
  for(const error of [{code:-32000,message:"insufficient funds"},{code:-32603},{code:4900}]){
    const f=await fixture();f.ports.send=async()=>{throw error;};await f.engine.review("2");await f.engine.execute(a);
    assert.equal(f.engine.getSnapshot()[a].phase,"unknown");assert.equal(f.stored().failure.reason,"provider-response");
    assert.equal(f.engine.getSnapshot()[a].error,"claim.walletResponseUnknown");f.session.stop();
  }
  const cycle={code:-32603};cycle.cause=cycle;assert.equal(load("src/lib/transaction-safety").submissionFailure(cycle,123).code,-32603);
});

test("legacy claim reservations are not rewritten or released by restoring or reviewing",async()=>{
  const f=await fixture(),old={version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123};
  f.ports.storage.save(old);f.engine.restore(a);await f.engine.resume(a);await f.engine.review("2");
  assert.equal(f.stored(),old);assert.equal(f.stored().failure,undefined);assert.equal(f.engine.getSnapshot()[a].phase,"unknown");assert.equal(f.counts().sendCount,0);
  for(const failure of [{stage:"wallet",reason:"retry",at:1},{stage:"wallet",reason:"provider-response",at:-1},{stage:"wallet",reason:"provider-response",at:1,code:"4001"}])assert.throws(()=>policy.decodeClaimPending(JSON.stringify({...old,failure}),a,contract),/pendingCorrupt/);
  f.session.stop();
});

test("diagnostic persistence failure preserves the reservation and never resends",async()=>{
  const f=await fixture();let saves=0;const save=f.ports.storage.save;
  f.ports.storage.save=r=>{if(++saves>1)throw Error("full");save(r);};f.ports.send=async()=>{throw Error("lost");};
  await f.engine.review("2");await f.engine.execute(a);assert.equal(f.engine.getSnapshot()[a].phase,"unknown");assert.equal(f.engine.getSnapshot()[a].warning,"claim.storageWarning");
  assert.ok(f.stored());assert.equal(f.stored().failure,undefined);assert.equal(f.counts().sendCount,0);f.session.stop();
});

test("late claim diagnostic cannot overwrite a hash recovered by another tab",async()=>{
  const f=await fixture();f.ports.send=async()=>{const r=f.stored();f.ports.storage.save({...r,hash:hash2});throw Error("lost");};
  await f.engine.review("2");await f.engine.execute(a);assert.equal(f.stored().hash,hash2);assert.equal(f.stored().failure,undefined);assert.equal(f.engine.getSnapshot()[a].warning,"claim.storageWarning");f.session.stop();
});

test("claim hash recovery takes the same lock as submission and diagnostics",async()=>{
  const f=await fixture(),record={version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123};let verified=0;
  f.ports.storage.save(record);f.engine.restore(a);f.ports.lock=async()=>{throw Error("claim.tabBusy");};f.ports.verifyRecovery=async()=>{verified++;};
  await f.engine.recover(a,hash);assert.equal(verified,0);assert.equal(f.stored(),record);assert.equal(f.engine.getSnapshot()[a].phase,"unknown");
  f.ports.lock=async(_a,fn)=>fn();f.ports.projected=async()=>false;await f.engine.recover(a,hash);
  assert.equal(verified,1);assert.equal(f.stored().hash,hash);assert.equal(f.engine.getSnapshot()[a].phase,"indexing");assert.equal(f.counts().sendCount,0);f.session.stop();
});

test("claim recovery rechecks the reservation and captured account after verification",async()=>{
  for(const change of ["record","account"]){
    const f=await fixture(),record={version:1,account:a,contract,chainId:11155111,id:"2",createdAt:123};f.ports.storage.save(record);f.engine.restore(a);
    f.ports.verifyRecovery=async()=>{if(change==="record")f.ports.storage.save({...record,hash:hash2});else{f.wallet.accounts=[b];f.wallet.emit("accountsChanged",[b]);}};
    await f.engine.recover(a,hash);assert.equal(f.engine.getSnapshot()[a].phase,"unknown");assert.equal(f.stored().hash,change==="record"?hash2:undefined);assert.equal(f.counts().receiptCount,0);f.session.stop();
  }
});
