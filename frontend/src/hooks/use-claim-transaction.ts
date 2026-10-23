import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import type {WalletSession} from "@/lib/wallet-session";
import {createClaimEngine} from "@/lib/claim-engine";
import {browserClaimPorts} from "@/lib/claim-chain";

export function useClaimTransaction(session:WalletSession,refresh:(account:string)=>Promise<void>){
  const refreshRef=useRef(refresh);refreshRef.current=refresh;
  const [engine]=useState(()=>createClaimEngine(browserClaimPorts(session,account=>refreshRef.current(account))));
  const states=useSyncExternalStore(engine.subscribe,engine.getSnapshot);
  const wallet=useSyncExternalStore(session.subscribe,session.getSnapshot);
  useEffect(()=>{engine.invalidateReviews();},[engine,wallet.revision]);
  useEffect(()=>{
    if(!wallet.address)return;
    const account=wallet.address;engine.restore(account);
    const check=()=>{if(document.visibilityState!=="visible")return;const state=engine.getSnapshot()[account];if(["unknown","submitted","indexing"].includes(state?.phase)&&state?.pending?.hash)void engine.resume(account);};
    check();const timer=window.setInterval(check,15_000);document.addEventListener("visibilitychange",check);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",check);};
  },[engine,wallet.address]);
  return {engine,states};
}
