import {test} from "node:test";
import assert from "node:assert/strict";
import {decodePending,pendingKey,savePending,readPending,clearPending} from "../lib/pending-transaction.ts";
const account="0x"+"1".repeat(40),contract="0x"+"2".repeat(40),hash="0x"+"a".repeat(64);
const record={version:1,account,chainId:11155111,hash,label:"Claim Stream",streamId:"2"};
test("pending record validation rejects wrong account, chain, hash and malformed data",()=>{
 assert.deepEqual(decodePending(JSON.stringify(record),account),record);
 for(const value of [null,"broken",JSON.stringify(null),...[
  {chainId:1},{account:contract},{hash:"0x123"},{streamId:"-1"},{label:""},{version:2}
 ].map(change=>JSON.stringify({...record,...change}))])assert.equal(decodePending(value,account),null);
 assert.notEqual(pendingKey(account,contract),pendingKey(contract,contract));
 assert.notEqual(pendingKey(account,contract),pendingKey(account,account));
});
test("saved hash survives reload and an older receipt cannot clear a newer pending transaction",()=>{
 const data=new Map();globalThis.window={localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
 try{
  const key=pendingKey(account,contract);
  assert.equal(savePending(key,record),true);
  assert.deepEqual(readPending(key,account),record);
  clearPending(key,account,"0x"+"b".repeat(64));assert.deepEqual(readPending(key,account),record);
  clearPending(key,account,hash);assert.equal(readPending(key,account),null);
 }finally{delete globalThis.window;}
});
test("unavailable browser storage reports persistence failure without crashing",()=>{
 assert.equal(savePending(pendingKey(account,contract),record),false);
 assert.equal(readPending(pendingKey(account,contract),account),null);
});
