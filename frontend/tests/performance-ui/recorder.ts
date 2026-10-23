import type {RequestMeasurement,UiSample} from "../../src/lib/ui-measurement";

type Environment={visibility:string;focused:boolean};
type Event={kind:string;at:number;[key:string]:unknown};
type RequestRow={id:string;batchId:string;path:string;phase:number;status:number|null;gatewayId:string|null;start:number;headers:number|null;body:number|null;parsed:number|null;validated:number|null;error:string|null};
type Batch={id:string;requests:string[];spans:{name:string;start:number;end:number|null}[];error:string|null;bound:boolean};
type Sample={snapshotId:string;surface:string;stateKey:string;requestIds:string[];rowCount:number;condition:string;commitAt:number;frameAt:number|null;bodyToCommitMs:number|null;commitToFrameMs:number|null;bodyToFrameMs:number|null;valid:boolean;reasons:string[];environment:Environment;requestIntervals:{id:string;bodyToCommitMs:number|null;bodyToFrameMs:number|null}[]};
type Options={clock:()=>number;frame:(fn:()=>void)=>number;cancelFrame:(id:number)=>void;environment:()=>Environment;maxEvents?:number;maxObjects?:number};

/** Exact batch/request identity, with bounded storage and no DOM/network dependency. */
export function createUiRecorder({clock,frame,cancelFrame,environment,maxEvents=20000,maxObjects=4000}:Options){
  if(!Number.isInteger(maxEvents)||maxEvents<1||!Number.isInteger(maxObjects)||maxObjects<1)throw Error("Invalid telemetry caps");
  const events:Event[]=[],samples:Sample[]=[],requests=new Map<string,RequestRow>(),batches=new Map<string,Batch>();
  const snapshots=new WeakMap<object,string>(),seen=new Set<string>(),active=new Map<string,()=>void>();
  const usedSnapshots=new Set<string>();let serial=0,dropped=0,spanCount=0;
  const retained=()=>requests.size+batches.size+samples.length+seen.size+spanCount;
  const id=(prefix:string)=>`${prefix}-${++serial}`;
  const emit=(kind:string,fields:Record<string,unknown>={})=>{if(events.length>=maxEvents){dropped++;return;}events.push({kind,at:clock(),...fields});};
  const room=(units=1)=>{if(retained()+units>maxObjects){dropped++;emit("overflow");return false;}return true;};
  const beginBatch=()=>{
    const key=id("snapshot");if(!room())return key;
    batches.set(key,{id:key,requests:[],spans:[],error:null,bound:false});emit("begin-batch",{batchId:key});return key;
  };
  const request=(batchId:string|undefined,path:string):RequestMeasurement&{id:string}=>{
    const key=id("request"),batch=batchId?batches.get(batchId):null;
    if(!batch||batch.bound||!room()){
      emit("protocol-error",{batchId,requestId:key,reason:"missing-or-sealed-batch"});
      return {id:key,headers:()=>{},body:()=>{},parsed:()=>{},validated:()=>{},failed:()=>{}};
    }
    const row:RequestRow={id:key,batchId:batch.id,path,phase:0,status:null,gatewayId:null,start:clock(),headers:null,body:null,parsed:null,validated:null,error:null};
    requests.set(key,row);batch.requests.push(key);emit("request-start",{requestId:key,batchId,path});
    const mark=(kind:"headers"|"body"|"parsed"|"validated",expected:number)=>{
      if(batch.bound){emit("protocol-error",{requestId:key,reason:"sealed-request"});return;}
      const previous=row.validated??row.parsed??row.body??row.headers??row.start,at=clock();
      if(row.error||row.phase!==expected||batch.bound||!Number.isFinite(at)||at<previous){row.error="invalid-phase-order";batch.error="request-protocol-error";emit("protocol-error",{requestId:key,kindAttempted:kind});return;}
      row[kind]=at;row.phase++;emit(kind,{requestId:key,batchId,...(kind==="headers"?{status:row.status,gatewayId:row.gatewayId}:{})});
    };
    return {id:key,headers:(status,gatewayId)=>{if(!batch.bound){row.status=status;row.gatewayId=gatewayId;}mark("headers",0);},body:()=>mark("body",1),parsed:()=>mark("parsed",2),validated:()=>mark("validated",3),
      failed:kind=>{if(batch.bound){emit("protocol-error",{requestId:key,reason:"sealed-request"});return;}row.error=kind;emit("request-error",{requestId:key,batchId,errorKind:kind});}};
  };
  const span=<T>(batchId:string|undefined,name:string,run:()=>T):T=>{
    const batch=batchId?batches.get(batchId):null;
    if(!batch||batch.bound||!room()){if(batch&&!batch.bound)batch.error="mapping-untracked";emit("protocol-error",{batchId,reason:"mapping-without-open-batch"});return run();}
    spanCount++;const row={name,start:clock(),end:null as number|null};batch.spans.push(row);emit("mapping-start",{batchId,name});
    try{const value=run();row.end=clock();emit("mapping-end",{batchId,name,start:row.start,end:row.end});return value;}
    catch(error){batch.error="mapping-error";emit("mapping-error",{batchId,name});throw error;}
  };
  const bindSnapshot=(data:object,batchId:string)=>{
    const batch=batches.get(batchId);
    if(!batch||batch.bound){emit("protocol-error",{batchId,reason:"duplicate-or-missing-snapshot"});return;}
    batch.bound=true;snapshots.set(data,batchId);emit("snapshot-bound",{snapshotId:batchId,requestIds:[...batch.requests]});
  };
  const failBatch=(batchId:string,kind:string)=>{const batch=batches.get(batchId);if(batch?.bound){emit("protocol-error",{batchId,reason:"sealed-batch"});return;}if(batch)batch.error=kind;emit("batch-error",{batchId,errorKind:kind});};
  const invalidate=(sample:Sample,reason:string)=>{
    if(!sample.reasons.includes(reason))sample.reasons.push(reason);sample.valid=false;
    sample.bodyToCommitMs=null;sample.bodyToFrameMs=null;for(const interval of sample.requestIntervals){interval.bodyToCommitMs=null;interval.bodyToFrameMs=null;}
  };
  const commit=({data,surface,stateKey,rowCount,condition}:UiSample)=>{
    const snapshotId=data?snapshots.get(data):null,batch=snapshotId?batches.get(snapshotId):null;
    if(!batch){active.get(surface)?.();emit("unbound-commit",{surface,stateKey,rowCount,condition});return()=>{};}
    const signature=JSON.stringify([snapshotId,surface,stateKey]);
    if(seen.has(signature))return()=>{};
    active.get(surface)?.();if(!room(2))return()=>{};seen.add(signature);
    const env=environment(),reasons:string[]=[],rows=batch.requests.map(key=>requests.get(key)!);
    if(usedSnapshots.has(batch.id))reasons.push("reused-snapshot");usedSnapshots.add(batch.id);
    if(!rows.length||rows.some(r=>!r||r.phase!==4||r.status!==200||r.error))reasons.push("incomplete-or-failed-request");
    if(batch.error)reasons.push(batch.error);if(dropped)reasons.push("telemetry-overflow");
    if(env.visibility!=="visible")reasons.push("hidden");if(!env.focused)reasons.push("unfocused");
    const at=clock(),valid=reasons.length===0,lastBody=valid?Math.max(...rows.map(r=>r.body!)):null;
    const sample:Sample={snapshotId:batch.id,surface,stateKey,rowCount,condition,requestIds:[...batch.requests],commitAt:at,frameAt:null,
      bodyToCommitMs:lastBody===null?null:at-lastBody,commitToFrameMs:null,bodyToFrameMs:null,valid:false,reasons,environment:env,
      requestIntervals:rows.map(r=>({id:r.id,bodyToCommitMs:valid?at-r.body!:null,bodyToFrameMs:null}))};
    samples.push(sample);emit("commit",{snapshotId:batch.id,surface,stateKey,requestIds:sample.requestIds,rowCount,condition});
    let cancelled=false;
    const frameId=frame(()=>{
      if(cancelled)return;
      const current=environment();if(current.visibility!=="visible")invalidate(sample,"hidden");if(!current.focused)invalidate(sample,"unfocused");
      if(dropped)invalidate(sample,"telemetry-overflow");
      sample.frameAt=clock();sample.commitToFrameMs=sample.frameAt-at;sample.valid=sample.reasons.length===0;
      if(sample.valid&&lastBody!==null){sample.bodyToFrameMs=sample.frameAt-lastBody;sample.requestIntervals.forEach((r,i)=>{r.bodyToFrameMs=sample.frameAt!-rows[i].body!;});}
      emit("frame",{snapshotId:batch.id,surface,stateKey,valid:sample.valid});if(active.get(surface)===cleanup)active.delete(surface);
    });
    const cleanup=()=>{if(cancelled||sample.frameAt!==null)return;cancelled=true;cancelFrame(frameId);invalidate(sample,"cancelled-or-superseded");emit("cancelled-frame",{snapshotId:batch.id,surface,stateKey});if(active.get(surface)===cleanup)active.delete(surface);};
    active.set(surface,cleanup);return cleanup;
  };
  return {beginBatch,request,span,bindSnapshot,failBatch,commit,snapshot:()=>{
    const result=structuredClone(samples);if(dropped)result.forEach(sample=>invalidate(sample,"telemetry-overflow"));
    return {events:structuredClone(events),samples:result,requests:structuredClone([...requests.values()]),batches:structuredClone([...batches.values()]),
      dropped,retainedObjects:retained(),bodyBasis:"last-required-body; per-request intervals also retained",notes:["frame is a callback boundary, not presentation time or field INP","reused/cancelled/hidden/partial samples have null API intervals","dropped telemetry invalidates the observation window"]};
  }};
}
