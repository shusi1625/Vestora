import http from "node:http";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {validateConfig,createBudget} from "./budget.mjs";

export function createGateway(raw,approval,{now=()=>Date.now(),monotonicNow=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,upstreamFetch=fetch}={}){
  const config=validateConfig(raw,approval,now()),budget=createBudget(config.limits,monotonicNow),controllers=new Set(),queueWaiters=new Set();let watchdog=null,rejected=0,queued=0,deferred=0,expiryTimer=null,durationTimer=null;
  const stop=reason=>{
    budget.stop(reason);clearTimer(expiryTimer);clearTimer(durationTimer);expiryTimer=null;durationTimer=null;
    for(const controller of controllers)controller.abort();for(const wake of queueWaiters)wake();
  };
  const armLiveExpiry=()=>{
    clearTimer(expiryTimer);expiryTimer=null;if(config.mode!=="live")return;
    const reason=budget.status().reason;if(reason){stop(reason);return;}
    const expires=Date.parse(approval.expiresAt),stale=watchdog?Date.parse(watchdog.observedAt)+90001:Infinity,current=now();
    if(current>=expires){stop("approval-expired");return;}
    if(current>=stale){stop("monitoring-unavailable");return;}
    // Watchdog age 90000ms is still valid under the existing request gate.
    expiryTimer=setTimer(armLiveExpiry,Math.min(expires,stale)-current);expiryTimer.unref?.();
  };
  const waitForRetry=delay=>new Promise(resolve=>{
    const wake=()=>{clearTimer(timer);queueWaiters.delete(wake);resolve();};
    const timer=setTimer(wake,Math.max(1,Math.ceil(delay)));queueWaiters.add(wake);
  });
  const reply=(res,status,value)=>{if(!res.headersSent)res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(value));};
  const server=http.createServer(async(req,res)=>{
    const origin=req.headers.origin;
    if(origin&&!["http://127.0.0.1:4212","http://127.0.0.1:4213"].includes(origin)){reply(res,403,{error:"Origin forbidden"});return;}
    if(origin)res.setHeader("Access-Control-Allow-Origin",origin);
    res.setHeader("Access-Control-Expose-Headers","X-QA-Request-ID,X-QA-Queue-MS,X-QA-Upstream-MS");
    res.setHeader("Access-Control-Allow-Headers","Content-Type");res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
    if(req.method==="OPTIONS"){res.writeHead(204);res.end();return;}
    if(req.url==="/status"&&req.method==="GET"){reply(res,200,{mode:config.mode,target:config.target,allowedPaths:config.allowedPaths,limits:config.limits,rejected,queued,deferred,watchdog,...budget.status()});return;}
    if(req.url==="/stop"&&req.method==="POST"){stop("operator-stop");reply(res,200,{stopped:true});return;}
    if(req.url==="/watchdog"&&req.method==="POST"){
      // A late heartbeat cannot revive a deadline whose callback was delayed.
      armLiveExpiry();
      try{let body="";for await(const chunk of req){body+=chunk;if(body.length>2048)throw Error("Oversized watchdog");}
        const value=JSON.parse(body),age=now()-Date.parse(value.observedAt);
        if(!Number.isFinite(age)||age<0||age>90000||["cpuOk","memoryOk","connectionsOk","storageOk","creditsOk","indexerOk","scalingUnchanged"].some(k=>value[k]!==true))throw Error("Resource check missing, stale or unsafe");
        watchdog={observedAt:value.observedAt};armLiveExpiry();reply(res,200,{accepted:true});
      }catch{stop("unsafe-watchdog");reply(res,400,{error:"Unsafe resource status"});}return;
    }
    if(req.method!=="GET"||!req.url?.startsWith("/api/")||!config.allowedPaths.includes(req.url.slice(4))){rejected++;reply(res,403,{error:"GET allowlist only"});return;}
    if(config.mode==="live"&&now()>=Date.parse(approval.expiresAt)){stop("approval-expired");reply(res,503,{error:"Live approval expired"});return;}
    if(config.mode==="live"&&(!watchdog||now()-Date.parse(watchdog.observedAt)>90000)){rejected++;if(budget.status().requests)stop("monitoring-unavailable");reply(res,503,{error:"Fresh resource watchdog required"});return;}
    const entered=monotonicNow();let reservation=budget.reserve();
    if(!reservation.ok&&["rate-limit","inflight-limit"].includes(reservation.reason)&&queued<20){
      queued++;deferred++;
      try{while(!reservation.ok&&["rate-limit","inflight-limit"].includes(reservation.reason)&&monotonicNow()-entered<5000&&!res.destroyed){await waitForRetry(Math.min(reservation.retryAfterMs??50,5000-(monotonicNow()-entered)));reservation=budget.reserve();}}
      finally{queued--;}
    }
    if(res.destroyed){if(reservation.ok)budget.finish(reservation,{at:now(),failed:false,clientAborted:true});return;}
    if(!reservation.ok){rejected++;reply(res,429,{error:reservation.reason});return;}
    if(config.mode==="live"&&(now()>=Date.parse(approval.expiresAt)||!watchdog||now()-Date.parse(watchdog.observedAt)>90000)){budget.finish(reservation,{at:now(),failed:true,error:"expired-while-queued"});stop("live-gate-expired");reply(res,503,{error:"Live gate expired while queued"});return;}
    const controller=new AbortController();controllers.add(controller);let status=0,bodyBytes=0,failed=true,error="";const path=req.url.slice(4);
    const timer=setTimer(()=>controller.abort(),config.limits.timeoutMs);
    controller.signal.addEventListener("abort",()=>clearTimer(timer),{once:true});
    try{
      const response=await upstreamFetch(config.target+path,{method:"GET",redirect:"error",signal:controller.signal,headers:{accept:"application/json"}});status=response.status;
      const chunks=[];for await(const chunk of response.body){bodyBytes+=chunk.byteLength;if(bodyBytes>2*1024*1024){stop("single-body-cap");throw Error("Response too large");}if(!budget.consume(chunk.byteLength)){stop("byte-cap");throw Error("Response budget exceeded");}chunks.push(chunk);}
      const data=Buffer.concat(chunks);failed=status!==200;
      res.writeHead(status,{"Content-Type":response.headers.get("content-type")||"application/json","Cache-Control":"no-store","X-QA-Request-ID":String(reservation.id),"X-QA-Queue-MS":String(reservation.started-entered),"X-QA-Upstream-MS":String(monotonicNow()-reservation.started)});res.end(data);
    }catch(e){error=e.name==="AbortError"?"timeout-or-stop":"transport-or-redirect";reply(res,502,{error,requestId:reservation.id});}
    finally{clearTimer(timer);controllers.delete(controller);budget.finish(reservation,{at:now(),path,status,bodyBytes,failed,error,queueMs:reservation.started-entered});if(budget.status().reason)stop(budget.status().reason);}
  });
  server.requestTimeout=6000;server.headersTimeout=5000;
  durationTimer=setTimer(()=>stop("duration-cap"),config.limits.durationMs);durationTimer.unref?.();armLiveExpiry();
  server.on("close",()=>stop("closed"));
  return {server,budget,config,stop};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),configPath=args[0]||fileURLToPath(new URL("fixture.json",import.meta.url));
  const approvalFlag=args.indexOf("--live-approval"),approval=approvalFlag<0?null:JSON.parse(readFileSync(args[approvalFlag+1],"utf8"));
  const {server}=createGateway(JSON.parse(readFileSync(configPath,"utf8")),approval);
  server.listen(4392,"127.0.0.1",()=>console.log("Bounded QA gateway http://127.0.0.1:4392. No upstream request until /api allowlisted GET."));
  for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>server.close());
}
