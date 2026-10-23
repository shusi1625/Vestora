import {test} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {setImmediate} from "node:timers/promises";
import {createGateway} from "./gateway.mjs";

const live={mode:"live",target:"http://15.135.223.4:3001",allowedPaths:["/streams"]};
const checks={cpuOk:true,memoryOk:true,connectionsOk:true,storageOk:true,creditsOk:true,indexerOk:true,scalingUnchanged:true};

function fakeClock(){
  const epoch=Date.UTC(2026,9,22);let elapsed=0,nextId=0;
  const timers=new Map();
  const clock={
    now:()=>epoch+elapsed,
    monotonicNow:()=>elapsed,
    setTimer(callback,delay){
      assert.ok(Number.isFinite(delay)&&delay>=0);
      const handle={id:++nextId,unref(){}};
      timers.set(handle,{callback,due:elapsed+delay});return handle;
    },
    clearTimer:handle=>timers.delete(handle),
    advance(ms){
      const end=elapsed+ms;
      for(;;){
        const entry=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];
        if(!entry||entry[1].due>end)break;
        elapsed=entry[1].due;timers.delete(entry[0]);entry[1].callback();
      }
      elapsed=end;
    },
    fireEarly(){
      const [handle,timer]=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];
      timers.delete(handle);timer.callback();
    },
    jumpWithoutCallbacks(ms){elapsed+=ms;},
    remaining:()=>[...timers.values()].map(timer=>timer.due-elapsed).sort((a,b)=>a-b),
  };
  return clock;
}

function testApproval(clock,ttl=200000){
  return {target:live.target,humanApproved:true,functionalP0Passed:true,monitoringReady:true,autoscalingReviewed:true,storageHeadroomReviewed:true,cpuCreditsReviewed:true,baselineHealthy:true,operator:"injected-clock-test-only",checkedAt:new Date(clock.now()).toISOString(),expiresAt:new Date(clock.now()+ttl).toISOString(),blockers:[]};
}

async function until(predicate){
  for(let i=0;i<2000;i++){if(predicate())return;await setImmediate();}
  assert.fail("Local request did not reach the expected state");
}

function localRequest(url,{method="GET",body}={}){
  const target=new URL(url);assert.equal(target.hostname,"127.0.0.1");assert.notEqual(target.port,"4190");
  return new Promise((resolve,reject)=>{
    const req=http.request(target,{method},res=>{
      const chunks=[];res.on("data",chunk=>chunks.push(chunk));res.on("error",reject);
      res.on("end",()=>resolve({status:res.statusCode,json:async()=>JSON.parse(Buffer.concat(chunks).toString())}));
    });
    req.on("error",reject);req.end(body);
  });
}

