import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";
const root=resolve(import.meta.dirname,".."),require=createRequire(import.meta.url),cache=new Map();
const usdc="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9",a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222",hash="0x"+"a".repeat(64);
let fetchImpl;
function load(file){
  const path=resolve(root,file.endsWith(".ts")?file:`${file}.ts`);if(cache.has(path))return cache.get(path);
  const module={exports:{}};cache.set(path,module.exports);
  const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const localRequire=id=>id==="zod"?require(id):id==="./live-config"?{LIVE_API_BASE:"https://example.invalid",LIVE_SYNC_ID:"sepolia-v4"}:load(id.startsWith("@/")?resolve(root,"src",id.slice(2)):resolve(dirname(path),id));
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,BigInt,Intl,AbortSignal,fetch:(...args)=>fetchImpl(...args)})(localRequire,module,module.exports);return module.exports;
}
const mapping=load("src/lib/live-mapping"),math=load("src/lib/claim-math"),model=load("src/lib/workspace-model"),api=load("src/lib/live-api");
const projection={chainId:11155111,syncId:"sepolia-v4",status:"synced",projectionStatus:"applied",latestProjectedBlock:"120",latestIndexedBlock:"120",latestProjectedBlockTimestamp:"2026-10-19T00:00:00Z",estimateAt:"2026-10-19T00:00:00Z"};
const stream={streamId:"2",sender:a,recipient:b,currentOwner:a,token:usdc,depositedAmount:"1000",withdrawnAmount:"100",startTime:"2026-10-09T00:00:00Z",endTime:"2026-10-29T00:00:00Z",cancelable:true,canceledAt:null,createdTxHash:hash,computed:{vestedAmount:"500",claimableEstimate:"400",remainingReceivable:"900",estimateTimestamp:projection.estimateAt},listing:null};
test("live token identification is address based and case insensitive",()=>{
  assert.equal(mapping.mapStream({...stream,token:usdc.toLowerCase()},projection,usdc).token,"MockUSDC");
  assert.equal(mapping.mapStream({...stream,token:b},projection,usdc),null);
});
test("no verified projection timestamp means unavailable, not wall-clock zero",()=>{
  assert.throws(()=>mapping.projectionTime({...projection,estimateAt:null}));
  assert.throws(()=>mapping.projectionTime({...projection,latestProjectedBlockTimestamp:"2026-10-18Z"}));
  assert.throws(()=>mapping.mapStream({...stream,computed:{...stream.computed,vestedAmount:null}},projection,usdc));
});
test("live valuation and phase are frozen at the projection basis",()=>{
  const claim=mapping.mapStream(stream,projection,usdc),totals=math.getClaimTotals(claim,new Date("2027-01-01Z"));
  assert.equal(totals.claimableNow.raw,400n);assert.equal(totals.futureAmount.raw,500n);assert.equal(totals.paymentStatus,"streaming");
  assert.equal(model.paymentPhase(claim,new Date("2027-01-01Z")),"streaming");
});
test("canceled live streams retain the unclaimed vested right",()=>{
  const claim=mapping.mapStream({...stream,canceledAt:projection.estimateAt,computed:{...stream.computed,remainingReceivable:"400"}},projection,usdc);
  const values=model.issuedAmounts(claim,new Date("2027-01-01Z"));
  assert.equal(values.claimable,400n);assert.equal(values.future,0n);assert.equal(values.returned,500n);
});
test("inconsistent API accounting fails closed without coercing values",()=>{
  assert.throws(()=>mapping.mapStream({...stream,computed:{...stream.computed,claimableEstimate:"399"}},projection,usdc));
  assert.throws(()=>mapping.mapStream({...stream,withdrawnAmount:"501"},projection,usdc));
});
test("listings map active, sold, removed and invalidated distinctly",()=>{
  for(const [state,expected] of Object.entries({ACTIVE:"active",SOLD:"sold",CANCELED:"unlisted",INVALIDATED:"void"})){
    const listing=mapping.mapListing({...stream,listing:{streamId:"2",seller:a,price:"300",status:state,listingTxHash:hash,soldAt:null,canceledAt:null,invalidatedAt:null}});
    assert.equal(listing.status,expected);assert.equal(listing.priceRaw,300n);
  }
});
test("personal history excludes other accounts and events beyond the snapshot",()=>{
  const claimed={id:"c",streamId:"2",recipient:a,amount:"100",claimedAt:"2026-10-18Z",transactionHash:hash,logIndex:1};
  const trades=[{id:"t",streamId:"2",buyer:a,seller:b,price:"300",tradedAt:"2026-10-17Z",transactionHash:hash,logIndex:2},{id:"future",streamId:"2",buyer:a,seller:b,price:"400",tradedAt:"2026-10-20Z",transactionHash:hash,logIndex:3}];
  const records=mapping.mapRecords([{...stream,claims:[claimed,{...claimed,recipient:b,logIndex:4}]}],trades,a,new Date(projection.estimateAt),usdc);
  assert.equal(records.length,2);assert.equal(model.acquisitionFor({id:"2"},records,a).received,100n);
  assert.equal(model.acquisitionFor({id:"2"},records,b).received,0n);
  const sale=mapping.mapRecords([stream],[{...trades[0],seller:a,buyer:b}],a,new Date(projection.estimateAt),usdc);
  assert.equal(sale[0].role,"seller");assert.equal(model.acquisitionFor({id:"2"},sale,a).purchase,undefined);
});
test("API schemas refuse another network and malformed addresses",()=>{
  assert.throws(()=>api.streamListSchema.parse({data:[stream],meta:{projection:{...projection,chainId:1}}}));
  assert.throws(()=>api.streamListSchema.parse({data:[{...stream,currentOwner:"not-an-address"}],meta:{projection}}));
  assert.equal(api.streamListSchema.parse({data:[stream],meta:{projection}}).data.length,1);
});
test("API HTTP and schema errors do not become successful empty lists",async()=>{
  fetchImpl=async()=>({ok:false,status:503});await assert.rejects(()=>api.readApi("/streams",api.streamListSchema),/503/);
  fetchImpl=async()=>({ok:true,json:async()=>({data:[]})});await assert.rejects(()=>api.readApi("/streams",api.streamListSchema));
});
