import {useEffect,useState,useSyncExternalStore} from "react";
import {createWalletSession} from "../../src/lib/wallet-session";
import {InsufficientFundsError} from "viem";

export const A="0x1111111111111111111111111111111111111111",B="0x2222222222222222222222222222222222222222";
export const C="0x3333333333333333333333333333333333333333";
type Listener=(value:unknown)=>void;
const listeners=new Map<string,Set<Listener>>();
let available=true,mode="normal",accounts=[B],chain="0xaa36a7",loseNextHash=false;
const initialAccount=()=>mode.startsWith("parity-")?A:B;
export const qaWallet={
  configure(value:string){mode=value;available=value!=="E09-missing";accounts=value==="E09-reject"?[]:[initialAccount()];chain="0xaa36a7";loseNextHash=false;},
  loseNextResponse(){loseNextHash=true;},
  select(account:string){accounts=account?[account]:[];qaWallet.emit("accountsChanged",accounts);},
  network(value:string){chain=value;qaWallet.emit("chainChanged",chain);},
  inject(){available=true;},
  emit(name:string,value:unknown){listeners.get(name)?.forEach(fn=>fn(value));},
  on(name:string,fn:Listener){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(fn);},
  removeListener(name:string,fn:Listener){listeners.get(name)?.delete(fn);},
  async request({method,params}:{method:string;params?:unknown[]}){
    if(method==="eth_accounts")return accounts;
    if(method==="eth_chainId")return chain;
    if(method==="wallet_getPermissions")return accounts.length?[{parentCapability:"eth_accounts"}]:[];
    if(method==="wallet_requestPermissions"){if(mode==="E09-reject")throw {code:4001};if(!accounts.length)accounts=[initialAccount()];return [{parentCapability:"eth_accounts"}];}
    if(method==="wallet_revokePermissions"){accounts=[];qaWallet.emit("accountsChanged",[]);return null;}
    if(method==="eth_requestAccounts"){if(mode==="E09-reject")throw {code:4001};if(!accounts.length)accounts=[initialAccount()];return accounts;}
    if(method==="wallet_switchEthereumChain"){qaWallet.network((params?.[0] as {chainId:string}).chainId);return null;}
    if(method==="eth_sendTransaction"){
      if(mode==="E11-reject")throw {code:4001};
      if(mode==="E12-wallet-gas")throw new InsufficientFundsError({});
      const tx=params?.[0] as {from?:string}|undefined;
      if(chain!=="0xaa36a7"||!tx?.from||tx.from.toLowerCase()!==accounts[0]?.toLowerCase())throw {code:4100};
      const response=await fetch("http://127.0.0.1:4391/qa/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(tx),signal:AbortSignal.timeout(5000),redirect:"error"});
      const result=await response.json();
      if(!response.ok||typeof result.hash!=="string"||!/^0x[\da-f]{64}$/i.test(result.hash))throw Error("fixture transaction refused");
      const lost=loseNextHash;loseNextHash=false;
      if(lost||mode==="E12-nohash"||mode.startsWith("E25-")&&mode!=="E25-recovery")throw Error("fixture transport lost after submission");
      return result.hash;
    }
    throw Error(`QA provider refuses ${method}`);
  },
};
export function useInjectedWallet(){
  const [session]=useState(()=>createWalletSession(()=>available?qaWallet:undefined));
  const state=useSyncExternalStore(session.subscribe,session.getSnapshot);
  useEffect(()=>{session.start();return()=>session.stop();},[session]);
  return {...state,connect:session.connect,disconnect:session.disconnect,revokeConnection:session.revokeConnection,switchChain:session.switchChain,session};
}
