import type {UiAction,UiSample} from "../../src/lib/ui-measurement";

type Environment={visibility:string;focused:boolean;width?:number;height?:number};
type InputSample=UiAction&{id:string;startedAt:number;commitAt:number|null;frameAt:number|null;handlerToCommitMs:number|null;handlerToFrameMs:number|null;valid:boolean;reasons:string[];condition?:string;rowCount?:number;dataChanged:boolean|null;source:"unclassified";environment:Environment};
type Options={clock:()=>number;frame:(fn:()=>void)=>number;cancelFrame:(id:number)=>void;setTimer:(fn:()=>void,ms:number)=>unknown;clearTimer:(id:unknown)=>void;environment:()=>Environment;maxSamples?:number;maxEvents?:number;timeoutMs?:number;onSettled?:(value:{id:string;valid:boolean;reasons:string[]})=>void};

/** Input timings have semantic expected states, never a global last API request. */
export function createInputRecorder({clock,frame,cancelFrame,setTimer,clearTimer,environment,maxSamples=500,maxEvents=4000,timeoutMs=5000,onSettled=()=>{}}:Options){
  for(const value of [maxSamples,maxEvents,timeoutMs])if(!Number.isInteger(value)||value<1)throw Error("Invalid input telemetry cap");
  const events:{kind:string;at:number;[key:string]:unknown}[]=[],samples:InputSample[]=[],last=new Map<string,UiSample>();
  type Active={sample:InputSample;before:UiSample|undefined;timer:unknown;frame:number|null};
  let active:Active|null=null,serial=0,dropped=0;
  const emit=(kind:string,data:Record<string,unknown>={})=>{if(events.length>=maxEvents){dropped++;return;}events.push({kind,at:clock(),...data});};
  const invalidate=(sample:InputSample,reason:string)=>{if(!sample.reasons.includes(reason))sample.reasons.push(reason);sample.valid=false;sample.handlerToCommitMs=null;sample.handlerToFrameMs=null;};
  const notify=(sample:InputSample)=>{try{onSettled({id:sample.id,valid:sample.valid,reasons:[...sample.reasons]});}catch{emit("progress-output-failed",{id:sample.id});}};
  const finish=(entry:Active,reason?:string)=>{
    clearTimer(entry.timer);if(reason){if(entry.frame!==null)cancelFrame(entry.frame);invalidate(entry.sample,reason);}
    if(active===entry)active=null;
    notify(entry.sample);
  };
  const beginAction=(action:UiAction)=>{
    if(active){emit("input-superseded",{id:active.sample.id});finish(active,"superseded");}
    if(samples.length>=maxSamples){dropped++;emit("overflow");return null;}
    const sample:InputSample={...action,id:`input-${++serial}`,startedAt:clock(),commitAt:null,frameAt:null,handlerToCommitMs:null,handlerToFrameMs:null,
      valid:false,reasons:[],dataChanged:null,source:"unclassified",environment:environment()};
    samples.push(sample);emit("input-start",{...action,id:sample.id});
    const before=last.get(action.surface);
    if(!action.requiresDataChange&&!action.navigation&&action.expectedStateKey!==undefined&&before?.stateKey===action.expectedStateKey){
      invalidate(sample,"no-op");emit("input-no-op",{id:sample.id});notify(sample);return sample.id;
    }
    const entry:Active={sample,before,timer:null,frame:null};active=entry;
    entry.timer=setTimer(()=>{if(active!==entry||sample.commitAt!==null)return;emit("input-timeout",{id:sample.id});finish(entry,"timeout");},timeoutMs);
    return sample.id;
  };
  const commit=(current:UiSample)=>{
    if(last.has(current.surface)||last.size<8)last.set(current.surface,current);else{dropped++;emit("overflow");}
    const entry=active;if(!entry)return()=>{};
    const sample=entry.sample;
    if(sample.commitAt!==null||sample.surface!==current.surface||sample.expectedStateKey!==undefined&&sample.expectedStateKey!==current.stateKey||["loading","refreshing"].includes(current.condition)||current.condition!=="failure"&&sample.requiresDataChange&&entry.before?.data===current.data){
      emit("unmatched-commit",{id:sample.id,surface:current.surface,stateKey:current.stateKey,condition:current.condition});return()=>{};
    }
    sample.commitAt=clock();sample.condition=current.condition;sample.rowCount=current.rowCount;
    sample.dataChanged=entry.before?entry.before.data!==current.data:null;
    clearTimer(entry.timer);
    if(current.condition==="failure"){
      emit("input-commit",{id:sample.id,surface:current.surface,stateKey:current.stateKey,condition:current.condition});
      finish(entry,"terminal-error-ui");return()=>{};
    }
    if(!Number.isFinite(sample.commitAt)||sample.commitAt<sample.startedAt)invalidate(sample,"invalid-clock");
    if(sample.environment.visibility!=="visible"||environment().visibility!=="visible")invalidate(sample,"hidden");
    if(!sample.environment.focused||!environment().focused)invalidate(sample,"unfocused");
    if(current.condition!=="normal")invalidate(sample,"non-normal-data");
    if(dropped)invalidate(sample,"telemetry-overflow");
    if(!sample.reasons.length)sample.handlerToCommitMs=sample.commitAt-sample.startedAt;
    emit("input-commit",{id:sample.id,surface:current.surface,stateKey:current.stateKey,condition:current.condition,dataChanged:sample.dataChanged});
    entry.timer=setTimer(()=>{if(active!==entry)return;emit("input-timeout",{id:sample.id,phase:"frame"});finish(entry,"frame-timeout");},timeoutMs);
    entry.frame=frame(()=>{
      if(active!==entry)return;
      sample.frameAt=clock();const env=environment();
      if(env.visibility!=="visible")invalidate(sample,"hidden");if(!env.focused)invalidate(sample,"unfocused");
      if(!Number.isFinite(sample.frameAt)||sample.frameAt<sample.commitAt!)invalidate(sample,"invalid-clock");
      if(dropped)invalidate(sample,"telemetry-overflow");
      sample.valid=sample.reasons.length===0;
      if(sample.valid)sample.handlerToFrameMs=sample.frameAt-sample.startedAt;
      emit("input-frame",{id:sample.id,surface:current.surface,valid:sample.valid});finish(entry);
    });
    return()=>{if(active!==entry)return;emit("input-cancelled",{id:sample.id});finish(entry,"cancelled-or-superseded");};
  };
  const interrupt=(reason:string)=>{if(active){emit("input-interrupted",{id:active.sample.id,reason});finish(active,reason);}};
  return {beginAction,commit,interrupt,snapshot:()=>{
    const result=structuredClone(samples);if(dropped)result.forEach(s=>invalidate(s,"telemetry-overflow"));
    return {events:structuredClone(events),samples:result,dropped,pendingId:active?.sample.id??null,limits:{maxSamples,maxEvents,timeoutMs},
      notes:["Handler start is after browser event dispatch; this is not hardware-input latency or INP","Unclassified source does not assert human input; external run manifest identifies automation/human cohorts","API/data-changing actions and cache-only state changes require separate summaries"]};
  }};
}
