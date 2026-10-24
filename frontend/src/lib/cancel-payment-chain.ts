import {createPublicClient,createWalletClient,http,custom,parseAbi,encodeFunctionData,decodeEventLog,type Address,type Hash,type TransactionReceipt} from "viem";
import {sepolia} from "viem/chains";
import {LIVE_RPC_URL,LIVE_STREAM,LIVE_USDC,LIVE_MARKET} from "./live-config";
import type {WalletSession,WalletToken} from "./wallet-session";
import {assertDeploymentWriteAllowed} from "./claim-policy";
import {gasEstimate} from "./transaction-safety";
import {readApi,detailSchema} from "./live-api";
import {browserCancelPaymentStorage} from "./cancel-payment-storage";
import type {CancelPaymentPorts} from "./cancel-payment-engine";
import {CancelPaymentNotSubmitted,cancelPaymentId,cancelHash,cancelAddress,cancelAmounts,validateCancelTerms,sameCancelAddress as eq,unpackCancelTerms,type CancelPaymentQuote,type CancelPaymentEvidence,type PendingCancelPayment} from "./cancel-payment-model";

export const cancelPaymentAbi=parseAbi([
  "function getStream(uint256 streamId) view returns ((address sender,address token,uint256 depositedAmount,uint64 startTime,uint64 endTime,uint256 withdrawnAmount,bool cancelable,bool canceled,uint64 canceledAt))",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function cancel(uint256 streamId) returns (uint256 senderRefund)",
  "event StreamCanceled(uint256 indexed streamId,address indexed sender,address indexed recipient,uint256 vestedAmount,uint256 senderRefund)",
]);
export const cancelMarketplaceAbi=parseAbi([
  "function getListing(uint256 streamId) view returns ((address seller,uint256 price))",
  "function receivableNft() view returns (address)","function paymentToken() view returns (address)",
]);
export const cancelTokenAbi=parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const client=createPublicClient({chain:sepolia,transport:http(LIVE_RPC_URL,{timeout:12_000,retryCount:1})});
const contract={address:LIVE_STREAM,abi:cancelPaymentAbi,authorizationList:undefined};
const marketplace={address:LIVE_MARKET,abi:cancelMarketplaceAbi,authorizationList:undefined};
const zero="0x0000000000000000000000000000000000000000";
const request=(id:string)=>({...contract,functionName:"cancel" as const,args:[cancelPaymentId(id)] as const});

