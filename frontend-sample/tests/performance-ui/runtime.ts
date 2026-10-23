import {useLayoutEffect} from "react";
import type {UiAction,UiMeasurementPort,UiSample} from "../../src/lib/ui-measurement";
import {createUiRecorder} from "./recorder";
import {createInputRecorder} from "./input-recorder";
import {createBrowserVitals} from "./browser-observer";

const recorder=createUiRecorder({clock:()=>performance.now(),frame:fn=>requestAnimationFrame(fn),cancelFrame:cancelAnimationFrame,
  environment:()=>({visibility:document.visibilityState,focused:document.hasFocus(),width:innerWidth,height:innerHeight})});
const inputs=createInputRecorder({clock:()=>performance.now(),frame:fn=>requestAnimationFrame(fn),cancelFrame:cancelAnimationFrame,
  setTimer:(fn,ms)=>window.setTimeout(fn,ms),clearTimer:id=>window.clearTimeout(id as number),
  environment:()=>({visibility:document.visibilityState,focused:document.hasFocus(),width:innerWidth,height:innerHeight}),
  onSettled:value=>{
    const output=document.getElementById("qa-input-progress");if(!output)return;
    output.dataset.lastInput=value.id;output.dataset.valid=String(value.valid);
    output.textContent=`${value.id} · ${value.valid?"frame":value.reasons.join(", ")}`;
  }});
const vitals=createBrowserVitals({performance,Observer:typeof PerformanceObserver==="undefined"?undefined:PerformanceObserver,
  clock:()=>performance.now(),environment:()=>({visibility:document.visibilityState,focused:document.hasFocus()}),maxResources:2000});
const resourceTimingBuffer={requested:2500,configured:false,overflowObserved:false};
const lifecycle:{at:number;visibility:string;focused:boolean}[]=[];let lifecycleDropped=0;
const currentStates=new Map<string,string>();
const watched=import.meta.env.VITE_QA_WATCH_ADDRESS as string|undefined;
const mode=import.meta.env.VITE_QA_MODE??"fixture";
const actual=mode==="actual-api";
const expectedDigest=import.meta.env.VITE_QA_PLAN_DIGEST as string|undefined;
const expectedPaths:readonly string[]=Object.freeze(actual?JSON.parse(import.meta.env.VITE_QA_ALLOWED_PATHS??"[]"):[]);
const allowedPaths=new Set(expectedPaths);
type ReadSession=Readonly<{runId:string;planDigest:string;expiresAt:string}>;
let readSession:ReadSession|null=null,sessionFailed=false;
if(watched&&!/^0x[\da-f]{40}$/i.test(watched))throw Error("Invalid QA watch-only address");
export const uiMeasurement:UiMeasurementPort={...recorder,watchedAddress:watched?.toLowerCase()??null};
export function useUiMeasurement({data,surface,stateKey,rowCount,condition}:UiSample){
  useLayoutEffect(()=>{
    currentStates.set(surface,stateKey);
    const sample={data,surface,stateKey,rowCount,condition},apiCleanup=recorder.commit(sample),inputCleanup=inputs.commit(sample);
    return()=>{apiCleanup();inputCleanup();};
  },[data,surface,stateKey,rowCount,condition]);
}
export function runUiAction<T>(action:UiAction,run:()=>T):T {
  const surface=action.surface==="active"?(location.pathname==="/market"?"market":location.pathname==="/assets"?"assets":null):action.surface;
  if(surface)inputs.beginAction({...action,surface});else inputs.interrupt("unsupported-surface");
  try{return run();}catch(error){inputs.interrupt("handler-error");throw error;}
}
const fontEnvironment=()=>{
  const faces=document.fonts?[...document.fonts]:null;
  const loaded=faces?[...new Set(faces.filter(face=>face.status==="loaded").map(face=>face.family))]:null;
  return {status:document.fonts?.status??null,declaredFaces:faces?.length??null,loadedFamilies:loaded?.slice(0,20)??null,
    familiesTruncated:loaded?loaded.length>20:null,declaredMainFamily:document.querySelector("main")?getComputedStyle(document.querySelector("main")!).fontFamily:null};
};
export function uiPerformanceSnapshot(){return {
  ...recorder.snapshot(),inputs:inputs.snapshot(),vitals:vitals.snapshot(),resourceTimingBuffer:{...resourceTimingBuffer},lifecycle:[...lifecycle],lifecycleDropped,
  environment:import.meta.env.VITE_QA_SOURCE,mode,session:readSession?{...readSession}:null,
  sessionStatus:actual?(sessionFailed?"failed":sessionLive()?"verified":"unverified-or-expired"):"fixture",production:import.meta.env.PROD,timeOrigin:performance.timeOrigin,
  viewport:{width:innerWidth,height:innerHeight},visibility:document.visibilityState,focused:document.hasFocus(),fonts:fontEnvironment(),
  exclusions:["No wallet connection/signatures/transactions or public RPC reads","Address-only API view; wallet balances remain unavailable, never synthetic zero","No field INP or exact presentation timing"]};}

