export const HARD_LIMITS=Object.freeze({rps:5,requests:1500,inFlight:5,bytes:64*1024*1024,durationMs:600000,timeoutMs:5000});

export function validateConfig(config,approval,now=Date.now()){
  const target=new URL(config.target);
  if(target.username||target.password||target.search||target.hash||target.pathname!=="/")throw Error("Target must be a plain origin");
  const local=target.hostname==="127.0.0.1"&&target.protocol==="http:";
  if(config.mode==="fixture"&&!local)throw Error("Fixture target must be loopback");
  if(config.mode!=="fixture"&&config.mode!=="live")throw Error("Unknown mode");
  if(config.mode==="live"){
    if(target.origin!=="http://15.135.223.4:3001")throw Error("Unapproved live target");
    const required=["humanApproved","functionalP0Passed","monitoringReady","autoscalingReviewed","storageHeadroomReviewed","cpuCreditsReviewed","baselineHealthy"];
    if(!approval||approval.target!==target.origin||required.some(k=>approval[k]!==true)||!approval.operator||!Array.isArray(approval.blockers)||approval.blockers.length)throw Error("Live readiness/approval gate is not satisfied");
    const checked=Date.parse(approval.checkedAt),expires=Date.parse(approval.expiresAt);
    if(!Number.isFinite(checked)||!Number.isFinite(expires)||checked>now||now-checked>900000||expires<=now||expires-checked>900000)throw Error("Live approval expired or invalid");
  }
  if(!Array.isArray(config.allowedPaths)||!config.allowedPaths.length||config.allowedPaths.some(p=>typeof p!=="string"||!/^\/(streams(?:\/[1-9]\d*)?|users\/0x[\da-f]{40}\/trades|health|metrics)$/i.test(p)))throw Error("Explicit API path allowlist required");
  const limits={...HARD_LIMITS,...config.limits};
  for(const [key,max]of Object.entries(HARD_LIMITS))if(!Number.isInteger(limits[key])||limits[key]<1||limits[key]>max)throw Error(`Invalid ${key} cap`);
  return {...config,target:target.origin,limits,allowedPaths:[...new Set(config.allowedPaths)]};
}

export function createBudget(limits,clock=()=>performance.now()){
  const began=clock(),recent=[];let requests=0,inFlight=0,bytes=0,reason="",consecutiveFailures=0;const events=[];
  const stop=value=>{reason ||= value;};
  const reserve=()=>{
    const now=clock();if(now-began>=limits.durationMs)stop("duration-cap");if(requests>=limits.requests)stop("request-cap");if(bytes>=limits.bytes)stop("byte-cap");
    while(recent.length&&recent[0]<=now-1000)recent.shift();
    if(reason)return {ok:false,reason};if(recent.length>=limits.rps)return {ok:false,reason:"rate-limit",retryAfterMs:recent[0]+1000-now};if(inFlight>=limits.inFlight)return {ok:false,reason:"inflight-limit"};
    requests++;inFlight++;recent.push(now);return {ok:true,id:requests,started:now};
  };
  const consume=amount=>{bytes+=amount;if(bytes>=limits.bytes)stop("byte-cap");return !reason;};
  const finish=(reservation,event)=>{
    inFlight--;const row={id:reservation.id,...event,durationMs:clock()-reservation.started};events.push(row);
    consecutiveFailures=event.failed?consecutiveFailures+1:0;if(consecutiveFailures>=3)stop("three-consecutive-failures");
    const window=events.filter(e=>e.at>=Date.now()-30000);if(window.length>=20&&window.filter(e=>e.failed).length/window.length>0.05)stop("error-window");
    if(window.length>=20&&percentile(window.map(e=>e.durationMs),0.95)>2000)stop("latency-window");return row;
  };
  return {reserve,consume,finish,stop,status:()=>({requests,inFlight,bytes,reason,elapsedMs:clock()-began,events:[...events]})};
}
export function percentile(values,p){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];}