function assertBuiltInOtherPending(account:string){
  const a=account.toLowerCase(),stream=LIVE_STREAM.toLowerCase(),usdc=LIVE_USDC.toLowerCase();
  const keys=[`vestora:claim-pending:11155111:${stream}:${a}`,`vestora:create-pending:11155111:${stream}:${a}`,
    `vestora:market-pending:11155111:${stream}:${a}`,`vestora:mint-pending:11155111:${usdc}:${a}`];
  try{if(keys.some(key=>localStorage.getItem(key)!==null))throw new Error("cancel.otherPending");}
  catch(error){if(error instanceof Error&&error.message==="cancel.otherPending")throw error;throw new Error("cancel.storageUnavailable");}
}
export async function readCancelPaymentQuote(token:WalletToken,id:string):Promise<CancelPaymentQuote>{
  assertDeploymentWriteAllowed(token.account,LIVE_STREAM);assertBuiltInOtherPending(token.account);
  if(token.chainId!=="0xaa36a7"||await client.getChainId()!==sepolia.id)throw new Error("claim.chainUnavailable");
  const block=await client.getBlock(),streamId=cancelPaymentId(id),account=token.account as Address;
  if(block.number===null||block.number<0n||block.timestamp<0n||!cancelHash(block.hash))throw new Error("claim.chainUnavailable");
  const blockNumber=block.number;
  const [stream,owner,listing,nft,paymentToken,balance]=await Promise.all([
    client.readContract({...contract,functionName:"getStream",args:[streamId],blockNumber}),
    client.readContract({...contract,functionName:"ownerOf",args:[streamId],blockNumber}),
    client.readContract({...marketplace,functionName:"getListing",args:[streamId],blockNumber}),
    client.readContract({...marketplace,functionName:"receivableNft",blockNumber}),
    client.readContract({...marketplace,functionName:"paymentToken",blockNumber}),client.getBalance({address:account,blockNumber}),
  ]);
  if(!eq(nft,LIVE_STREAM)||!eq(paymentToken,LIVE_USDC))throw new Error("cancel.marketplaceMismatch");
  if(!eq(stream.sender,account))throw new Error("cancel.notSender");
  if(!eq(stream.token,LIVE_USDC))throw new Error("claim.tokenUnsupported");
  if(stream.canceled)throw new Error("cancel.alreadyCanceled");
  if(!stream.cancelable)throw new Error("cancel.notCancelable");
  if(stream.canceledAt!==0n)throw new Error("cancel.conditionsChanged");
  if(block.timestamp>=stream.endTime)throw new Error("cancel.ended");
  // User policy: listed streams remain cancelable; expose the listing as review risk.
  if(typeof listing.price!=="bigint"||listing.price<0n||listing.price>=2n**256n||
    (eq(listing.seller,zero)?listing.price!==0n:!cancelAddress(listing.seller)||listing.price===0n))throw new Error("cancel.conditionsChanged");
  const terms={sender:stream.sender,owner,tokenAddress:stream.token,deposited:stream.depositedAmount,withdrawn:stream.withdrawnAmount,start:stream.startTime,end:stream.endTime};
  validateCancelTerms(terms);const amounts=cancelAmounts(terms,block.timestamp);
  if(amounts.refund<=0n)throw new Error("cancel.nothingToRefund");
  const simulated=await client.simulateContract({...request(id),account,blockNumber});
  if(simulated.result!==amounts.refund)throw new Error("cancel.conditionsChanged");
  const [gasLimit,fees]=await Promise.all([client.estimateContractGas({...request(id),account}),client.estimateFeesPerGas({chain:sepolia,type:"eip1559"})]);
  const feeQuote=gasEstimate(gasLimit,fees,balance),canonical=await client.getBlock({blockNumber});
  if(canonical.number!==blockNumber||!eq(canonical.hash,block.hash)||canonical.timestamp!==block.timestamp)throw new Error("claim.chainUnavailable");
  return {...terms,...amounts,id,account:token.account.toLowerCase(),token,block:blockNumber,at:block.timestamp,listingSeller:listing.seller,listingPrice:listing.price,gasEstimate:feeQuote};
}
async function transactionKind(r:PendingCancelPayment,hash:Hash,receipt?:TransactionReceipt){
  if(await client.getChainId()!==sepolia.id)throw new Error("claim.chainUnavailable");
  const tx=await client.getTransaction({hash});
  if(!eq(r.contract,LIVE_STREAM)||!eq(tx.hash,hash)||!eq(tx.from,r.account)||!tx.to||tx.value!==0n||tx.chainId!==sepolia.id)throw new Error("cancel.receiptUnavailable");
  if(receipt&&(!eq(tx.blockHash,receipt.blockHash)||tx.blockNumber!==receipt.blockNumber))throw new Error("cancel.receiptUnavailable");
  if(eq(tx.to,LIVE_STREAM))return eq(tx.input,encodeFunctionData(request(r.id)))?"direct":"mismatch";
  return "wrapped";
}
function validLog(log:TransactionReceipt["logs"][number],receipt:TransactionReceipt):log is TransactionReceipt["logs"][number]&{topics:[Hash,...Hash[]]}{
  const topics=(log as {topics?:unknown}).topics;
  return !log.removed&&Number.isSafeInteger(log.logIndex)&&log.logIndex>=0&&eq(log.transactionHash,receipt.transactionHash)&&
    eq(log.blockHash,receipt.blockHash)&&log.blockNumber===receipt.blockNumber&&log.transactionIndex===receipt.transactionIndex&&
    Array.isArray(topics)&&topics.length>0&&topics.every(cancelHash);
}
async function receiptBlock(receipt:TransactionReceipt){
  if(!cancelHash(receipt.transactionHash)||!cancelHash(receipt.blockHash)||receipt.blockNumber<0n||
    !Number.isSafeInteger(receipt.transactionIndex)||receipt.transactionIndex<0||!["success","reverted"].includes(receipt.status))throw new Error("cancel.receiptUnavailable");
  const block=await client.getBlock({blockNumber:receipt.blockNumber});
  if(block.number!==receipt.blockNumber||!eq(block.hash,receipt.blockHash)||typeof block.timestamp!=="bigint"||block.timestamp<0n)throw new Error("cancel.receiptUnavailable");
  return block;
}
async function receiptEvidence(r:PendingCancelPayment,receipt:TransactionReceipt):Promise<CancelPaymentEvidence>{
  const block=await receiptBlock(receipt);
  if(block.timestamp<BigInt(r.quoteAt)||receipt.blockNumber<BigInt(r.quoteBlock))throw new Error("cancel.receiptUnavailable");
  const [stream,owner]=await Promise.all([
    client.readContract({...contract,functionName:"getStream",args:[cancelPaymentId(r.id)],blockNumber:receipt.blockNumber}),
    client.readContract({...contract,functionName:"ownerOf",args:[cancelPaymentId(r.id)],blockNumber:receipt.blockNumber}),
  ]);
  const terms=unpackCancelTerms(r);
  if(!eq(stream.sender,terms.sender)||!eq(stream.token,terms.tokenAddress)||stream.depositedAmount!==terms.deposited||stream.startTime!==terms.start||stream.endTime!==terms.end||
    !stream.cancelable||!stream.canceled||stream.canceledAt!==block.timestamp||stream.withdrawnAmount<terms.withdrawn)throw new Error("cancel.receiptUnavailable");
  const actual=cancelAmounts({...terms,withdrawn:stream.withdrawnAmount},block.timestamp);
  const matches:CancelPaymentEvidence[]=[];
  const seen=new Set<number>();
  for(const log of receipt.logs){
    if(seen.has(log.logIndex))throw new Error("cancel.receiptUnavailable");seen.add(log.logIndex);
    if(!eq(log.address,LIVE_STREAM)||!validLog(log,receipt)||log.topics.length!==4||!/^0x[\da-f]{128}$/i.test(log.data))continue;
    try{
      const decoded=decodeEventLog({abi:cancelPaymentAbi,eventName:"StreamCanceled",topics:log.topics,data:log.data,strict:true});
      const a=decoded.args;
      if(a.streamId!==cancelPaymentId(r.id)||!eq(a.sender,r.account)||!eq(a.recipient,owner)||a.vestedAmount!==actual.vested||a.senderRefund!==actual.refund)continue;
      let refundLogIndex:number|undefined;
      if(actual.refund>0n){
        // SafeERC20 transfer immediately precedes StreamCanceled in the deployed token/stream pair.
        const transfer=receipt.logs.find(l=>l.logIndex===log.logIndex-1);
        if(!transfer||!eq(transfer.address,terms.tokenAddress)||!validLog(transfer,receipt)||transfer.topics.length!==3||!/^0x[\da-f]{64}$/i.test(transfer.data))continue;
        const t=decodeEventLog({abi:cancelTokenAbi,eventName:"Transfer",topics:transfer.topics,data:transfer.data,strict:true}).args;
        if(!eq(t.from,LIVE_STREAM)||!eq(t.to,r.account)||t.value!==actual.refund)continue;
        refundLogIndex=transfer.logIndex;
      }
      matches.push({hash:receipt.transactionHash,block:receipt.blockNumber,blockHash:receipt.blockHash,at:block.timestamp,logIndex:log.logIndex,
        sender:a.sender,recipient:a.recipient,tokenAddress:terms.tokenAddress,vested:a.vestedAmount,refund:a.senderRefund,
        withdrawnAtBlock:stream.withdrawnAmount,ownerUnclaimedAtBlock:actual.ownerUnclaimed,...(refundLogIndex===undefined?{}:{refundLogIndex})});
    }catch{/* Unrelated or undecodable logs do not prove cancellation. */}
  }
  if(matches.length!==1)throw new Error("cancel.receiptUnavailable");
  return matches[0];
}
export function browserCancelPaymentPorts(session:WalletSession,refresh:CancelPaymentPorts["refresh"]):CancelPaymentPorts{
  const ports:CancelPaymentPorts={session,storage:browserCancelPaymentStorage(),refresh,quote:readCancelPaymentQuote,
    lock:async(account,action)=>{
      if(!navigator.locks)throw new Error("claim.lockUnavailable");
      await navigator.locks.request(`vestora:claim:${LIVE_STREAM.toLowerCase()}:${account.toLowerCase()}`,{ifAvailable:true},async lock=>{
        if(!lock)throw new Error("claim.tabBusy");await action();
      });
    },
    send:async quote=>{
      try{
        assertDeploymentWriteAllowed(quote.account,LIVE_STREAM);assertBuiltInOtherPending(quote.account);
        await ports.assertNoOtherPending?.(quote.account);await session.assertCurrent(quote.token);
        if(await client.getChainId()!==sepolia.id)throw new Error("claim.chainUnavailable");
        await session.assertCurrent(quote.token);assertBuiltInOtherPending(quote.account);
      }catch(error){throw new CancelPaymentNotSubmitted(error instanceof Error?error.message:"cancel.readFailed");}
      const wallet=createWalletClient({chain:sepolia,account:quote.account as Address,transport:custom(quote.token.provider,{retryCount:0})});
      return wallet.writeContract({...request(quote.id),chain:sepolia,account:quote.account as Address});
    },
    receipt:async(r,replaced)=>{
      if(!r.hash)throw new Error("cancel.unknownHash");let expected=r.hash,provenReplacement=false,canceledReplacement=false;
      const receipt=await client.waitForTransactionReceipt({hash:r.hash,confirmations:2,timeout:120_000,pollingInterval:4_000,onReplaced:event=>{
        const hash=event.transactionReceipt.transactionHash,prior=event.replacedTransaction,next=event.transaction;
        if(!cancelHash(hash)||!eq(prior.hash,expected)||!eq(next.hash,hash)||!eq(prior.from,r.account)||!eq(next.from,r.account)||
          !Number.isSafeInteger(prior.nonce)||prior.nonce<0||prior.nonce!==next.nonce)return;
        provenReplacement=true;canceledReplacement=event.reason==="cancelled"&&eq(next.to,next.from)&&next.value===0n&&next.input==="0x";expected=hash;replaced(hash);
      }});
      if(!eq(receipt.transactionHash,expected))throw new Error("cancel.receiptUnavailable");
      await receiptBlock(receipt);
      const kind=await transactionKind(r,expected,receipt);
      if(kind==="mismatch"){if(provenReplacement)return "replaced";throw new Error("cancel.receiptUnavailable");}
      if(receipt.status!=="success")return "reverted";
      if(provenReplacement&&canceledReplacement&&kind==="wrapped"&&receipt.logs.length===0)return "replaced";
      return receiptEvidence(r,receipt);
    },
    verifyRecovery:async(r,hash)=>{
      if(!cancelHash(hash))throw new Error("cancel.recoveryMismatch");
      const receipt=await client.getTransactionReceipt({hash});
      if(!eq(receipt.transactionHash,hash)||receipt.status!=="success"||await transactionKind(r,hash,receipt)==="mismatch")throw new Error("cancel.recoveryMismatch");
      try{await receiptEvidence(r,receipt);}catch{throw new Error("cancel.recoveryMismatch");}
    },
    projected:async(r,e)=>{
      const response=await readApi(`/streams/${r.id}`,detailSchema),s=response.data,p=response.meta.projection,terms=unpackCancelTerms(r);
      if(p.projectionStatus!=="applied"||p.latestProjectedBlock===null||BigInt(p.latestProjectedBlock)<e.block)return false;
      const canceled=s.canceledAt===null?NaN:Date.parse(s.canceledAt),start=Date.parse(s.startTime),end=Date.parse(s.endTime);
      return s.streamId===r.id&&eq(s.sender,r.account)&&eq(s.token,terms.tokenAddress)&&BigInt(s.depositedAmount)===terms.deposited&&s.cancelable&&
        Number.isSafeInteger(canceled)&&canceled%1000===0&&BigInt(canceled/1000)===e.at&&
        Number.isSafeInteger(start)&&start%1000===0&&BigInt(start/1000)===terms.start&&Number.isSafeInteger(end)&&end%1000===0&&BigInt(end/1000)===terms.end&&
        BigInt(s.withdrawnAmount)>=e.withdrawnAtBlock&&BigInt(s.withdrawnAmount)<=e.vested;
    },
  };
  return ports;
}
