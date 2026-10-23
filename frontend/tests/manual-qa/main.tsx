import {useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import App from "../../src/App";
import {qaWallet,A,B} from "./wallet";
import {claimPendingKey} from "../../src/lib/claim-policy";
import {pendingPaymentKey} from "../../src/lib/create-payment-model";
import {LIVE_STREAM} from "../../src/lib/live-config";
import {installQaPerformance,qaPerformanceSnapshot,qaPerformanceReset} from "./performance";
import "../../src/i18n/config";
import "../../src/index.css";

const base="http://127.0.0.1:4391";
const cases=["normal","E01-timeout","E02-refresh","E03-429","E03-500","E03-502","E03-json","E03-schema","E04-chain","E04-address","E04-accounting","E04-sync","E04-token","E05-balance","E06-trades","E06-detail","E07-null","E07-pending","E07-time-mismatch","E07-computed-time","E07-not-started","E08-chain","E08-simulate","E09-missing","E09-reject","E10-account","E10-network","E11-reject","E12-nohash","E12-wallet-gas","E13-storage","E13-locks","E14-legacy","E14-corrupt","E14-version","E14-contract","E14-account","E14-chain","E15-double","E16-owner","E16-withdrawn","E16-balance","E16-allowance","E17-receipt","E18-reprice","E19-replaced","E20-revert","E21-wrapper","E22-event","E22-recipient","E22-amount","E22-contract","E22-missing","E22-duplicate","E23-api","E23-rpc","E24-proof","E25-recovery","E25-id","E25-sender","E25-pending","E26-late","B22-zero","B22-one","B23-equal","B23-plus","B23-minus","B24-zero","B24-minus","B24-equal","B24-plus","B24-maxfee","B25-empty","B25-one","B25-two","B25-zero-assets","B26-tied"];
type Status={mode:string;apiRequests:number;rpcRequests:number;sendCount:number;projected:boolean;lastMethods:string[]};
const nativeStorage=window.localStorage;
const pendingKeys=[A,B].flatMap(account=>[claimPendingKey(account,LIVE_STREAM),pendingPaymentKey(account)]);
async function control(path:string,body:object={}){return fetch(`${base}/qa/${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});}

export function Controls({initialMode}:{initialMode:string}){
  const [mode,setMode]=useState(initialMode),[status,setStatus]=useState<Status|null>(null);
  const [perf,setPerf]=useState<ReturnType<typeof qaPerformanceSnapshot>|null>(null);
  const read=()=>fetch(`${base}/qa/status`).then(r=>r.json()).then(setStatus);
  useEffect(()=>{void read();},[]);
  return <aside style={{padding:12,borderBottom:"2px solid #96571a",background:"#fff7e8",fontSize:13}} aria-label="격리 테스트 제어"><strong>LOCAL FIXTURE · 실제 지갑·백엔드·온체인 사용 안 함</strong><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
    <label>테스트 케이스 <select value={mode} onChange={e=>setMode(e.target.value)}>{[...cases,"P01-10","P01-100","P01-1000","P02-harness"].map(value=><option key={value}>{value}</option>)}</select></label>
    <button onClick={async()=>{await control("case",{mode});for(const key of pendingKeys)nativeStorage.removeItem(key);location.reload();}}>케이스 적용·테스트 기록 초기화</button>
    <button onClick={()=>qaWallet.select(A)}>모의 계정 A</button><button onClick={()=>qaWallet.select(B)}>모의 계정 B</button>
    <button onClick={()=>qaWallet.network("0x1")}>모의 잘못된 네트워크</button><button onClick={()=>qaWallet.network("0xaa36a7")}>모의 Sepolia</button><button onClick={()=>qaWallet.inject()}>모의 지갑 주입</button>
    <button onClick={async()=>{await control("failure");await read();}}>다음 API 갱신 실패</button><button onClick={async()=>{await control("recover");await read();}}>통신·인덱서 복구</button><button onClick={()=>void read()}>관측 수치 읽기</button></div>
    <button onClick={async()=>{await control("applied");await read();}}>인덱서 체크포인트만 적용</button>
    <button onClick={async()=>{await control("change");await read();}}>검토 후 온체인 조건 변경</button>
    <button onClick={()=>setPerf(qaPerformanceSnapshot())}>성능 관측 읽기</button>
    <button onClick={()=>{qaPerformanceReset();setPerf(null);}}>입력 관측 초기화</button>
    {perf&&<details open><summary>성능 관측 원문</summary><output aria-label="성능 관측" style={{display:"block",maxHeight:180,overflow:"auto",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(perf)}</output></details>}
    <output style={{display:"block",marginTop:8,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}} aria-label="격리 관측">{JSON.stringify(status)}</output>
  </aside>;
}
async function start(){
  installQaPerformance();
  const status=await fetch(`${base}/qa/status`).then(r=>r.json());qaWallet.configure(status.mode);
  if(status.mode==="E13-storage")Object.defineProperty(window,"localStorage",{value:{getItem:(key:string)=>nativeStorage.getItem(key),setItem:(key:string,value:string)=>{if(pendingKeys.includes(key))throw Error("fixture storage unavailable");nativeStorage.setItem(key,value);},removeItem:(key:string)=>nativeStorage.removeItem(key)}});
  if(status.mode==="E13-locks")Object.defineProperty(navigator,"locks",{value:undefined,configurable:true});
  if(status.mode==="E14-corrupt")nativeStorage.setItem(claimPendingKey(B,LIVE_STREAM),"{invalid pending");
  if(status.mode==="E14-legacy"&&!nativeStorage.getItem(claimPendingKey(B,LIVE_STREAM)))nativeStorage.setItem(claimPendingKey(B,LIVE_STREAM),JSON.stringify({version:1,account:B,contract:LIVE_STREAM,chainId:11155111,id:"3",createdAt:123}));
  if(["E14-version","E14-contract","E14-account","E14-chain"].includes(status.mode)){
    const record={version:1,account:B,contract:LIVE_STREAM,chainId:11155111,id:"3",createdAt:Date.now(),...(status.mode==="E14-version"?{version:2}:status.mode==="E14-contract"?{contract:A}:status.mode==="E14-account"?{account:A}:{chainId:1})};
    nativeStorage.setItem(claimPendingKey(B,LIVE_STREAM),JSON.stringify(record));
  }
  createRoot(document.getElementById("root")!).render(<><Controls initialMode={status.mode}/><App/></>);
}
void start();
