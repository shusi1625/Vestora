import {createPublicClient,createWalletClient,http,custom,parseAbi,encodeFunctionData,decodeEventLog,
  type Address,type Hash,type TransactionReceipt} from "viem";
import {sepolia} from "viem/chains";
import {LIVE_RPC_URL,LIVE_STREAM,LIVE_USDC,LIVE_MARKET} from "./live-config";
import {readApi,detailSchema,tradeListSchema} from "./live-api";
import {assertDeploymentWriteAllowed} from "./claim-policy";
import {gasEstimate} from "./transaction-safety";
import {browserMarketActionStorage} from "./market-action-storage";
import {MarketActionNotSubmitted,MARKET_CHAIN_ID,marketId,sameAddress,validateMarketDraft,assertMarketQuoteUnchanged,
  type MarketActionDraft,type MarketActionQuote,type PendingMarketAction,type MarketActionEvidence} from "./market-action-model";
import type {MarketActionPorts} from "./market-action-engine";
import type {WalletSession,WalletToken} from "./wallet-session";

export const marketActionAbi=parseAbi([
  "function paymentToken() view returns (address)","function receivableNft() view returns (address)",
  "function getListing(uint256 streamId) view returns ((address seller,uint256 price))",
  "function list(uint256 streamId,uint256 price)","function cancelListing(uint256 streamId)",
  "function buyWithProtection(uint256 streamId,uint256 maxPrice,uint256 minRemainingReceivable,uint256 maxWithdrawnAmount,address expectedSeller)",
  "event Listed(uint256 indexed streamId,address indexed seller,uint256 price)",
  "event ListingCanceled(uint256 indexed streamId,address indexed seller)",
  "event Purchased(uint256 indexed streamId,address indexed seller,address indexed buyer,uint256 price)",
]);
export const marketNftAbi=parseAbi([
  "function ownerOf(uint256 id) view returns (address)","function getApproved(uint256 id) view returns (address)",
  "function isApprovedForAll(address owner,address operator) view returns (bool)","function approve(address to,uint256 id)",
  "function getStream(uint256 id) view returns ((address sender,address token,uint256 depositedAmount,uint64 startTime,uint64 endTime,uint256 withdrawnAmount,bool cancelable,bool canceled,uint64 canceledAt))",
  "function vestedAmount(uint256 id) view returns (uint256)","function claimableAmount(uint256 id) view returns (uint256)",
  "event Approval(address indexed owner,address indexed approved,uint256 indexed tokenId)",
]);
export const marketTokenAbi=parseAbi([
  "function balanceOf(address account) view returns (uint256)","function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)","event Approval(address indexed owner,address indexed spender,uint256 value)",
]);
const client=createPublicClient({chain:sepolia,transport:http(LIVE_RPC_URL,{timeout:12_000,retryCount:1})});
type MarketReadClient=Pick<typeof client,"getChainId"|"getBlock"|"getCode"|"readContract"|"getBalance"|"simulateContract"|"estimateContractGas"|"estimateFeesPerGas">;
type MarketReceiptClient=Pick<typeof client,"getChainId"|"getTransaction"|"getTransactionReceipt"|"waitForTransactionReceipt">;
const zero="0x0000000000000000000000000000000000000000";
export function marketActionRequest(r:Pick<PendingMarketAction,"step"|"id"|"price"|"remaining"|"withdrawn"|"seller">) {
  const id=marketId(r.id),price=BigInt(r.price);
  switch(r.step){
    case "erc20-approval":return {address:LIVE_USDC,abi:marketTokenAbi,functionName:"approve" as const,args:[LIVE_MARKET,price] as const};
    case "nft-approval":return {address:LIVE_STREAM,abi:marketNftAbi,functionName:"approve" as const,args:[LIVE_MARKET,id] as const};
    case "list":return {address:LIVE_MARKET,abi:marketActionAbi,functionName:"list" as const,args:[id,price] as const};
    case "cancel-listing":return {address:LIVE_MARKET,abi:marketActionAbi,functionName:"cancelListing" as const,args:[id] as const};
    case "buy":return {address:LIVE_MARKET,abi:marketActionAbi,functionName:"buyWithProtection" as const,args:[id,price,BigInt(r.remaining),BigInt(r.withdrawn),r.seller as Address] as const};
  }
}
const requestForQuote=(q:MarketActionQuote)=>marketActionRequest({step:q.step,id:q.id,price:q.price.toString(),remaining:q.remaining.toString(),withdrawn:q.withdrawn.toString(),seller:q.seller});
export async function readMarketActionQuote(token:WalletToken,draft:MarketActionDraft,rpc:MarketReadClient=client):Promise<MarketActionQuote> {
  validateMarketDraft(draft);assertDeploymentWriteAllowed(token.account,LIVE_STREAM);
  if(token.chainId!=="0xaa36a7") throw new Error("claim.network");
  if(await rpc.getChainId()!==MARKET_CHAIN_ID) throw new Error("claim.chainUnavailable");
  const block=await rpc.getBlock();if(block.number===null) throw new Error("claim.chainUnavailable");
  const blockNumber=block.number,account=token.account as Address,id=marketId(draft.id),readAt={blockNumber,authorizationList:undefined};
  const [marketCode,nftCode,tokenCode,paymentToken,receivableNft,listing,owner,stream,vested,claimable,approved,balance,allowance,gas]=await Promise.all([
    rpc.getCode({address:LIVE_MARKET,blockNumber}),rpc.getCode({address:LIVE_STREAM,blockNumber}),rpc.getCode({address:LIVE_USDC,blockNumber}),
    rpc.readContract({address:LIVE_MARKET,abi:marketActionAbi,functionName:"paymentToken",...readAt}),
    rpc.readContract({address:LIVE_MARKET,abi:marketActionAbi,functionName:"receivableNft",...readAt}),
    rpc.readContract({address:LIVE_MARKET,abi:marketActionAbi,functionName:"getListing",args:[id],...readAt}),
    rpc.readContract({address:LIVE_STREAM,abi:marketNftAbi,functionName:"ownerOf",args:[id],...readAt}),
    rpc.readContract({address:LIVE_STREAM,abi:marketNftAbi,functionName:"getStream",args:[id],...readAt}),
    rpc.readContract({address:LIVE_STREAM,abi:marketNftAbi,functionName:"vestedAmount",args:[id],...readAt}),
    rpc.readContract({address:LIVE_STREAM,abi:marketNftAbi,functionName:"claimableAmount",args:[id],...readAt}),
    rpc.readContract({address:LIVE_STREAM,abi:marketNftAbi,functionName:"getApproved",args:[id],...readAt}),
    rpc.readContract({address:LIVE_USDC,abi:marketTokenAbi,functionName:"balanceOf",args:[account],...readAt}),
    rpc.readContract({address:LIVE_USDC,abi:marketTokenAbi,functionName:"allowance",args:[account,LIVE_MARKET],...readAt}),rpc.getBalance({address:account,blockNumber}),
  ]);
  if(!marketCode||marketCode==="0x"||!nftCode||nftCode==="0x"||!tokenCode||tokenCode==="0x"||!sameAddress(paymentToken,LIVE_USDC)||!sameAddress(receivableNft,LIVE_STREAM)) throw new Error("market.deploymentMismatch");
  if(!sameAddress(stream.token,LIVE_USDC)) throw new Error("claim.tokenUnsupported");
  const approvedForAll=await rpc.readContract({address:LIVE_STREAM,abi:marketNftAbi,functionName:"isApprovedForAll",args:[owner,LIVE_MARKET],...readAt});
  const ceiling=stream.canceled?vested:stream.depositedAmount,remaining=ceiling>stream.withdrawnAmount?ceiling-stream.withdrawnAmount:0n;
  const listed=!sameAddress(listing.seller,zero),nftApproved=sameAddress(approved,LIVE_MARKET)||approvedForAll;
  let step:MarketActionQuote["step"],price:bigint,seller:string;
  if(draft.action==="buy"){
    if(!listed||listing.price<=0n) throw new Error("market.notListed");
    if(sameAddress(listing.seller,account)) throw new Error("market.selfPurchase");
    if(!sameAddress(owner,listing.seller)) throw new Error("market.sellerNotOwner");
    if(!nftApproved) throw new Error("market.notApproved");
    if(listing.price!==draft.price) throw new Error("market.conditionsChanged");
    if(remaining<=0n) throw new Error("market.noRemaining");
    if(listing.price>remaining) throw new Error("market.priceAboveRemaining");
    if(balance<listing.price) throw new Error("workspace.insufficientBalance");
    price=listing.price;seller=listing.seller;step=allowance<price?"erc20-approval":"buy";
  }else if(draft.action==="list"){
    if(!sameAddress(owner,account)) throw new Error("market.notOwner");
    if(listed) throw new Error("market.alreadyListed");
    if(remaining<=0n) throw new Error("market.noRemaining");
    price=draft.price;seller=account;step=nftApproved?"list":"nft-approval";
  }else{
    if(!listed||listing.price<=0n) throw new Error("market.notListed");
    // A former owner can still remove their stale non-custodial listing.
    if(!sameAddress(listing.seller,account)) throw new Error("market.notSeller");
    price=listing.price;seller=listing.seller;step="cancel-listing";
  }
  if(gas===0n) throw new Error("claim.gasInsufficient");
  const q:MarketActionQuote={draft:{...draft},id:draft.id,account:token.account.toLowerCase(),token,step,owner,seller,price,remaining,
    withdrawn:stream.withdrawnAmount,claimable,canceled:stream.canceled,cancelable:stream.cancelable,allowance,approved,approvedForAll,block:blockNumber,at:block.timestamp};
  const request=requestForQuote(q);
  // Keep each ABI/argument tuple narrowed for viem's simulation and wallet types.
  const simulation=request.address===LIVE_USDC?await rpc.simulateContract({...request,account,...readAt}):
    request.address===LIVE_STREAM?await rpc.simulateContract({...request,account,...readAt}):
    request.functionName==="list"?await rpc.simulateContract({...request,account,...readAt}):
    request.functionName==="cancelListing"?await rpc.simulateContract({...request,account,...readAt}):await rpc.simulateContract({...request,account,...readAt});
  if(step==="erc20-approval" && simulation.result!==true) throw new Error("market.simulationFailed");
  const gasArgs={account,authorizationList:undefined};
  const gasPromise=request.address===LIVE_USDC?rpc.estimateContractGas({...request,...gasArgs}):
    request.address===LIVE_STREAM?rpc.estimateContractGas({...request,...gasArgs}):
    request.functionName==="list"?rpc.estimateContractGas({...request,...gasArgs}):
    request.functionName==="cancelListing"?rpc.estimateContractGas({...request,...gasArgs}):rpc.estimateContractGas({...request,...gasArgs});
  const [gasLimit,fees]=await Promise.all([gasPromise,rpc.estimateFeesPerGas({chain:sepolia,type:"eip1559"})]);
  q.gasEstimate=gasEstimate(gasLimit,fees,gas);return q;
}
export async function marketTransactionKind(r:PendingMarketAction,hash:Hash,rpc:Pick<MarketReceiptClient,"getChainId"|"getTransaction">=client) {
  if(await rpc.getChainId()!==MARKET_CHAIN_ID) throw new Error("claim.chainUnavailable");
  const tx=await rpc.getTransaction({hash});
  if(!sameAddress(r.contract,LIVE_MARKET)||!sameAddress(r.stream,LIVE_STREAM)||!sameAddress(r.paymentToken,LIVE_USDC)||
    r.chainId!==MARKET_CHAIN_ID||!sameAddress(tx.hash,hash)||!sameAddress(tx.from,r.account)||!tx.to||tx.value!==0n||tx.chainId!==undefined&&tx.chainId!==MARKET_CHAIN_ID) return "mismatch";
  const request=marketActionRequest(r),input=request.address===LIVE_USDC?encodeFunctionData(request):request.address===LIVE_STREAM?encodeFunctionData(request):encodeFunctionData(request);
  if(sameAddress(tx.to,request.address)) return tx.input.toLowerCase()===input.toLowerCase()?"direct":"mismatch";
  if([LIVE_MARKET,LIVE_STREAM,LIVE_USDC].some(address=>sameAddress(tx.to,address))) return "mismatch";
  return "wrapped";
}
export function marketReceiptEvidence(r:PendingMarketAction,receipt:TransactionReceipt):MarketActionEvidence|undefined {
  if(receipt.status!=="success"||receipt.blockNumber<=BigInt(r.reviewBlock)) return;
  const target=r.step==="erc20-approval"?LIVE_USDC:r.step==="nft-approval"?LIVE_STREAM:LIVE_MARKET;
  const expected=r.step==="erc20-approval"||r.step==="nft-approval"?"Approval":r.step==="buy"?"Purchased":r.step==="list"?"Listed":"ListingCanceled";
  let candidates=0,result:MarketActionEvidence|undefined;
  for(const log of receipt.logs){
    if(!sameAddress(log.address,target)||log.removed||!Number.isSafeInteger(log.logIndex)||log.logIndex<0||
      !sameAddress(log.transactionHash,receipt.transactionHash)||log.blockNumber!==receipt.blockNumber||!sameAddress(log.blockHash,receipt.blockHash)) continue;
    const topics=(log as {topics?:unknown}).topics;
    if(!Array.isArray(topics)||!topics.length||topics.some(t=>typeof t!=="string"||!/^0x[\da-f]{64}$/i.test(t))) continue;
    try{
      const e=decodeEventLog({abi:r.step==="erc20-approval"?marketTokenAbi:r.step==="nft-approval"?marketNftAbi:marketActionAbi,topics:topics as [Hash,...Hash[]],data:log.data,strict:true}) as {eventName:string;args:{streamId?:bigint;seller?:string;buyer?:string;price?:bigint;owner?:string;spender?:string;value?:bigint;approved?:string;tokenId?:bigint}};
      if(e.eventName!==expected) continue;
      candidates++;
      const a=e.args;
      const exactTopics=r.step==="buy"||r.step==="nft-approval"?4:3;
      if(topics.length!==exactTopics) continue;
      const matches=r.step==="erc20-approval"?sameAddress(a.owner,r.account)&&sameAddress(a.spender,LIVE_MARKET)&&a.value===BigInt(r.price):
        r.step==="nft-approval"?sameAddress(a.owner,r.account)&&sameAddress(a.approved,LIVE_MARKET)&&a.tokenId===marketId(r.id):
        a.streamId===marketId(r.id)&&sameAddress(a.seller,r.seller)&&
        (r.step==="cancel-listing"||a.price===BigInt(r.price))&&(r.step!=="buy"||sameAddress(a.buyer,r.account));
      if(matches) result={hash:receipt.transactionHash,block:receipt.blockNumber,logIndex:log.logIndex,id:r.id,step:r.step,price:BigInt(r.price)};
    }catch{/* A malformed or unrelated log cannot establish market success. */}
  }
  return candidates===1?result:undefined;
}
export async function readMarketActionReceipt(r:PendingMarketAction,replaced:(hash:Hash)=>void,rpc:MarketReceiptClient=client) {
  if(!r.hash) throw new Error("market.unknownHash");
  let expected=r.hash,replacementNonce:number|undefined;
  const receipt=await rpc.waitForTransactionReceipt({hash:r.hash,confirmations:2,timeout:120_000,pollingInterval:4_000,onReplaced:e=>{
    const prior=e.replacedTransaction,next=e.transaction,hash=e.transactionReceipt.transactionHash;
    if(!sameAddress(prior?.hash,expected)||!sameAddress(next?.hash,hash)||!sameAddress(prior?.from,r.account)||!sameAddress(next?.from,r.account)||
      !Number.isSafeInteger(prior?.nonce)||prior.nonce<0||prior.nonce!==next.nonce) return;
    replacementNonce=next.nonce;expected=hash;replaced(expected);
  }});
  if(!sameAddress(receipt.transactionHash,expected)) throw new Error("market.receiptUnavailable");
  const tx=await boundMarketReceiptTransaction(r,receipt,rpc);
  if(replacementNonce!==undefined&&tx.nonce!==replacementNonce) throw new Error("market.receiptUnavailable");
  if(receipt.status!=="success"&&receipt.status!=="reverted") throw new Error("market.receiptUnavailable");
  const kind=await marketTransactionKind(r,receipt.transactionHash,rpc);
  if(kind==="mismatch"){
    if(replacementNonce!==undefined) return "replaced" as const;
    throw new Error("market.receiptUnavailable");
  }
  if(receipt.status!=="success") return "reverted" as const;
  if(replacementNonce!==undefined&&sameAddress(tx.to,tx.from)&&tx.value===0n&&tx.input==="0x"&&receipt.logs.length===0) return "replaced" as const;
  const evidence=marketReceiptEvidence(r,receipt);if(!evidence) throw new Error("market.receiptUnavailable");return evidence;
}
async function boundMarketReceiptTransaction(r:PendingMarketAction,receipt:TransactionReceipt,rpc:MarketReceiptClient){
  if(receipt.blockNumber<=BigInt(r.reviewBlock)||!/^0x[\da-f]{64}$/i.test(receipt.blockHash)) throw new Error("market.receiptUnavailable");
  const tx=await rpc.getTransaction({hash:receipt.transactionHash});
  if(!sameAddress(tx.hash,receipt.transactionHash)||!sameAddress(tx.from,r.account)||tx.chainId!==undefined&&tx.chainId!==MARKET_CHAIN_ID||
    tx.blockNumber!==receipt.blockNumber||!sameAddress(tx.blockHash,receipt.blockHash)||!Number.isSafeInteger(tx.nonce)||tx.nonce<0) throw new Error("market.receiptUnavailable");
  return tx;
}
export async function verifyMarketActionRecovery(r:PendingMarketAction,hash:Hash,rpc:MarketReceiptClient=client) {
  if(await marketTransactionKind(r,hash,rpc)==="mismatch") throw new Error("market.recoveryMismatch");
  const receipt=await rpc.getTransactionReceipt({hash});
  if(!sameAddress(receipt.transactionHash,hash)||!marketReceiptEvidence(r,receipt)) throw new Error("market.recoveryMismatch");
  try{
    const tx=await boundMarketReceiptTransaction(r,receipt,rpc);
    if(r.hash&&!sameAddress(r.hash,hash)){
      const original=await rpc.getTransaction({hash:r.hash});
      if(!sameAddress(original.hash,r.hash)||!sameAddress(original.from,r.account)||original.chainId!==undefined&&original.chainId!==MARKET_CHAIN_ID||original.nonce!==tx.nonce) throw new Error("market.recoveryMismatch");
    }
  }catch{throw new Error("market.recoveryMismatch");}
}
export async function marketActionProjected(r:PendingMarketAction,e:MarketActionEvidence) {
  if(r.step==="erc20-approval"||r.step==="nft-approval") return true;
  if(r.step==="buy"){
    const response=await readApi(`/users/${r.account}/trades`,tradeListSchema),block=response.meta.projection.latestProjectedBlock;
    return block!==null&&BigInt(block)>=e.block&&response.data.some(t=>t.streamId===r.id&&sameAddress(t.transactionHash,e.hash)&&t.logIndex===e.logIndex&&sameAddress(t.seller,r.seller)&&sameAddress(t.buyer,r.account)&&BigInt(t.price)===BigInt(r.price));
  }
  const response=await readApi(`/streams/${r.id}`,detailSchema),block=response.meta.projection.latestProjectedBlock,s=response.data,l=s.listing;
  if(block===null||BigInt(block)<e.block||s.streamId!==r.id||!sameAddress(s.token,LIVE_USDC)||!l||l.streamId!==r.id||!sameAddress(l.seller,r.seller)||BigInt(l.price)!==BigInt(r.price)) return false;
  // Cancellation projection has no cancel tx hash; the applied checkpoint and matching final state are used after receipt proof.
  return r.step==="list"?sameAddress(l.listingTxHash,e.hash):l.status==="CANCELED";
}
export function assertNoOtherMarketPending(account:string) {
  const a=account.toLowerCase(),stream=LIVE_STREAM.toLowerCase(),token=LIVE_USDC.toLowerCase();
  const keys=[`vestora:claim-pending:11155111:${stream}:${a}`,`vestora:create-pending:11155111:${stream}:${a}`,
    `vestora:cancel-payment-pending:11155111:${stream}:${a}`,`vestora:mint-pending:11155111:${token}:${a}`];
  let occupied:boolean;try{occupied=keys.some(key=>localStorage.getItem(key)!==null);}catch{throw new Error("market.storageUnavailable");}
  if(occupied) throw new Error("market.otherPending");
}
export function browserMarketActionPorts(session:WalletSession,refresh:MarketActionPorts["refresh"],options:{assertNoOtherPending?:MarketActionPorts["assertNoOtherPending"]}={}):MarketActionPorts {
  return {session,refresh,storage:browserMarketActionStorage(),quote:readMarketActionQuote,
    assertNoOtherPending:async a=>{assertNoOtherMarketPending(a);await options.assertNoOtherPending?.(a);},
    lock:async(a,fn)=>{if(!navigator.locks) throw new Error("claim.lockUnavailable");await navigator.locks.request(`vestora:claim:${LIVE_STREAM.toLowerCase()}:${a.toLowerCase()}`,{ifAvailable:true},async lock=>{if(!lock) throw new Error("claim.tabBusy");await fn();});},
    send:async q=>{
      try{
        assertDeploymentWriteAllowed(q.account,LIVE_STREAM);assertNoOtherMarketPending(q.account);await options.assertNoOtherPending?.(q.account);await session.assertCurrent(q.token);
        const latest=await readMarketActionQuote(q.token,q.draft);assertMarketQuoteUnchanged(q,latest);await session.assertCurrent(q.token);
        assertNoOtherMarketPending(q.account);await options.assertNoOtherPending?.(q.account);
      }catch(e){throw new MarketActionNotSubmitted(e instanceof Error?e.message:"market.readFailed");}
      const wallet=createWalletClient({chain:sepolia,account:q.account as Address,transport:custom(q.token.provider,{retryCount:0})});
      const request=requestForQuote(q),walletArgs={account:q.account as Address,chain:sepolia,authorizationList:undefined};
      return request.address===LIVE_USDC?wallet.writeContract({...request,...walletArgs}):
        request.address===LIVE_STREAM?wallet.writeContract({...request,...walletArgs}):
        request.functionName==="list"?wallet.writeContract({...request,...walletArgs}):
        request.functionName==="cancelListing"?wallet.writeContract({...request,...walletArgs}):wallet.writeContract({...request,...walletArgs});
    },receipt:readMarketActionReceipt,verifyRecovery:verifyMarketActionRecovery,projected:marketActionProjected,
  };
}
