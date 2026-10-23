import { isAddress } from "viem";

export type InjectedProvider = {
  request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;
  on?:(event:string,listener:(value:unknown)=>void)=>void;
  removeListener?:(event:string,listener:(value:unknown)=>void)=>void;
};
export type WalletToken = { account:string; chainId:string; revision:number; provider:InjectedProvider };
export type WalletState = { address:string|null; chainId:string|null; state:"disconnected"|"connecting"|"connected"; error:string; revision:number; switching:boolean; disconnecting:boolean };
const firstAccount=(value:unknown)=>Array.isArray(value)&&typeof value[0]==="string"&&isAddress(value[0])?value[0].toLowerCase():null;
const chain=(value:unknown)=>typeof value==="string"&&/^0x[\da-f]+$/i.test(value)?`0x${BigInt(value).toString(16)}`:null;
function walletHasCode(error:unknown,codes:readonly number[]){
  const seen=new Set<object>();let current=error;
  while(current&&typeof current==="object"&&!seen.has(current)){seen.add(current);const e=current as {code?:unknown;cause?:unknown};if(typeof e.code==="number"&&codes.includes(e.code))return true;current=e.cause;}
  return false;
}
export const walletRejected=(error:unknown)=>walletHasCode(error,[4001]);

/** Synchronous revisions invalidate quotes before React has rendered a wallet event. */
export function createWalletSession(getProvider:()=>InjectedProvider|undefined){
  let state:WalletState={address:null,chainId:null,state:"disconnected",error:"",revision:0,switching:false,disconnecting:false};
  let eth:InjectedProvider|undefined,running=false,suppressed=false,ticket=0,lifecycle=0,connection:Promise<void>|null=null;
  let revocation:Promise<void>|null=null;
  const listeners=new Set<()=>void>();
  const commit=(patch:Partial<WalletState>)=>{state={...state,...patch,revision:state.revision+1};listeners.forEach(fn=>fn());};
  const sync=async()=>{
    const source=eth,id=++ticket;
    if(!source||!running||suppressed)return;
    try{
      const [accounts,idValue]=await Promise.all([source.request({method:"eth_accounts"}),source.request({method:"eth_chainId"})]);
      if(!running||source!==eth||id!==ticket||suppressed)return;
      const address=firstAccount(accounts),chainId=chain(idValue);
      if(address!==state.address||chainId!==state.chainId||state.state==="connecting")commit({address,chainId,state:address?"connected":"disconnected"});
    }catch{if(running&&source===eth&&id===ticket&&!suppressed)commit({address:null,chainId:null,state:"disconnected",error:"live.walletUnavailable"});}
  };
  const accounts=(value:unknown)=>{if(!running||suppressed)return;++ticket;const address=firstAccount(value);commit({address,state:address?"connected":"disconnected"});void sync();};
  const changed=(value:unknown)=>{if(!running||suppressed)return;++ticket;commit({chainId:chain(value)});void sync();};
  const lost=()=>{++ticket;++lifecycle;commit({address:null,chainId:null,state:"disconnected"});};
  const detach=()=>{eth?.removeListener?.("accountsChanged",accounts);eth?.removeListener?.("chainChanged",changed);eth?.removeListener?.("disconnect",lost);};
  const attach=()=>{
    const next=getProvider();if(next===eth)return;
    detach();eth=next;connection=null;++ticket;++lifecycle;commit({address:null,chainId:null,state:"disconnected",disconnecting:false});
    eth?.on?.("accountsChanged",accounts);eth?.on?.("chainChanged",changed);eth?.on?.("disconnect",lost);
  };
  const connect=()=>{
    attach();
    if(revocation)return revocation.catch(()=>{});
    if(connection)return connection;
    suppressed=false;
    if(!eth){commit({error:"live.noWallet"});return Promise.resolve();}
    const source=eth,version=++lifecycle;++ticket;commit({state:"connecting",error:""});
    connection=(async()=>{
      try{await source.request({method:"eth_requestAccounts"});if(running&&source===eth&&version===lifecycle&&!suppressed)await sync();}
      catch(error){if(running&&source===eth&&version===lifecycle&&!suppressed)commit({address:null,chainId:null,state:"disconnected",error:walletRejected(error)?"live.walletRejected":"live.walletUnavailable"});}
      finally{if(version===lifecycle)connection=null;}
    })();return connection;
  };
  // Local detach is also used for watch-only address lookup; it must not revoke permissions.
  const disconnect=()=>{suppressed=true;connection=null;++ticket;++lifecycle;commit({address:null,chainId:null,state:"disconnected",error:"",switching:false,disconnecting:false});};
  const revokeConnection=(expectedAccount:string):Promise<void>=>{
    attach();
    if(!eth||!state.address||state.address!==expectedAccount.toLowerCase())return Promise.reject(new Error("live.disconnectAccountChanged"));
    if(revocation)return revocation;
    const source=eth,version=++lifecycle;
    // Invalidate old quotes before the first await, without deleting pending receipts.
    suppressed=true;connection=null;++ticket;commit({disconnecting:true,error:"",switching:false});
    const current=()=>running&&source===eth&&getProvider()===source&&version===lifecycle;
    revocation=(async()=>{
      let requested=false;
      try{
        const before=await source.request({method:"eth_accounts"});
        if(!current()||firstAccount(before)!==expectedAccount.toLowerCase())throw new Error("live.disconnectAccountChanged");
        await source.request({method:"wallet_revokePermissions",params:[{eth_accounts:{}}]});
        requested=true;
        if(!current())throw new Error("live.disconnectAccountChanged");
        const permissions=await source.request({method:"wallet_getPermissions"});
        const remaining=await source.request({method:"eth_accounts"});
        if(!current())throw new Error("live.disconnectAccountChanged");
        if(!Array.isArray(permissions)||permissions.some(p=>!p||typeof p.parentCapability!=="string"||p.parentCapability==="eth_accounts")||!Array.isArray(remaining)||remaining.length)throw new Error("live.disconnectUnverified");
        commit({address:null,chainId:null,state:"disconnected",disconnecting:false,error:""});
      }catch(error){
        const reason=error instanceof Error&&["live.disconnectAccountChanged","live.disconnectUnverified"].includes(error.message)?error.message:requested?"live.disconnectUnverified":walletHasCode(error,[-32601,4200])?"live.disconnectUnsupported":walletRejected(error)?"live.disconnectRejected":"live.disconnectFailed";
        if(current()){suppressed=false;commit({disconnecting:false,error:reason});await sync();}
        throw new Error(reason);
      }finally{revocation=null;}
    })();
    return revocation;
  };
  const capture=():WalletToken=>{
    attach();
    if(!eth||suppressed||!state.address||state.state!=="connected")throw new Error("claim.walletRequired");
    if(state.chainId!=="0xaa36a7"||state.switching)throw new Error("claim.network");
    return {account:state.address,chainId:state.chainId,revision:state.revision,provider:eth};
  };
  const assertCurrent=async(token:WalletToken)=>{
    const valid=()=>running&&!suppressed&&getProvider()===token.provider&&eth===token.provider&&state.address===token.account&&state.chainId===token.chainId&&state.revision===token.revision&&!state.switching;
    if(!valid())throw new Error("claim.sessionChanged");
    const [a,c]=await Promise.all([token.provider.request({method:"eth_accounts"}),token.provider.request({method:"eth_chainId"})]);
    if(!valid()||firstAccount(a)!==token.account||chain(c)!==token.chainId){void sync();throw new Error("claim.sessionChanged");}
  };
  const switchChain=async()=>{
    if(revocation)return;
    attach();if(!eth){commit({error:"live.noWallet"});return;}
    const source=eth,version=lifecycle;commit({switching:true,error:""});
    try{await source.request({method:"wallet_switchEthereumChain",params:[{chainId:"0xaa36a7"}]});if(running&&source===eth&&version===lifecycle)await sync();}
    catch(error){if(running&&source===eth)commit({error:walletRejected(error)?"live.switchRejected":"live.switchFailed"});}
    finally{if(running&&source===eth)commit({switching:false});}
  };
  return {getSnapshot:()=>state,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
    start:()=>{running=true;attach();void sync();},stop:()=>{running=false;++ticket;++lifecycle;detach();eth=undefined;},
    connect,disconnect,revokeConnection,switchChain,capture,assertCurrent};
}
export type WalletSession=ReturnType<typeof createWalletSession>;
