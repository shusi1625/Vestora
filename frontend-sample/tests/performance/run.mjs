import {writeFile} from "node:fs/promises";
import {performance} from "node:perf_hooks";
import {percentile} from "./budget.mjs";
import {validatePayload} from "./api-contract.mjs";

const gateway="http://127.0.0.1:4392";
const smoke=process.argv.includes("--smoke"),execute=process.argv.includes("--execute");
const stages=smoke?[{name:"harness-smoke",rps:1,seconds:10}]:[{name:"smoke",rps:1,seconds:60},{name:"low",rps:3,seconds:120},{name:"bounded",rps:5,seconds:120}];
if(!smoke&&!execute){console.log(JSON.stringify({mode:"PLAN ONLY - zero requests",gateway,stages,syntheticRequests:1020,sharedExternalCap:1500,notes:"Gateway counts browser and synthetic requests together; no signing or public RPC load."},null,2));process.exit(0);}
const ready=await fetch(`${gateway}/status`,{redirect:"error",signal:AbortSignal.timeout(1000)}).then(r=>r.json());
if(ready.reason)throw Error(`Gateway stopped: ${ready.reason}`);
const paths=ready.allowedPaths.filter(p=>p==="/streams"||/^\/(streams\/|users\/)/.test(p));if(!paths.length)throw Error("No validated paths");
const samples=[],began=performance.now();let dropped=0,consecutiveFailures=0,stopped=false,sequence=0;const pending=new Set();
for(const stage of stages){
  const start=performance.now(),count=stage.rps*stage.seconds;
  for(let index=0;index<count&&!stopped;index++){
    const due=start+index*1000/stage.rps,delay=due-performance.now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
    if(performance.now()-due>1000/stage.rps||pending.size>=5){dropped++;continue;}
    const path=paths[sequence++%paths.length],at=performance.now();
    const action=(async()=>{
      let status=0,error="",bytes=0;
      try{const response=await fetch(`${gateway}/api${path}`,{redirect:"error",signal:AbortSignal.timeout(10500)});status=response.status;const text=await response.text();bytes=Buffer.byteLength(text);
        if(status!==200)throw Error(`HTTP ${status}`);validatePayload(path,JSON.parse(text));
      }catch(e){error=e.message;if(status===200){stopped=true;await fetch(`${gateway}/stop`,{method:"POST",signal:AbortSignal.timeout(1000)}).catch(()=>{});}}
      consecutiveFailures=error?consecutiveFailures+1:0;if(consecutiveFailures>=3)stopped=true;
      samples.push({stage:stage.name,path,status,error,bytes,at:new Date().toISOString(),durationMs:performance.now()-at});
    })();pending.add(action);action.finally(()=>pending.delete(action));
  }
  await Promise.all(pending);if(stopped)break;const remaining=start+stage.seconds*1000-performance.now();if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
}
const final=await fetch(`${gateway}/status`,{redirect:"error",signal:AbortSignal.timeout(1000)}).then(r=>r.json());
const groups=[...new Set(samples.map(s=>s.stage+" "+s.path))].map(key=>{const rows=samples.filter(s=>s.stage+" "+s.path===key),times=rows.map(s=>s.durationMs);return{key,n:rows.length,errors:rows.filter(s=>s.error).length,p50:percentile(times,.5),p95:percentile(times,.95),p99:percentile(times,.99),smallSample:rows.length<20};});
const result={environment:ready.mode,target:ready.target,syntheticOnly:true,elapsedMs:performance.now()-began,dropped,stopped,groups,samples,gatewayBefore:{requests:ready.requests,bytes:ready.bytes,rejected:ready.rejected},gatewayDelta:{requests:final.requests-ready.requests,bytes:final.bytes-ready.bytes,rejected:final.rejected-ready.rejected},sharedGateway:final};
const outIndex=process.argv.indexOf("--out");if(outIndex>=0)await writeFile(process.argv[outIndex+1],JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,samples:undefined,sharedGateway:{requests:final.requests,rejected:final.rejected,bytes:final.bytes,reason:final.reason}},null,2));
if(stopped||samples.some(s=>s.error)||dropped||final.reason)process.exitCode=1;
