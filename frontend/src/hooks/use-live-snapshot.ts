import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address } from "viem";
import { useInjectedWallet } from "./use-injected-wallet";
import { useClaimTransaction } from "./use-claim-transaction";
import { useCreatePayment } from "./use-create-payment";
import { useMarketAction } from "./use-market-action";
import { useCancelPayment } from "./use-cancel-payment";
import { useMintToken } from "./use-mint-token";
import { useLiveActionHistory } from "./use-live-action-history";
import { readApi, streamListSchema, tradeListSchema, detailSchema, type ApiStream } from "@/lib/live-api";
import { LIVE_API_BASE, LIVE_USDC } from "@/lib/live-config";
import { mapStream, mapListing, mapRecords, projectionTime } from "@/lib/live-mapping";
import { readBalances } from "@/lib/live-chain";
import type { DataCondition } from "@/lib/types";
import { runUiAction, uiMeasurement } from "@/lib/ui-measurement";
import type {TxRecord} from "@/lib/types";
const EMPTY_HISTORY:TxRecord[]=[];

async function readHistory(streams:ApiStream[], address:string, cutoff:Date, signal:AbortSignal, batchId?:string) {
  signal.throwIfAborted();
  const trades=await readApi(`/users/${address}/trades`,tradeListSchema,signal,batchId);
  const details:ApiStream[]=[];
  // Leave capacity for other clients on the guarded, two-slot public API.
  for(const stream of streams){
    signal.throwIfAborted();
    const detail=await readApi(`/streams/${stream.streamId}`,detailSchema,signal,batchId);
    if(detail.data.streamId!==stream.streamId || !Array.isArray(detail.data.claims))throw new Error("Incomplete claim history");
    details.push(detail.data);
  }
  signal.throwIfAborted();
  const map=()=>mapRecords(details,trades.data,address,cutoff,LIVE_USDC);
  return uiMeasurement?uiMeasurement.span(batchId,"map-history",map):map();
}

export function useLiveSnapshot() {
  const wallet=useInjectedWallet(), [watched,setWatched]=useState<string|null>(uiMeasurement?.watchedAddress??null);
  const address=wallet.address || watched;
  const query=useQuery({
    queryKey:["live-workspace",LIVE_API_BASE,address],
    queryFn:async({signal})=>{
      const batchId=uiMeasurement?.beginBatch();
      try{
        const response=await readApi("/streams",streamListSchema,signal,batchId), projection=response.meta.projection;
        const map=()=>{
          const now=projectionTime(projection), claims=response.data.flatMap(stream=>{const claim=mapStream(stream,projection,LIVE_USDC);return claim?[claim]:[];});
          const ids=new Set(claims.map(c=>c.id));
          const listings=response.data.filter(s=>ids.has(s.streamId)).flatMap(s=>{const listing=mapListing(s);return listing?[listing]:[];});
          return {now,claims,listings};
        };
        const {now,claims,listings}=uiMeasurement?uiMeasurement.span(batchId,"map-streams",map):map();
        const [balanceResult,historyResult]=address ? await Promise.allSettled([
          readBalances(address as Address,BigInt(projection.latestProjectedBlock!)), readHistory(response.data,address,now,signal,batchId),
        ]) : [];
        signal.throwIfAborted();
        const result={claims,listings,projection,now,unsupported:response.data.length-claims.length,
          balance:balanceResult?.status==="fulfilled"?balanceResult.value:null,
          history:historyResult?.status==="fulfilled"?historyResult.value:null};
        if(batchId)uiMeasurement?.bindSnapshot(claims,batchId);
        return result;
      }catch(error){if(batchId)uiMeasurement?.failBatch(batchId,error instanceof Error?error.name:"unknown");throw error;}
    },
    retry:1, staleTime:10_000, gcTime:60_000, refetchInterval:15_000, refetchIntervalInBackground:false, refetchOnWindowFocus:"always",
    ...(uiMeasurement?{retry:false,staleTime:Infinity,structuralSharing:false,refetchInterval:false,refetchOnWindowFocus:false}:{}),
  });
  const data=query.data;
  let condition:DataCondition=query.isPending||!data&&query.isFetching?"loading":!data?"failure":query.isError?"stale":"normal";
  if(data && !query.isError){
    const p=data.projection;
    if(p.projectionStatus!=="applied" || BigInt(p.latestProjectedBlock!)<BigInt(p.latestIndexedBlock))condition="pending-index";
    else if(p.status!=="synced" || Date.now()-data.now.getTime()>120_000)condition="stale";
  }
  const refresh=()=>runUiAction({action:"workspace.refresh",surface:"active",requiresDataChange:true},()=>{void query.refetch();});
  const refreshAccount=async(account:string)=>{
    if(address!==account)return;
    const result=await query.refetch();
    if(result.isError||!result.data?.balance||!result.data?.history)throw new Error("claim.refreshWarning");
  };
  const claim=useClaimTransaction(wallet.session,refreshAccount);
  const creation=useCreatePayment(wallet.session,refreshAccount);
  const market=useMarketAction(wallet.session,refreshAccount);
  const cancellation=useCancelPayment(wallet.session,refreshAccount);
  const mint=useMintToken(wallet.session,refreshAccount);
  const history=useLiveActionHistory(address,data?.history||EMPTY_HISTORY,{claim:claim.engine,creation:creation.engine,market:market.engine,cancellation:cancellation.engine,mint:mint.engine});
  const watchAddress=(value:string)=>{if(!isAddress(value))return false;wallet.disconnect();setWatched(value.toLowerCase());return true;};
  const connect=()=>{setWatched(null);void wallet.connect();};
  const disconnect=()=>{wallet.disconnect();setWatched(null);};
  const revokeConnection=async(account:string)=>{await wallet.session.revokeConnection(account);setWatched(null);};
  return {source:"live" as const,executionMode:"all" as const,claim,creation,market,cancellation,mint,claims:data?.claims||[],listings:data?.listings||[],records:history.records,historyWarning:history.warning,
    balances:data?.balance?.balances||[],gasRaw:data?.balance?.gasRaw??null,balancesReady:Boolean(data?.balance),historyReady:Boolean(data?.history),
    now:data?.now||new Date(NaN),address,accountKey:address||"",canTransact:Boolean(wallet.address&&wallet.chainId==="0xaa36a7"&&wallet.state==="connected"),refresh,connect,disconnect,revokeConnection,watchAddress,
    connectedAddress:wallet.address,chainId:wallet.chainId,walletState:wallet.state,walletError:wallet.error,switchChain:wallet.switchChain,switchingChain:wallet.switching,
    projection:data?.projection||null,unsupported:data?.unsupported||0,isRefreshing:query.isFetching,
    scenario:{dataCondition:condition,screens:{market:"normal",assets:"normal"}},paymentTokens:["MockUSDC"] as ("MockUSDC"|"mWETH")[]};
}