let semanticsInstalled=false;
export function installUiObservers(){
  if(semanticsInstalled)return;semanticsInstalled=true;
  vitals.install();
  try{performance.setResourceTimingBufferSize(resourceTimingBuffer.requested);resourceTimingBuffer.configured=true;}catch{/* Snapshot marks the unsupported buffer control. */}
  performance.addEventListener?.("resourcetimingbufferfull",()=>{resourceTimingBuffer.overflowObserved=true;});
  const visibility=()=>{
    const state={at:performance.now(),visibility:document.visibilityState,focused:document.hasFocus()};
    if(lifecycle.length<500)lifecycle.push(state);else lifecycleDropped++;
    if(state.visibility!=="visible")inputs.interrupt("hidden");else if(!state.focused)inputs.interrupt("unfocused");
  };
  document.addEventListener("visibilitychange",visibility);window.addEventListener("blur",visibility);window.addEventListener("focus",visibility);visibility();
  document.addEventListener("click",event=>{
    const link=(event.target as Element|null)?.closest(".ws-nav a,.ws-brand");if(!link)return;
    const href=link.getAttribute("href");if(!href)return;
    const url=new URL(href,location.href),surface=url.pathname==="/market"?"market":url.pathname==="/assets"?"assets":null;
    if(url.origin!==location.origin||!surface)return;
    const same=url.href===location.href;
    inputs.beginAction({action:"workspace.navigate",surface,navigation:!same,
      expectedStateKey:same?currentStates.get(surface):surface==="market"?url.searchParams.toString():undefined});
  },true);
}

/** Install before loading App; only this QA entry can alter its own transport. */
let networkInstalled=false;
let fetchSession:((signal:AbortSignal)=>Promise<Response>)|undefined;
let preparing:Promise<void>|undefined;
const gateway=actual?"http://127.0.0.1:4394":"http://127.0.0.1:4393",sessionUrl=`${gateway}/session`;
const sessionFailure=()=>new Error("QA measurement session unavailable");
const sessionLive=()=>readSession!==null&&!sessionFailed&&Date.parse(readSession.expiresAt)>Date.now();
function validSessionExpiry(value:unknown):value is string{
  if(typeof value!=="string"||value.trim()!==value||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))return false;
  const at=Date.parse(value),canonical=value.replace(/(?:\.(\d{1,3}))?Z$/,(_,fraction)=>`.${(fraction??"").padEnd(3,"0")}Z`);
  return Number.isFinite(at)&&at>Date.now()&&at-Date.now()<=600000&&new Date(at).toISOString()===canonical;
}

async function readSessionBody(response:Response,signal:AbortSignal){
  if(response.status!==200||response.redirected||response.url&&response.url!==sessionUrl
    ||!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type")??"")
    ||Number(response.headers.get("content-length"))>16384||!response.body)throw sessionFailure();
  const reader=response.body.getReader(),decoder=new TextDecoder("utf-8",{fatal:true});
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener("abort",cancel,{once:true});
  let bytes=0,text="",complete=false;
  try{
    if(signal.aborted)throw sessionFailure();
    while(true){
      const {done,value}=await reader.read();if(done){complete=true;break;}
      bytes+=value.byteLength;if(bytes>16384)throw sessionFailure();
      text+=decoder.decode(value,{stream:true});
    }
    if(signal.aborted)throw sessionFailure();
    text+=decoder.decode();return JSON.parse(text) as Record<string,unknown>;
  }finally{
    signal.removeEventListener("abort",cancel);
    if(!complete)cancel();
    reader.releaseLock();
  }
}

