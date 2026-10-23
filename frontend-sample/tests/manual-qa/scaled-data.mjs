const A="0x1111111111111111111111111111111111111111",B="0x2222222222222222222222222222222222222222";
const USDC="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9";
const iso=value=>new Date(Number(value)*1000).toISOString();
export function scaledCount(mode){return {"P01-10":10,"P01-100":100,"P01-1000":1000}[mode]||0;}
export function fixtureApiCap(mode){return scaledCount(mode)?Math.min(22000,20*(scaledCount(mode)+2)):mode==="P02-harness"?1500:500;}

/** Fixed schedule and arithmetic only; never calls an upstream or a real wallet. */
export function scaledStream(mode,at,id){
  const count=scaledCount(mode),n=Number(id);if(!count||!Number.isSafeInteger(n)||n<3||n>=3+count)return null;
  const deposited=1000000n+BigInt(n)*1000n,phase=n%3;
  const start=at+(phase===0?1000n:phase===1?-2000n:-1000n),end=start+2000n;
  const elapsed=at<=start?0n:at>=end?end-start:at-start,vested=deposited*elapsed/(end-start);
  const hash=`0x${BigInt(n).toString(16).padStart(64,"0")}`;
  return {streamId:String(n),sender:A,recipient:B,currentOwner:B,token:USDC,depositedAmount:String(deposited),withdrawnAmount:"0",startTime:iso(start),endTime:iso(end),cancelable:n%2===0,canceledAt:null,createdTxHash:hash,
    computed:{vestedAmount:String(vested),claimableEstimate:String(vested),remainingReceivable:String(deposited),estimateTimestamp:iso(at)},claims:[],
    listing:{streamId:String(n),seller:B,price:String(deposited*8n/10n),status:"ACTIVE",listedAt:iso(at-100n),soldAt:null,canceledAt:null,invalidatedAt:null,listingTxHash:hash,boughtTxHash:null,buyer:null}};
}
