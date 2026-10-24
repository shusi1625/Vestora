import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {test} from "node:test";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";

const root=resolve(import.meta.dirname,".."),account="0x1111111111111111111111111111111111111111",other="0x2222222222222222222222222222222222222222";
const viem=createRequire(import.meta.url)("viem");
const config={LIVE_STREAM:"0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",LIVE_USDC:"0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9"};
function fixture(){
  const data=new Map(),storage={getItem:key=>data.has(key)?data.get(key):null};let locked=false;const lockNames=[];
  const navigator={locks:{request:async(name,_options,fn)=>{lockNames.push(name);if(locked)return fn(null);locked=true;try{return await fn({});}finally{locked=false;}}}};
  const cache=new Map();
  function load(file){
    const path=resolve(root,file.endsWith(".ts")?file:`${file}.ts`);if(cache.has(path))return cache.get(path);
    const module={exports:{}};cache.set(path,module.exports);
    const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Error,BigInt,Date,console,navigator,localStorage:storage})
      (id=>id==="viem"?viem:id==="./live-config"?config:load(resolve(dirname(path),id)),module,module.exports);
    return module.exports;
  }
  return{guard:load("src/lib/transaction-guard"),data,storage,navigator,lockNames};
}

test("every foreign operation reservation blocks without changing stored bytes",()=>{
  const f=fixture(),keys=f.guard.livePendingKeys(account);
  for(const operation of Object.keys(keys))for(const foreign of Object.keys(keys)){
    f.data.clear();f.data.set(keys[foreign],"{malformed reservation");
    if(operation===foreign)f.guard.assertNoOtherLivePending(account,operation);
    else assert.throws(()=>f.guard.assertNoOtherLivePending(account,operation),/actions.otherPending/);
    assert.equal(f.data.get(keys[foreign]),"{malformed reservation");
  }
});

test("an empty foreign value is not treated as no reservation and other accounts stay isolated",()=>{
  const f=fixture(),keys=f.guard.livePendingKeys(account);f.data.set(keys.mint,"");
  assert.throws(()=>f.guard.assertNoOtherLivePending(account,"claim"),/otherPending/);
  f.guard.assertNoOtherLivePending(other,"claim");
  assert.deepEqual(JSON.stringify(f.guard.livePendingKeys(account.toUpperCase())),JSON.stringify(keys));
});

test("explicit B reuse keeps storage failures and foreign reservations fail closed",()=>{
  const f=fixture();assert.throws(()=>f.guard.assertNoOtherLivePending(account,"mint",{getItem(){throw Error("denied");}}),/storageUnavailable/);
  const reused="0xbf9bf852225899b667aa4c73bb082e830abb9de1",keys=f.guard.livePendingKeys(reused);
  for(const operation of ["claim","create","market","cancel","mint"]){
    f.data.clear();f.guard.assertNoOtherLivePending(reused,operation);
    assert.throws(()=>f.guard.assertNoOtherLivePending(reused,operation,{getItem(){throw Error("denied");}}),/storageUnavailable/);
    for(const foreign of Object.keys(keys).filter(kind=>kind!==operation)){
      f.data.clear();const bytes="{legacy unresolved "+foreign;f.data.set(keys[foreign],bytes);
      assert.throws(()=>f.guard.assertNoOtherLivePending(reused,operation),/otherPending/);
      assert.equal(f.data.get(keys[foreign]),bytes);
    }
  }
  assert.throws(()=>f.guard.livePendingKeys("bad"),/sessionChanged/);
});

test("all operation kinds use the same existing account lock and prevent overlapping sends",async()=>{
  const f=fixture();let release;const gate=new Promise(resolve=>release=resolve);let count=0;
  const first=f.guard.withLiveTransactionLock(account,"market",async()=>{count++;await gate;});
  await assert.rejects(()=>f.guard.withLiveTransactionLock(account,"cancel",async()=>{count++;}),/tabBusy/);
  release();await first;assert.equal(count,1);
  assert.equal(f.lockNames[0],`vestora:claim:${config.LIVE_STREAM.toLowerCase()}:${account}`);assert.equal(f.lockNames[0],f.lockNames[1]);
});

test("foreign reservation is checked inside the lock and missing lock support prevents execution",async()=>{
  const f=fixture();f.data.set(f.guard.livePendingKeys(account).create,"pending");let calls=0;
  await assert.rejects(()=>f.guard.withLiveTransactionLock(account,"mint",async()=>{calls++;}),/otherPending/);
  f.navigator.locks=undefined;await assert.rejects(()=>f.guard.withLiveTransactionLock(account,"market",async()=>{calls++;}),/lockUnavailable/);assert.equal(calls,0);
});

test("read-only recovery may take the same lock without treating another pending as a new send",async()=>{
  const f=fixture();f.data.set(f.guard.livePendingKeys(account).market,"unresolved");let recovered=0;
  await f.guard.withLiveTransactionLock(account,"claim",async()=>{recovered++;},{checkPending:false});
  assert.equal(recovered,1);assert.equal(f.data.get(f.guard.livePendingKeys(account).market),"unresolved");
});
