import {createPublicClient,createWalletClient,http,custom,parseAbi,encodeFunctionData,decodeEventLog,type Address,type Hash,type TransactionReceipt} from "viem";
import {sepolia} from "viem/chains";
import {LIVE_RPC_URL,LIVE_STREAM,LIVE_USDC} from "./live-config";
import {readApi,detailSchema} from "./live-api";
import {browserClaimStorage} from "./claim-storage";
import {PaymentNotSubmitted,paymentStorage,unpackPayment,validatePayment,type PaymentDraft,type PaymentQuote,type PendingPayment,type PaymentEvidence} from "./create-payment-model";
import type {PaymentPorts} from "./create-payment-engine";
import type {WalletSession,WalletToken} from "./wallet-session";
import {gasEstimate} from "./transaction-safety";

export const paymentAbi=parseAbi([
  "function createStream(address recipient,address token,uint256 amount,uint256 startTime,uint256 endTime,bool cancelable) returns (uint256 streamId)",
  "event StreamCreated(uint256 indexed streamId,address indexed sender,address indexed recipient,address token,uint256 depositedAmount,uint256 startTime,uint256 endTime,bool cancelable)",
]);
export const paymentTokenAbi=parseAbi([
  "function balanceOf(address account) view returns (uint256)","function allowance(address owner,address spender) view returns (uint256)","function approve(address spender,uint256 amount) returns (bool)",
  "event Approval(address indexed owner,address indexed spender,uint256 value)",
]);
const client=createPublicClient({chain:sepolia,transport:http(LIVE_RPC_URL,{timeout:12_000,retryCount:1})});
const eq=(a?:string|null,b?:string|null)=>Boolean(a&&b&&a.toLowerCase()===b.toLowerCase());
const approvalRequest=(draft:PaymentDraft)=>({address:LIVE_USDC,abi:paymentTokenAbi,functionName:"approve" as const,args:[LIVE_STREAM,draft.amount] as const});
const creationRequest=(draft:PaymentDraft)=>({address:LIVE_STREAM,abi:paymentAbi,functionName:"createStream" as const,args:[draft.recipient as Address,LIVE_USDC,draft.amount,draft.start,draft.end,draft.cancelable] as const});
export async function quotePayment(token:WalletToken,draft:PaymentDraft):Promise<PaymentQuote>{
  validatePayment(draft);if(await client.getChainId()!==sepolia.id)throw new Error("claim.chainUnavailable");
  const block=await client.getBlock();if(block.number===null)throw new Error("claim.chainUnavailable");
  if(draft.start<block.timestamp||draft.end<=block.timestamp)throw new Error("create.startPassed");
  const account=token.account as Address,blockNumber=block.number;
  const [balance,allowance,gas]=await Promise.all([
    client.readContract({address:LIVE_USDC,abi:paymentTokenAbi,functionName:"balanceOf",args:[account],blockNumber,authorizationList:undefined}),
    client.readContract({address:LIVE_USDC,abi:paymentTokenAbi,functionName:"allowance",args:[account,LIVE_STREAM],blockNumber,authorizationList:undefined}),client.getBalance({address:account,blockNumber}),
  ]);
  if(balance<draft.amount)throw new Error("workspace.insufficientBalance");if(gas===0n)throw new Error("claim.gasInsufficient");
  const step=allowance<draft.amount?"approval":"create";
  // Narrow each ABI branch so viem retains the argument/result contracts.
  const simulated=step==="approval"?await client.simulateContract({...approvalRequest(draft),account,blockNumber,authorizationList:undefined}):await client.simulateContract({...creationRequest(draft),account,blockNumber,authorizationList:undefined});
  if(step==="approval"&&simulated.result!==true)throw new Error("create.simulationFailed");
  const [gasLimit,fees]=await Promise.all([step==="approval"?client.estimateContractGas({...approvalRequest(draft),account,authorizationList:undefined}):client.estimateContractGas({...creationRequest(draft),account,authorizationList:undefined}),client.estimateFeesPerGas({chain:sepolia,type:"eip1559"})]);
  const feeQuote=gasEstimate(gasLimit,fees,gas);
  return{draft:{...draft},account:token.account,token,step,allowance,block:blockNumber,at:block.timestamp,gasEstimate:feeQuote};
}
async function identity(r:PendingPayment,hash:Hash){
  if(!eq(r.contract,LIVE_STREAM)||!eq(r.tokenAddress,LIVE_USDC))return false;
  if(await client.getChainId()!==sepolia.id)throw new Error("claim.chainUnavailable");
  const tx=await client.getTransaction({hash});
  if(!eq(tx.from,r.account)||!tx.to||tx.value!==0n||(tx.chainId!==undefined&&tx.chainId!==sepolia.id))return false;
  const d=unpackPayment(r),target=r.step==="approval"?LIVE_USDC:LIVE_STREAM;
  const input=r.step==="approval"?encodeFunctionData(approvalRequest(d)):encodeFunctionData(creationRequest(d));
  if(eq(tx.to,target))return tx.input.toLowerCase()===input.toLowerCase();
  return true; // Wallet wrapper success still requires the exact authoritative event below.
}
function evidence(r:PendingPayment,receipt:TransactionReceipt):PaymentEvidence|undefined{
  const d=unpackPayment(r),matches:PaymentEvidence[]=[];
  for(const log of receipt.logs){
    if(log.removed||!Number.isSafeInteger(log.logIndex)||log.logIndex<0)continue;
    const topics=(log as {topics?:unknown}).topics;if(!Array.isArray(topics)||!topics.length||topics.some(t=>typeof t!=="string"||!/^0x[\da-f]{64}$/i.test(t)))continue;
    try{
      if(r.step==="approval"&&eq(log.address,LIVE_USDC)){
        const decoded=decodeEventLog({abi:paymentTokenAbi,eventName:"Approval",topics:topics as [Hash,...Hash[]],data:log.data,strict:true});
        if(eq(decoded.args.owner,r.account)&&eq(decoded.args.spender,LIVE_STREAM)&&decoded.args.value===d.amount)matches.push({hash:receipt.transactionHash,block:receipt.blockNumber});
      }
      if(r.step==="create"&&eq(log.address,LIVE_STREAM)){
        const decoded=decodeEventLog({abi:paymentAbi,eventName:"StreamCreated",topics:topics as [Hash,...Hash[]],data:log.data,strict:true}),a=decoded.args;
        if(a.streamId>0n&&eq(a.sender,r.account)&&eq(a.recipient,d.recipient)&&eq(a.token,LIVE_USDC)&&a.depositedAmount===d.amount&&a.startTime===d.start&&a.endTime===d.end&&a.cancelable===d.cancelable)matches.push({hash:receipt.transactionHash,block:receipt.blockNumber,streamId:a.streamId.toString()});
      }
    }catch{/* An unrelated event never proves escrow creation or approval. */}
  }
  return matches.length===1?matches[0]:undefined;
}
export function browserPaymentPorts(session:WalletSession,refresh:PaymentPorts["refresh"]):PaymentPorts{
  return{session,storage:paymentStorage(),quote:quotePayment,refresh,
    lock:async(account,fn)=>{if(!navigator.locks)throw new Error("claim.lockUnavailable");await navigator.locks.request(`vestora:claim:${LIVE_STREAM.toLowerCase()}:${account}`,{ifAvailable:true},async lock=>{if(!lock)throw new Error("claim.tabBusy");if(browserClaimStorage().read(account))throw new Error("create.otherPending");await fn();});},
    send:async q=>{
      try{await session.assertCurrent(q.token);}catch{throw new PaymentNotSubmitted("claim.sessionChanged");}
      const wallet=createWalletClient({chain:sepolia,account:q.account as Address,transport:custom(q.token.provider,{retryCount:0})});
      return q.step==="approval"?wallet.writeContract({...approvalRequest(q.draft),account:q.account as Address,chain:sepolia,authorizationList:undefined}):wallet.writeContract({...creationRequest(q.draft),account:q.account as Address,chain:sepolia,authorizationList:undefined});
    },
    receipt:async(r,replaced)=>{
      if(!r.hash)throw new Error("create.unknownHash");
      const receipt=await client.waitForTransactionReceipt({hash:r.hash,confirmations:2,timeout:120_000,pollingInterval:4_000,onReplaced:r=>replaced(r.transactionReceipt.transactionHash)});
      if(receipt.status!=="success")return "reverted";if(!await identity(r,receipt.transactionHash))return "replaced";
      const e=evidence(r,receipt);if(!e)throw new Error("create.receiptUnavailable");return e;
    },
    verifyRecovery:async(r,hash)=>{if(!await identity(r,hash))throw new Error("create.recoveryMismatch");const receipt=await client.getTransactionReceipt({hash});if(receipt.status!=="success"||!eq(receipt.transactionHash,hash)||!evidence(r,receipt))throw new Error("create.recoveryMismatch");},
    projected:async(r,e)=>{
      if(!e.streamId)return false;const response=await readApi(`/streams/${e.streamId}`,detailSchema),s=response.data,d=unpackPayment(r),block=response.meta.projection.latestProjectedBlock;
      return block!==null&&BigInt(block)>=e.block&&s.streamId===e.streamId&&eq(s.createdTxHash,e.hash)&&eq(s.sender,r.account)&&eq(s.recipient,d.recipient)&&eq(s.token,LIVE_USDC)&&BigInt(s.depositedAmount)===d.amount&&BigInt(Date.parse(s.startTime)/1000)===d.start&&BigInt(Date.parse(s.endTime)/1000)===d.end&&s.cancelable===d.cancelable;
    },
  };
}
