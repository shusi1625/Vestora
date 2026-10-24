import {useEffect,useMemo,useSyncExternalStore} from "react";
import {createLiveActionHistoryJournal,type LiveActionHistorySnapshot} from "@/lib/live-action-history";
import {LIVE_MARKET,LIVE_STREAM,LIVE_USDC} from "@/lib/live-config";
import {uiMeasurement} from "@/lib/ui-measurement";
import type {TxRecord} from "@/lib/types";
import type {ClaimEngine} from "@/lib/claim-engine";
import type {createPaymentEngine} from "@/lib/create-payment-engine";
import type {MarketActionEngine} from "@/lib/market-action-engine";
import type {CancelPaymentEngine} from "@/lib/cancel-payment-engine";
import type {MintTokenEngine} from "@/lib/mint-token-engine";

type Engines={claim:ClaimEngine;creation:ReturnType<typeof createPaymentEngine>;market:MarketActionEngine;cancellation:CancelPaymentEngine;mint:MintTokenEngine};
const emptyState:LiveActionHistorySnapshot={revision:0,rows:[]};
const emptySnapshot=()=>emptyState,emptySubscribe=()=>()=>{};

/** Display-only history observes transitions synchronously; it never drives a send. */
export function useLiveActionHistory(address:string|null,apiRows:TxRecord[],engines:Engines){
  const journal=useMemo(()=>address?createLiveActionHistoryJournal({account:address,chainId:11155111,streamContract:LIVE_STREAM,marketContract:LIVE_MARKET,tokenContract:LIVE_USDC},uiMeasurement?{storage:null}:{}):null,[address]);
  const state=useSyncExternalStore(journal?.subscribe||emptySubscribe,journal?.getSnapshot||emptySnapshot);
  const {claim,creation,market,cancellation,mint}=engines;
  useEffect(()=>{
    if(!address||!journal)return;
    const sources=[["claim",claim],["create",creation],["market",market],["cancel",cancellation],["mint",mint]] as const;
    const stops=sources.map(([kind,engine])=>{
      const observe=()=>{journal.observe(kind,engine.getSnapshot()[address],address);};
      const stop=engine.subscribe(observe);observe();return stop;
    });
    return()=>stops.forEach(stop=>stop());
  },[journal,address,claim,creation,market,cancellation,mint]);
  const merged=journal?journal.merge(apiRows):apiRows;
  const records=useMemo<TxRecord[]>(()=>[...merged],[merged]);
  return{records,warning:state.warning||journal?.getMergeWarning()};
}