/** One private GET per page load. A failed or mismatched run can never renew itself. */
export function prepareUiReadSession():Promise<void>{
  if(!actual)return Promise.resolve();
  if(sessionFailed||readSession&&!sessionLive())return Promise.reject(sessionFailure());
  if(preparing)return preparing;
  preparing=(async()=>{
    const controller=new AbortController();let timer:number|undefined;
    try{
      if(!fetchSession||!watched||expectedDigest?.length!==64||!/^[\da-f]{64}$/.test(expectedDigest??"")||expectedPaths.length<4
        ||expectedPaths.length>38||allowedPaths.size!==expectedPaths.length)throw sessionFailure();
      const timeout=new Promise<never>((_,reject)=>{
        timer=window.setTimeout(()=>{controller.abort();reject(sessionFailure());},5000);
      });
      const load=async()=>{
        const response=await fetchSession!(controller.signal);
        const value=await readSessionBody(response,controller.signal);
        const keys=["mode","planDigest","watchedAddress","allowedPaths","runId","stopped","readOnly","functionalP0Passed","expiresAt"];
        if(!value||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))
          ||value.mode!=="actual-api"||value.planDigest!==expectedDigest||value.watchedAddress!==watched.toLowerCase()
          ||value.stopped!==false||value.readOnly!==true||value.functionalP0Passed!==false
          ||typeof value.runId!=="string"||value.runId.length!==36||!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value.runId)
          ||!validSessionExpiry(value.expiresAt)
          ||!Array.isArray(value.allowedPaths)||value.allowedPaths.length!==expectedPaths.length
          ||new Set(value.allowedPaths).size!==expectedPaths.length||value.allowedPaths.some(path=>!allowedPaths.has(path)))throw sessionFailure();
        return Object.freeze({runId:value.runId,planDigest:expectedDigest!,expiresAt:value.expiresAt});
      };
      const session=await Promise.race([load(),timeout]);
      if(sessionFailed)throw sessionFailure();
      readSession=session;
    }catch{controller.abort();sessionFailed=true;throw sessionFailure();}
    finally{if(timer!==undefined)window.clearTimeout(timer);}
  })();
  return preparing;
}
export function installReadOnlyNetwork(){
  if(networkInstalled)return;networkInstalled=true;
  const original=window.fetch.bind(window);
  fetchSession=signal=>original(sessionUrl,{method:"GET",redirect:"error",credentials:"omit",cache:"no-store",
    headers:{accept:"application/json"},signal});
  window.fetch=async(input,init)=>{
    const request=input instanceof Request?input:null,url=new URL(request?request.url:input instanceof URL?input.href:String(input),location.href);
    const method=(init?.method??request?.method??"GET").toUpperCase();
    const api=url.origin===gateway&&(actual?sessionLive()&&url.pathname.startsWith("/api/")&&allowedPaths.has(url.pathname.slice(4))
      :/^\/api\/(streams(?:\/[1-9]\d*)?|users\/0x[\da-f]{40}\/trades)$/i.test(url.pathname));
    const asset=url.origin===location.origin&&!url.pathname.startsWith("/api")&&!/rpc/i.test(url.pathname);
    if(method!=="GET"||url.username||url.password||api&&(url.search||url.hash)||!api&&!asset)throw Error("QA network route blocked");
    if(actual){
      const headers=new Headers(init?.headers??request?.headers);
      if([...headers].some(([key,value])=>key!=="accept"||value!=="application/json")||init?.body!=null)throw Error("QA network route blocked");
      if(api&&(url.href!==`${gateway}${url.pathname}`||typeof input==="string"&&input!==url.href))throw Error("QA network route blocked");
    }
    const response=await original(input,{...init,method:"GET",redirect:"error",credentials:"omit",...(api?{headers:{accept:"application/json",
      ...(actual?{"X-QA-Run-ID":readSession!.runId,"X-QA-Plan-Digest":readSession!.planDigest}:{})}}:{}),
      ...(actual&&api?{cache:"no-store",mode:"cors",referrerPolicy:"no-referrer"}:{})});
    if(actual&&api&&(!sessionLive()||response.redirected||response.url&&response.url!==url.href
      ||!response.headers.get("X-QA-Request-ID")?.trim()||response.headers.get("X-QA-Plan-Digest")!==readSession!.planDigest
      ||response.headers.get("X-QA-Run-ID")!==readSession!.runId)){
      sessionFailed=true;throw sessionFailure();
    }
    if(actual&&api&&response.status!==200)sessionFailed=true;
    return response;
  };
}
