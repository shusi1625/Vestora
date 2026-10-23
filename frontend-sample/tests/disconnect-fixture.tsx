import {useEffect,useState,useSyncExternalStore} from "react";
import {createRoot} from "react-dom/client";
import type {ContextType} from "react";
import {LiveConnection} from "../src/components/workspace/LiveConnection";
import {LiveWorkspaceContext} from "../src/providers/live-context";
import {createWalletSession} from "../src/lib/wallet-session";
import "../src/i18n/config";
import "../src/index.css";
import "../src/styles/workspace.css";

const account="0x1111111111111111111111111111111111111111";
type Mode="success"|"unsupported"|"rejected"|"unverified"|"delayed";
type Listener=(value:unknown)=>void;

/** No injected wallet, pending storage, API or RPC: provider lives only in this fixture. */
function makeProvider(){
  const listeners=new Map<string,Set<Listener>>();
  const provider={mode:"success" as Mode,granted:true,calls:[] as string[],complete:null as (()=>void)|null,
    emit(name:string,value:unknown){listeners.get(name)?.forEach(listener=>listener(value));},
    on(name:string,listener:Listener){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(listener);},
    removeListener(name:string,listener:Listener){listeners.get(name)?.delete(listener);},
    async request({method}:{method:string}){
      provider.calls.push(method);
      if(method==="eth_accounts")return provider.granted?[account]:[];
      if(method==="eth_chainId")return "0xaa36a7";
      if(method==="eth_requestAccounts"){provider.granted=true;return [account];}
      if(method==="wallet_getPermissions")return provider.granted?[{parentCapability:"eth_accounts"}]:[];
      if(method!=="wallet_revokePermissions")throw Error(`Unexpected wallet method ${method}`);
      if(provider.mode==="unsupported")throw {code:-32601};
      if(provider.mode==="rejected")throw {code:4001};
      if(provider.mode==="unverified")return null;
      if(provider.mode==="delayed")await new Promise<void>(resolve=>{provider.complete=resolve;setTimeout(resolve,1800);});
      provider.granted=false;provider.emit("accountsChanged",[]);return null;
    },
  };return provider;
}

export function Fixture(){
  const [provider]=useState(makeProvider),[session]=useState(()=>createWalletSession(()=>provider));
  const state=useSyncExternalStore(session.subscribe,session.getSnapshot);
  const [watched,setWatched]=useState<string|null>(null),[mode,setMode]=useState<Mode>("success");
  useEffect(()=>{session.start();return()=>session.stop();},[session]);
  const value={address:state.address||watched,connectedAddress:state.address,chainId:state.chainId,walletState:state.state,
    connect:()=>{setWatched(null);void session.connect();},disconnect:()=>{session.disconnect();setWatched(null);},
    revokeConnection:async(address:string)=>{await session.revokeConnection(address);setWatched(null);},
    switchChain:session.switchChain,switchingChain:state.switching,
    watchAddress:(address:string)=>{if(!/^0x[\da-f]{40}$/i.test(address))return false;session.disconnect();setWatched(address);return true;},
  } as ContextType<typeof LiveWorkspaceContext>;
  return <LiveWorkspaceContext.Provider value={value}><main className="page-container ws-main"><h1>Vestora · 연결 해제 테스트</h1>
    <div className="ws-heading-actions"><LiveConnection/></div>
    <div className="ws-form mt-8"><label>모의 지갑 응답<select value={mode} onChange={event=>{const next=event.target.value as Mode;setMode(next);provider.mode=next;}}><option value="success">정상 해제</option><option value="unsupported">권한 해제 미지원</option><option value="rejected">요청 거절</option><option value="unverified">해제 확인 실패</option><option value="delayed">늦게 완료</option></select></label><button type="button" onClick={()=>provider.complete?.()}>대기 중 요청 완료</button></div>
    <dl className="mt-8"><dt>앱 연결</dt><dd>{state.address||"연결 없음"}</dd><dt>지갑 권한</dt><dd>{provider.granted?"허용됨":"철회됨"}</dd><dt>해제 요청 횟수</dt><dd>{provider.calls.filter(method=>method==="wallet_revokePermissions").length}</dd></dl>
  </main></LiveWorkspaceContext.Provider>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
