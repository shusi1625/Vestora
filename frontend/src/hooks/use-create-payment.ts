import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import type {WalletSession} from "@/lib/wallet-session";
import {createPaymentEngine} from "@/lib/create-payment-engine";
import {browserPaymentPorts} from "@/lib/create-payment-chain";
import {assertNoOtherLivePending} from "@/lib/transaction-guard";

export function useCreatePayment(session:WalletSession,refresh:(account:string)=>Promise<void>){
  const refreshRef=useRef(refresh);refreshRef.current=refresh;
  const [engine]=useState(()=>createPaymentEngine(browserPaymentPorts(session,a=>refreshRef.current(a),a=>assertNoOtherLivePending(a,"create"))));
  const states=useSyncExternalStore(engine.subscribe,engine.getSnapshot),wallet=useSyncExternalStore(session.subscribe,session.getSnapshot);
  useEffect(()=>{engine.invalidate();},[engine,wallet.revision]);
  useEffect(()=>{
    if(!wallet.address)return;const account=wallet.address;engine.restore(account);
    const check=()=>{if(document.visibilityState!=="visible")return;const s=engine.getSnapshot()[account];if(s?.pending?.hash&&["unknown","submitted","indexing"].includes(s.phase))void engine.resume(account);};
    check();const timer=window.setInterval(check,15_000);document.addEventListener("visibilitychange",check);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",check);};
  },[engine,wallet.address]);
  return{engine,states};
}
