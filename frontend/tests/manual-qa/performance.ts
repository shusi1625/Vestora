type Row=Record<string,unknown>;
const rows:Row[]=[],supported=typeof PerformanceObserver!=="undefined"?PerformanceObserver.supportedEntryTypes:[];
let sequence=0,dropped=0,installed=false,windowStarted=0,measurement=0;
const limits={network:2000,input:2000,other:1000},counts={network:0,input:0,other:0},droppedByKind={network:0,input:0,other:0};
const add=(row:Row)=>{
  const kind=String(row.kind),group=/^(api-|rpc-|fetch-)/.test(kind)?"network":kind==="event"||kind==="dispatch-to-second-frame"?"input":"other";
  if(counts[group]>=limits[group]){dropped++;droppedByKind[group]++;return;}counts[group]++;rows.push({at:performance.now(),...row});
};
export function qaPerformanceReset(){
  rows.length=0;dropped=0;for(const key of ["network","input","other"] as const){counts[key]=0;droppedByKind[key]=0;}
  windowStarted=performance.now();measurement++;add({kind:"measurement-window",measurement,visibility:document.visibilityState,focused:document.hasFocus()});
}

/** Fixture-only telemetry; never installed by the production application entry. */
export function installQaPerformance(){
  if(installed)return;installed=true;
  for(const type of ["event","longtask","largest-contentful-paint"]){
    if(!supported.includes(type))continue;
    try{new PerformanceObserver(list=>{for(const item of list.getEntries()){
      const entry=item as PerformanceEntry&{processingStart?:number;processingEnd?:number;interactionId?:number};
      if(entry.startTime<windowStarted)continue;
      add({kind:type,name:entry.name,startTime:entry.startTime,duration:entry.duration,processingStart:entry.processingStart,processingEnd:entry.processingEnd,interactionId:entry.interactionId});
    }}).observe({type,buffered:true,...(type==="event"?{durationThreshold:16}:{})});}catch{add({kind:"observer-unavailable",type});}
  }
  const original=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url,location.href);
    const measured=url.pathname==="/rpc"||/^\/(api\/)?(streams|users)(\/|$)/.test(url.pathname),id=++sequence,start=performance.now(),epoch=measurement;
    try{const response=await original(input,init);if(measured&&epoch===measurement)add({kind:url.pathname==="/rpc"?"rpc-headers":"api-headers",id,gatewayId:response.headers.get("X-QA-Request-ID"),queueMs:response.headers.get("X-QA-Queue-MS"),upstreamMs:response.headers.get("X-QA-Upstream-MS"),path:url.pathname,status:response.status,duration:performance.now()-start});return response;}
    catch(error){const errorName=error instanceof Error?error.name:"unknown";if(measured&&epoch===measurement)add({kind:errorName==="AbortError"?"fetch-aborted":"fetch-error",errorName,id,path:url.pathname,duration:performance.now()-start});throw error;}
  };
  const interaction=(event:Event)=>{
    const target=(event.target as Element|null)?.closest(event.type==="click"?"main button,[role=dialog] button":"main select");if(!target)return;
    const label=target.getAttribute("aria-label")||target.closest("label")?.firstChild?.textContent||target.textContent?.trim().slice(0,80)||target.tagName;
    const action=event.type==="change"?`${label}=${(target as HTMLSelectElement).value}`:label,start=performance.now(),epoch=measurement;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{if(epoch===measurement)add({kind:"dispatch-to-second-frame",event:event.type,action,duration:performance.now()-start});}));
  };
  document.addEventListener("click",interaction,true);document.addEventListener("change",interaction,true);
  document.addEventListener("visibilitychange",()=>add({kind:"document-visibility",visibility:document.visibilityState}),true);
  let previous="",ready=false;
  new MutationObserver(()=>{
    const phases=[...document.querySelectorAll(".claim-progress")].map(e=>e.className).sort().join("|");
    if(phases!==previous){previous=phases;add({kind:"visible-transaction-phase",phases});}
    if(!ready){const count=document.querySelectorAll("main .ws-listing,main table tbody tr").length;if(count){ready=true;add({kind:"first-workspace-rows",duration:performance.now(),count,path:location.pathname});}}
  }).observe(document.getElementById("root")!,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});
}
export function qaPerformanceSnapshot(){return {environment:import.meta.env.PROD?"production-fixture":"development-fixture",timeOrigin:performance.timeOrigin,measurement,windowStarted,visibility:document.visibilityState,focused:document.hasFocus(),supported,dropped,droppedByKind:{...droppedByKind},limits,viewport:{width:innerWidth,height:innerHeight},navigation:performance.getEntriesByType("navigation").map(e=>e.toJSON()),rows:[...rows],notes:["api/rpc duration ends at response headers, not body or DOM commit","second-frame delay is not INP or actual presentation timing","event timing omits short events below browser threshold; missing is not zero","network/input/other buffers are independent; check per-kind drops","navigation is full-page timing, not the reset observation window"]};}