async function harness(t,{ttl=200000,limits={},fixture=false,pending=false}={}){
  const clock=fakeClock(),calls=[];
  // Every upstream invocation is replaced; only the gateway's loopback listener uses HTTP.
  const upstreamFetch=(_url,{signal})=>{
    calls.push(signal);
    if(!pending)return Promise.resolve(new Response("{}",{headers:{"content-type":"application/json"}}));
    return new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}));
  };
  const raw={...(fixture?{...live,mode:"fixture",target:"http://127.0.0.1:4391"}:live),limits};
  const g=createGateway(raw,fixture?null:testApproval(clock,ttl),{...clock,upstreamFetch});
  await new Promise(resolve=>g.server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${g.server.address().port}`;
  t.after(async()=>{
    g.stop("test-cleanup");
    if(g.server.listening){g.server.closeAllConnections();await new Promise(resolve=>g.server.close(resolve));}
    assert.deepEqual(clock.remaining(),[]);
  });
  const watchdog=async(age=0)=>{
    const response=await localRequest(base+"/watchdog",{method:"POST",body:JSON.stringify({...checks,observedAt:new Date(clock.now()-age).toISOString()})});
    assert.equal(response.status,200);await response.json();
  };
  const request=()=>localRequest(base+"/api/streams").then(async response=>({status:response.status,body:await response.json()}));
  return {clock,calls,g,base,watchdog,request};
}

test("idle live approval expires at the exact deadline without a new request",async t=>{
  const {clock,g,calls}=await harness(t,{ttl:100});
  assert.deepEqual(clock.remaining(),[100,600000]);
  clock.advance(99);assert.equal(g.budget.status().reason,"");
  clock.advance(1);assert.equal(g.budget.status().reason,"approval-expired");
  assert.deepEqual(clock.remaining(),[]);assert.equal(calls.length,0);
});

test("rate queue waits for the rolling deadline without a fixed 50ms overshoot",async t=>{
  const {clock,g,request,calls}=await harness(t,{fixture:true,limits:{rps:1}});
  assert.equal((await request()).status,200);
  clock.advance(999.25);
  const queued=request();await until(()=>clock.remaining().includes(1));
  assert.equal(g.budget.status().requests,1);
  clock.advance(.5);assert.equal(calls.length,1);
  clock.advance(.5);await until(()=>calls.length===2);
  assert.equal((await queued).status,200);
  assert.equal(g.budget.status().requests,2);
  assert.ok(g.budget.status().events[1].queueMs<=1);
});

test("operator stop cancels a rate-deadline waiter without forwarding",async t=>{
  const {clock,g,request,calls}=await harness(t,{fixture:true,limits:{rps:1}});
  assert.equal((await request()).status,200);
  clock.advance(100);
  const queued=request();await until(()=>clock.remaining().includes(900));
  g.stop("operator-stop");
  assert.deepEqual(await queued,{status:429,body:{error:"operator-stop"}});
  assert.deepEqual(clock.remaining(),[]);
  assert.equal(calls.length,1);
});

test("idle watchdog keeps the existing inclusive 90000ms window and stops at 90001ms",async t=>{
  const {clock,g,watchdog,calls}=await harness(t);
  await watchdog();assert.deepEqual(clock.remaining(),[90001,600000]);
  clock.advance(90000);assert.equal(g.budget.status().reason,"");
  clock.advance(1);assert.equal(g.budget.status().reason,"monitoring-unavailable");
  assert.deepEqual(clock.remaining(),[]);assert.equal(calls.length,0);
});

test("watchdog deadline uses observedAt, including an observation already 90000ms old",async t=>{
  const {clock,g,watchdog}=await harness(t);
  await watchdog(90000);assert.deepEqual(clock.remaining(),[1,600000]);
  assert.equal(g.budget.status().reason,"");clock.advance(1);
  assert.equal(g.budget.status().reason,"monitoring-unavailable");
});

test("watchdog refresh replaces its old timer and expires at the new observation deadline",async t=>{
  const {clock,g,watchdog}=await harness(t);
  await watchdog();clock.advance(30000);await watchdog();
  assert.deepEqual(clock.remaining(),[90001,570000]);
  clock.advance(60001);assert.equal(g.budget.status().reason,"");
  assert.deepEqual(clock.remaining(),[30000,509999]);
  clock.advance(29999);assert.equal(g.budget.status().reason,"");
  clock.advance(1);assert.equal(g.budget.status().reason,"monitoring-unavailable");
});

test("watchdog refresh cannot extend approval, including tied deadlines",async t=>{
  const {clock,g,watchdog}=await harness(t,{ttl:90001});
  await watchdog();clock.advance(100);await watchdog();
  assert.deepEqual(clock.remaining(),[89901,599900]);
  clock.advance(89900);assert.equal(g.budget.status().reason,"");
  clock.advance(1);assert.equal(g.budget.status().reason,"approval-expired");
});

for(const kind of ["approval","watchdog"]){
  test(`${kind} expiry immediately aborts inflight and rejects queue before its retry timer`,async t=>{
    const {clock,g,watchdog,request,calls,base}=await harness(t,{ttl:kind==="approval"?21:200000,limits:{inFlight:1},pending:true});
    await watchdog(kind==="watchdog"?89980:0);
    const inflight=request();await until(()=>calls.length===1);
    const queued=request();await until(()=>clock.remaining().includes(50));
    clock.advance(20);assert.equal(calls[0].aborted,false);assert.equal(g.budget.status().reason,"");
    clock.advance(1);
    const reason=kind==="approval"?"approval-expired":"monitoring-unavailable";
    assert.equal(g.budget.status().reason,reason);assert.equal(calls[0].aborted,true);
    assert.deepEqual(clock.remaining(),[]);
    assert.deepEqual(await queued,{status:429,body:{error:reason}});
    assert.equal((await inflight).status,502);assert.equal(calls.length,1);
    const status=await (await localRequest(base+"/status")).json();
    assert.equal(status.queued,0);assert.equal(status.inFlight,0);assert.equal(status.requests,1);
    assert.deepEqual(clock.remaining(),[]);
  });
}

test("refresh during an inflight request cancels the earlier watchdog abort",async t=>{
  const {clock,g,watchdog,request,calls}=await harness(t,{pending:true});
  await watchdog(89980);const inflight=request();await until(()=>calls.length===1);
  clock.advance(10);await watchdog(89980);
  clock.advance(11);assert.equal(calls[0].aborted,false);assert.equal(g.budget.status().reason,"");
  clock.advance(9);assert.equal(calls[0].aborted,false);
  clock.advance(1);assert.equal(calls[0].aborted,true);
  assert.equal(g.budget.status().reason,"monitoring-unavailable");assert.equal((await inflight).status,502);
});

test("upstream timeout still aborts at its exact boundary without stopping the budget",async t=>{
  const {clock,g,watchdog,request,calls}=await harness(t,{limits:{timeoutMs:50},pending:true});
  await watchdog();const inflight=request();await until(()=>calls.length===1);
  clock.advance(49);assert.equal(calls[0].aborted,false);
  clock.advance(1);assert.equal(calls[0].aborted,true);assert.equal((await inflight).status,502);
  assert.equal(g.budget.status().reason,"");assert.equal(g.budget.status().inFlight,0);
  assert.deepEqual(clock.remaining(),[89951,599950]);
});

test("operator stop wakes queue, aborts inflight and cannot be rearmed by watchdog refresh",async t=>{
  const {clock,g,base,watchdog,request,calls}=await harness(t,{limits:{inFlight:1},pending:true});
  await watchdog();const inflight=request();await until(()=>calls.length===1);
  const queued=request();await until(()=>clock.remaining().includes(50));
  assert.equal((await localRequest(base+"/stop",{method:"POST"})).status,200);
  assert.equal(calls[0].aborted,true);assert.deepEqual(clock.remaining(),[]);
  assert.equal((await inflight).status,502);assert.deepEqual(await queued,{status:429,body:{error:"operator-stop"}});
  await watchdog();assert.deepEqual(clock.remaining(),[]);
  clock.advance(200001);assert.equal(g.budget.status().reason,"operator-stop");
});

test("normal server close removes both live and duration timers",async t=>{
  const {clock,g,watchdog}=await harness(t);
  await watchdog();assert.equal(clock.remaining().length,2);
  await new Promise(resolve=>g.server.close(resolve));
  assert.equal(g.budget.status().reason,"closed");assert.deepEqual(clock.remaining(),[]);
  clock.advance(600001);assert.equal(g.budget.status().reason,"closed");
});

test("duration cap clears a later live expiry timer and aborts inflight",async t=>{
  const {clock,g,watchdog,request,calls}=await harness(t,{limits:{durationMs:100},pending:true});
  await watchdog();const inflight=request();await until(()=>calls.length===1);
  clock.advance(99);assert.equal(calls[0].aborted,false);
  clock.advance(1);assert.equal(g.budget.status().reason,"duration-cap");assert.equal(calls[0].aborted,true);
  assert.deepEqual(clock.remaining(),[]);assert.equal((await inflight).status,502);
});

test("an early timer callback rechecks time and keeps exactly one live expiry timer",async t=>{
  const {clock,g}=await harness(t,{ttl:100});
  clock.fireEarly();assert.equal(g.budget.status().reason,"");
  assert.deepEqual(clock.remaining(),[100,600000]);
  clock.advance(100);assert.equal(g.budget.status().reason,"approval-expired");
});

test("fixture retains duration/timeout behavior without live expiry timers",async t=>{
  const {clock,g,watchdog,request,calls}=await harness(t,{fixture:true});
  assert.deepEqual(clock.remaining(),[600000]);await watchdog();
  assert.deepEqual(clock.remaining(),[600000]);clock.advance(90001);
  assert.equal(g.budget.status().reason,"");assert.equal((await request()).status,200);
  assert.equal(calls.length,1);assert.deepEqual(clock.remaining(),[509999]);
});

test("injected runtime still rejects every false live approval flag",()=>{
  const clock=fakeClock(),approval=testApproval(clock);
  for(const key of ["humanApproved","functionalP0Passed","monitoringReady","autoscalingReviewed","storageHeadroomReviewed","cpuCreditsReviewed","baselineHealthy"]){
    assert.throws(()=>createGateway(live,{...approval,[key]:false},{...clock,upstreamFetch:()=>assert.fail("Must not dispatch")}));
    assert.deepEqual(clock.remaining(),[]);
  }
});

test("expiry still aborts inflight and clears timers if the budget already has a stop reason",async t=>{
  const {clock,g,watchdog,request,calls}=await harness(t,{ttl:21,pending:true});
  await watchdog();const inflight=request();await until(()=>calls.length===1);
  g.budget.stop("earlier-budget-stop");clock.advance(21);
  assert.equal(g.budget.status().reason,"earlier-budget-stop");assert.equal(calls[0].aborted,true);
  assert.deepEqual(clock.remaining(),[]);assert.equal((await inflight).status,502);
});

for(const kind of ["approval","watchdog"]){
  test(`late watchdog cannot revive ${kind} expiry before its delayed timer callback`,async t=>{
    const {clock,g,watchdog,request,calls}=await harness(t,{ttl:kind==="approval"?21:200000,pending:true});
    await watchdog(kind==="watchdog"?89980:0);const inflight=request();await until(()=>calls.length===1);
    clock.jumpWithoutCallbacks(22);assert.equal(calls[0].aborted,false);
    await watchdog();assert.equal(g.budget.status().reason,kind==="approval"?"approval-expired":"monitoring-unavailable");
    assert.equal(calls[0].aborted,true);assert.deepEqual(clock.remaining(),[]);assert.equal((await inflight).status,502);
  });
}
