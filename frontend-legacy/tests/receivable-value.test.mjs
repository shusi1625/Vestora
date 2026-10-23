import { test } from "node:test";
import assert from "node:assert/strict";
import { portfolioValue, formatAmount, parseBaseUnits, priceComparison } from "../lib/receivable-value.ts";
const owner = "0xABC", token = "0xDEF";
const h = (overrides = {}) => ({ currentOwner: owner, token, remaining: 100n, claimable: 20n, cancelable: false, canceled: false, ...overrides });
test("only current holdings in the selected token contribute; listings have no added value", () => {
  const value = portfolioValue(50n, [h(), h({ currentOwner: "another" }), h({ token: "different" })], owner.toLowerCase(), token.toLowerCase());
  assert.deepEqual(value, { total: 150n, remaining: 100n, claimable: 20n, future: 80n, cancelableFuture: 0n });
});
test("claim conserves nominal holdings; unknown ownership or valuation is not zero", () => {
  assert.equal(portfolioValue(50n,[h()],owner,token).total, portfolioValue(70n,[h({ remaining:80n, claimable:0n })],owner,token).total);
  for (const entry of [h({ currentOwner:null }), h({ remaining:null }), h({ claimable:null }), h({ claimable:101n })]) assert.equal(portfolioValue(50n,[entry],owner,token).total, null);
  assert.equal(portfolioValue(null,[h()],owner,token).total,null);
});
test("cancelable future and canceled vested rights are distinct", () => {
  assert.equal(portfolioValue(0n,[h({cancelable:true})],owner,token).cancelableFuture,80n);
  const value=portfolioValue(0n,[h({remaining:20n,claimable:20n,cancelable:true,canceled:true})],owner,token);
  assert.equal(value.future,0n);assert.equal(value.cancelableFuture,0n);
  assert.equal(portfolioValue(0n,[h({canceled:true})],owner,token).total,null);
});
test("prices above remaining and historical listings cannot look like profitable active offers", () => {
  assert.equal(priceComparison(100n,120n,true).premium,true);
  assert.equal(priceComparison(100n,120n,true).difference,-20n);
  assert.equal(priceComparison(0n,120n,true),null);
  assert.equal(priceComparison(100n,0n,true),null);
  assert.equal(priceComparison(100n,120n,false),null);
});
test("amounts preserve six-decimal base unit precision beyond Number safe integers", () => {
  assert.equal(formatAmount(12345678901234567890123456n),"12,345,678,901,234,567,890.123456");
  assert.equal(formatAmount(1n),"0.000001");
  assert.equal(formatAmount(-1000001n),"−1.000001");
  assert.equal(formatAmount(null),"확인 불가");
  assert.equal(parseBaseUnits("0"),0n);
  for(const value of [null,undefined,"","-1","1.2","abc"]) assert.equal(parseBaseUnits(value),null);
});

import { streamHolding, portfolioFromStreams, userStreamGroups, streamView, listingView } from "../lib/receivable-value.ts";
const baseStream = {
 streamId:"1", currentOwner:owner, token, sender:"sender", recipient:owner,
 cancelable:false,canceledAt:null,startTime:"2026-01-01T00:00:00.000Z",endTime:"2026-02-01T00:00:00.000Z",
 computed:{remainingReceivable:"100",claimableEstimate:"20",estimateTimestamp:"2026-01-15T00:00:00.000Z"},
 listing:null
};
const baseListing = {
 streamId:"1",seller:owner,price:"90",status:"ACTIVE",stream:baseStream,
 computed:{remainingReceivable:"100",claimableEstimate:"20",freshness:"fresh"}
};
test("API roles do not make sent or formerly owned payments current assets",()=>{
 const sold={...baseStream,streamId:"2",currentOwner:"buyer",sender:owner,listing:{...baseListing,status:"SOLD"}};
 const groups=userStreamGroups([baseStream,sold],owner);
 assert.deepEqual(groups.owned.map(s=>s.streamId),["1"]);
 assert.deepEqual(groups.sent.map(s=>s.streamId),["2"]);
 assert.deepEqual(groups.sales.map(s=>s.streamId),["2"]);
 assert.equal(portfolioFromStreams(50n,[baseStream,sold],owner,token).total,150n);
 assert.equal(portfolioFromStreams(50n,undefined,owner,token).total,null);
 assert.equal(portfolioFromStreams(50n,[],owner,token).total,50n);
});
test("API canceled rights use projected remaining, not deposit minus withdrawn",()=>{
 const canceled={...baseStream,cancelable:true,canceledAt:"2026-01-15T00:00:00.000Z",depositedAmount:"1000",withdrawnAmount:"80",computed:{...baseStream.computed,remainingReceivable:"20",claimableEstimate:"20"}};
 assert.equal(streamHolding(canceled).remaining,20n);
 assert.equal(portfolioFromStreams(0n,[canceled],owner,token).future,0n);
});
test("payment lifecycle and claim lifecycle remain separate; missing chain time is explicit",()=>{
 const ended=streamView({...baseStream,computed:{...baseStream.computed,estimateTimestamp:"2026-02-02T00:00:00.000Z"}});
 assert.equal(ended.paymentState,"지급 종료");assert.equal(ended.claimState,"청구 가능");
 assert.equal(streamView({...baseStream,computed:{...baseStream.computed,estimateTimestamp:null}}).paymentState,"지급 시점 확인 불가");
 assert.equal(streamView({...baseStream,canceledAt:"2026-01-10T00:00:00.000Z",computed:{...baseStream.computed,remainingReceivable:"0",claimableEstimate:"0"}}).claimState,"청구 완료");
});
test("listing projection is never final buy authorization and hides historical implied returns",()=>{
 assert.equal(listingView(baseListing).reviewBlockReason,null);
 assert.equal(listingView(baseListing).requiresOnchainRecheck,true);
 assert.match(listingView(baseListing,owner).reviewBlockReason,/본인/);
 assert.equal(listingView({...baseListing,status:"SOLD"}).comparison,null);
 assert.match(listingView({...baseListing,stream:{...baseStream,currentOwner:null}}).reviewBlockReason,/소유권/);
 assert.match(listingView({...baseListing,stream:{...baseStream,currentOwner:"buyer"}}).reviewBlockReason,/다릅니다/);
 assert.equal(listingView({...baseListing,computed:{...baseListing.computed,freshness:"stale"}}).stale,true);
});
