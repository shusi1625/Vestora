import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import type {WalletSession} from "@/lib/wallet-session";
import {browserCancelPaymentPorts} from "@/lib/cancel-payment-chain";
import {createCancelPaymentEngine} from "@/lib/cancel-payment-engine";
import {assertNoOtherLivePending} from "@/lib/transaction-guard";

export function useCancelPayment(session:WalletSession,refresh:(account:string)=>Promise<void>){
  const refreshRef=useRef(refresh);refreshRef.current=refresh;
  const [engine]=useState(()=>{
    const ports=browserCancelPaymentPorts(session,account=>refreshRef.current(account));
    ports.assertNoOtherPending=account=>assertNoOtherLivePending(account,"cancel");
    return createCancelPaymentEngine(ports);
  });
  const states=useSyncExternalStore(engine.subscribe,engine.getSnapshot),wallet=useSyncExternalStore(session.subscribe,session.getSnapshot);
  useEffect(()=>{engine.invalidate();},[engine,wallet.revision]);
  useEffect(()=>{
    if(!wallet.address)return;const account=wallet.address;engine.restore(account);
    const check=()=>{const state=engine.getSnapshot()[account];if(document.visibilityState==="visible"&&state?.pending?.hash&&["unknown","submitted","indexing"].includes(state.phase))void engine.resume(account);};
    check();const timer=window.setInterval(check,15_000);document.addEventListener("visibilitychange",check);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",check);};
  },[engine,wallet.address]);
  return{engine,states};
}
