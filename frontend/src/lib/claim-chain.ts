import {createPublicClient,createWalletClient,http,custom,parseAbi,decodeEventLog,encodeFunctionData,type Address,type Hash,type TransactionReceipt} from "viem";
import {sepolia} from "viem/chains";
import {LIVE_RPC_URL,LIVE_STREAM,LIVE_USDC} from "./live-config";
import type {WalletSession,WalletToken} from "./wallet-session";
import {browserClaimStorage} from "./claim-storage";
import {assertNoOtherLivePending,withLiveTransactionLock} from "./transaction-guard";
import {ClaimNotSubmitted,projectionHasClaim,type PendingClaim,type ClaimQuote,type ClaimEvidence} from "./claim-policy";
import type {ClaimPorts} from "./claim-engine";
import {readApi,detailSchema} from "./live-api";
import {gasEstimate} from "./transaction-safety";

export const claimAbi=parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getStream(uint256 streamId) view returns ((address sender,address token,uint256 depositedAmount,uint64 startTime,uint64 endTime,uint256 withdrawnAmount,bool cancelable,bool canceled,uint64 canceledAt))",
  "function claimableAmount(uint256 streamId) view returns (uint256)",
  "function claim(uint256 streamId) returns (uint256 amount)",
  "event StreamClaimed(uint256 indexed streamId,address indexed recipient,uint256 amount)",
]);
const client=createPublicClient({chain:sepolia,transport:http(LIVE_RPC_URL,{timeout:12_000,retryCount:1})});
const contract={address:LIVE_STREAM,abi:claimAbi,authorizationList:undefined};
const equals=(a?:string|null,b?:string|null)=>Boolean(a&&b&&a.toLowerCase()===b.toLowerCase());
const idOf=(id:string)=>{if(!/^\d+$/.test(id)||BigInt(id)<=0n)throw new Error("claim.invalidId");return BigInt(id);};
const inputFor=(id:string)=>encodeFunctionData({abi:claimAbi,functionName:"claim",args:[idOf(id)]});
async function transactionKind(record:PendingClaim,hash:Hash){
  if(await client.getChainId()!==sepolia.id)throw new Error("claim.chainUnavailable");
  const tx=await client.getTransaction({hash});
  if(!equals(record.contract,LIVE_STREAM)||!equals(tx.from,record.account)||!tx.to||tx.value!==0n||(tx.chainId!==undefined&&tx.chainId!==sepolia.id))return "mismatch";
  if(equals(tx.to,LIVE_STREAM))return tx.input.toLowerCase()===inputFor(record.id).toLowerCase()?"direct":"mismatch";
  return "wrapped";
}
function claimEvidence(record:PendingClaim,receipt:TransactionReceipt):ClaimEvidence|undefined{
  const matches:ClaimEvidence[]=[];
  for(const log of receipt.logs){
    if(!equals(log.address,LIVE_STREAM)||log.removed||!Number.isSafeInteger(log.logIndex)||log.logIndex<0)continue;
    const topics=(log as {topics?:unknown}).topics;
    if(!Array.isArray(topics)||!topics.length||topics.some(t=>typeof t!=="string"||!/^0x[\da-f]{64}$/i.test(t)))continue;
    try{const event=decodeEventLog({abi:claimAbi,eventName:"StreamClaimed",data:log.data,topics:topics as [Hash,...Hash[]],strict:true}) as {eventName?:unknown;args?:{streamId?:unknown;recipient?:unknown;amount?:unknown}};
      if(event.eventName==="StreamClaimed"&&event.args?.streamId===idOf(record.id)&&typeof event.args.recipient==="string"&&equals(event.args.recipient,record.account)&&typeof event.args.amount==="bigint"&&event.args.amount>0n){
        matches.push({hash:receipt.transactionHash,block:receipt.blockNumber,amount:event.args.amount,logIndex:log.logIndex});
      }
    }catch{/* Unrelated logs are not claim evidence. */}
  }
  // The deployed stream emits this event only after its owner check and token transfer.
  // That receipt proof also covers wallet-wrapped calls without trusting a router address.
  return matches.length===1?matches[0]:undefined;
}
export async function readClaimQuote(token:WalletToken,id:string):Promise<ClaimQuote>{
  if(await client.getChainId()!==sepolia.id)throw new Error("claim.chainUnavailable");
  const block=await client.getBlock(),streamId=idOf(id),account=token.account as Address;
  if(block.number===null)throw new Error("claim.chainUnavailable");
  const blockNumber=block.number;
  const [owner,stream,amount,gas]=await Promise.all([
    client.readContract({...contract,functionName:"ownerOf",args:[streamId],blockNumber}),
    client.readContract({...contract,functionName:"getStream",args:[streamId],blockNumber}),
    client.readContract({...contract,functionName:"claimableAmount",args:[streamId],blockNumber}),
    client.getBalance({address:account,blockNumber}),
  ]);
  if(!equals(owner,account))throw new Error("claim.notOwner");
  if(!equals(stream.token,LIVE_USDC))throw new Error("claim.tokenUnsupported");
  if(amount<=0n)throw new Error("claim.nothing");
  if(gas===0n)throw new Error("claim.gasInsufficient");
  const simulation=await client.simulateContract({...contract,functionName:"claim",args:[streamId],account,blockNumber});
  if(simulation.result!==amount)throw new Error("claim.conditionsChanged");
  const [gasLimit,fees]=await Promise.all([
    client.estimateContractGas({...contract,functionName:"claim",args:[streamId],account}),client.estimateFeesPerGas({chain:sepolia,type:"eip1559"}),
  ]);
  const feeQuote=gasEstimate(gasLimit,fees,gas);
  return {id,account:token.account,amount,withdrawn:stream.withdrawnAmount,block:blockNumber,at:block.timestamp,token,gasEstimate:feeQuote};
}
export function browserClaimPorts(session:WalletSession,refresh:(account:string)=>Promise<void>):ClaimPorts{
  const storage=browserClaimStorage();
  return {contract:LIVE_STREAM,session,storage,quote:readClaimQuote,refresh,
    assertNoOtherPending:account=>assertNoOtherLivePending(account,"claim"),
    lock:(account,action)=>withLiveTransactionLock(account,"claim",action,{checkPending:false}),
    send:async quote=>{
      try{await session.assertCurrent(quote.token);}catch{throw new ClaimNotSubmitted("claim.sessionChanged");}
      const wallet=createWalletClient({chain:sepolia,account:quote.account as Address,transport:custom(quote.token.provider,{retryCount:0})});
      return wallet.writeContract({...contract,chain:sepolia,functionName:"claim",args:[idOf(quote.id)],account:quote.account as Address});
    },
    receipt:async(record,onReplacement)=>{
      if(!record.hash)throw new Error("claim.unknownHash");
      const receipt=await client.waitForTransactionReceipt({hash:record.hash,confirmations:2,timeout:120_000,pollingInterval:4_000,onReplaced:replacement=>onReplacement(replacement.transactionReceipt.transactionHash)});
      if(receipt.status!=="success")return "reverted";
      if(await transactionKind(record,receipt.transactionHash)==="mismatch")return "replaced";
      const evidence=claimEvidence(record,receipt);
      if(evidence)return evidence;
      throw new Error("claim.receiptUnavailable");
    },
    verifyRecovery:async(record,hash)=>{
      if(await transactionKind(record,hash)==="mismatch")throw new Error("claim.recoveryMismatch");
      const receipt=await client.getTransactionReceipt({hash});
      if(receipt.status!=="success"||!equals(receipt.transactionHash,hash)||!claimEvidence(record,receipt))throw new Error("claim.recoveryMismatch");
    },
    projected:async(record,evidence)=>{
      const response=await readApi(`/streams/${record.id}`,detailSchema);
      return projectionHasClaim(response.meta.projection.latestProjectedBlock,evidence,response.data.claims||[],record.account,record.id);
    },
  };
}
