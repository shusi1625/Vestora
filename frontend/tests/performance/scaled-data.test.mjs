import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {scaledCount,scaledStream,fixtureApiCap} from "../manual-qa/scaled-data.mjs";

test("scaled fixture sizes, ids and request caps remain bounded",()=>{
  for(const count of [10,100,1000]){
    const mode=`P01-${count}`;assert.equal(scaledCount(mode),count);assert.ok(fixtureApiCap(mode)<=22000);
    assert.equal(scaledStream(mode,2000000000n,"2"),null);assert.equal(scaledStream(mode,2000000000n,String(count+3)),null);
    assert.equal(scaledStream(mode,2000000000n,"3").streamId,"3");assert.equal(scaledStream(mode,2000000000n,String(count+2)).streamId,String(count+2));
  }
  assert.equal(scaledCount("P01-1000000"),0);assert.equal(fixtureApiCap("normal"),500);assert.equal(fixtureApiCap("P02-harness"),1500);
});
test("scaled fixture preserves raw accounting, all three phases and unique identities",()=>{
  const at=2000000000n,rows=Array.from({length:1000},(_,i)=>scaledStream("P01-1000",at,String(i+3)));
  assert.equal(new Set(rows.map(r=>r.streamId)).size,1000);assert.equal(new Set(rows.map(r=>r.createdTxHash)).size,1000);
  const states=new Set();for(const row of rows){
    const d=BigInt(row.depositedAmount),v=BigInt(row.computed.vestedAmount);assert.ok(v>=0n&&v<=d);assert.equal(row.computed.remainingReceivable,String(d));assert.equal(row.computed.claimableEstimate,String(v));assert.equal(row.claims.length,0);
    assert.ok(BigInt(row.listing.price)<d);states.add(v===0n?"scheduled":v===d?"completed":"streaming");
  }assert.deepEqual([...states].sort(),["completed","scheduled","streaming"]);
  const source=readFileSync(new URL("../manual-qa/scaled-data.mjs",import.meta.url),"utf8");assert.doesNotMatch(source,/fetch\(|https?:\/\/|createWalletClient|sendTransaction/);
});
