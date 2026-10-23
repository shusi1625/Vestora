import { useEffect, useState, useSyncExternalStore } from "react";
import { createWalletSession, type InjectedProvider } from "@/lib/wallet-session";

export function useInjectedWallet(){
  const [session]=useState(()=>createWalletSession(()=> (window as Window & {ethereum?:InjectedProvider}).ethereum));
  const state=useSyncExternalStore(session.subscribe,session.getSnapshot);
  useEffect(()=>{session.start();return()=>session.stop();},[session]);
  return {...state,connect:session.connect,disconnect:session.disconnect,switchChain:session.switchChain,session};
}
