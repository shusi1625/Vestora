import {test} from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {HARD_LIMITS,validateConfig,createBudget,percentile} from "./budget.mjs";
import {createGateway} from "./gateway.mjs";
import {validatePayload} from "./api-contract.mjs";
const config={mode:"fixture",target:"http://127.0.0.1:4391",allowedPaths:["/streams"]};

test("live cannot start with example approval, missing checks, wrong target or expired audit",()=>{
  const now=Date.now(),live={...config,mode:"live",target:"http://15.135.223.4:3001"},approval={target:live.target,humanApproved:true,functionalP0Passed:true,monitoringReady:true,autoscalingReviewed:true,storageHeadroomReviewed:true,cpuCreditsReviewed:true,baselineHealthy:true,operator:"test-only",checkedAt:new Date(now).toISOString(),expiresAt:new Date(now+600000).toISOString(),blockers:[]};
  assert.throws(()=>validateConfig(live,null));for(const key of ["humanApproved","functionalP0Passed","monitoringReady","storageHeadroomReviewed","cpuCreditsReviewed","autoscalingReviewed","baselineHealthy"])assert.throws(()=>validateConfig(live,{...approval,[key]:false}));
  assert.throws(()=>validateConfig(live,{...approval,blockers:["open defect"]}));assert.throws(()=>validateConfig(live,{...approval,expiresAt:new Date(now-1).toISOString()}));
  assert.throws(()=>validateConfig({...live,target:"http://example.com"},approval));assert.equal(validateConfig(live,approval,now).mode,"live");
});
test("caps cannot exceed the global bounds and paths cannot be widened into a proxy",()=>{
  for(const [key,max]of Object.entries(HARD_LIMITS)){assert.throws(()=>validateConfig({...config,limits:{[key]:max+1}}));assert.throws(()=>validateConfig({...config,limits:{[key]:0}}));}
  for(const path of ["/rpc","/streams?x=1","/streams/../metrics","//example.com","/admin/rebuild","/streams/%33"])assert.throws(()=>validateConfig({...config,allowedPaths:[path]}));
  assert.throws(()=>validateConfig({...config,target:"http://user:pass@127.0.0.1:4391"}));assert.throws(()=>validateConfig({...config,target:"http://example.com"}));
});
test("rolling one-second cap is shared and exact at 999/1000ms",()=>{
  let now=0;const b=createBudget(HARD_LIMITS,()=>now);for(let i=0;i<5;i++)assert.equal(b.reserve().ok,true);assert.equal(b.reserve().reason,"rate-limit");
  now=999;assert.equal(b.reserve().ok,false);now=1000;assert.equal(b.reserve().reason,"inflight-limit");
});
test("request,bytes,duration and operator stop caps fail closed",()=>{
  let now=0;const b=createBudget({...HARD_LIMITS,requests:1},()=>now);b.reserve();assert.equal(b.reserve().reason,"request-cap");
  const bytes=createBudget({...HARD_LIMITS,bytes:10});assert.equal(bytes.consume(9),true);assert.equal(bytes.consume(1),false);assert.equal(bytes.reserve().reason,"byte-cap");
  const time=createBudget({...HARD_LIMITS,durationMs:1000},()=>now);now=1000;assert.equal(time.reserve().reason,"duration-cap");
  const stop=createBudget(HARD_LIMITS);stop.stop("operator-stop");assert.equal(stop.reserve().reason,"operator-stop");
});
test("three upstream failures stop new requests and percentiles do not invent empty samples",()=>{
  const b=createBudget(HARD_LIMITS);for(let i=0;i<3;i++){const r=b.reserve();b.finish(r,{at:Date.now(),failed:true});}assert.equal(b.reserve().reason,"three-consecutive-failures");
  assert.equal(percentile([],.95),null);assert.equal(percentile([5,1,3],.5),3);
});
async function listen(server){await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));return `http://127.0.0.1:${server.address().port}`;}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
test("gateway refuses writes,unknown paths,foreign origins and redirects without forwarding them",async()=>{
  let reached=0,secondHop=0;const target=http.createServer((req,res)=>{reached++;res.writeHead(302,{Location:"/second"});res.end();});
  const url=await listen(target),g=createGateway({...config,target:url});const base=await listen(g.server);
  try{
    for(const [path,options]of [["/api/streams",{method:"POST"}],["/api/rpc",{}],["/api/streams",{headers:{Origin:"https://malicious.invalid"}}]])assert.equal((await fetch(base+path,options)).status,403);
    assert.equal(reached,0);assert.equal((await fetch(base+"/api/streams")).status,502);assert.equal(reached,1);
    secondHop=g.budget.status().events.filter(e=>e.path==="/second").length;assert.equal(secondHop,0);
    await fetch(base+"/stop",{method:"POST"});assert.equal((await fetch(base+"/api/streams")).status,429);assert.equal(reached,1);
  }finally{await close(g.server);await close(target);}
});
test("browser burst and synthetic requests share one rolling cap with bounded queue",async()=>{
  const times=[],target=http.createServer((_req,res)=>{times.push(performance.now());res.end("{}");}),url=await listen(target),g=createGateway({...config,target:url}),base=await listen(g.server);
  try{const responses=await Promise.all(Array.from({length:6},()=>fetch(base+"/api/streams")));assert.ok(responses.every(r=>r.status===200));assert.equal(times.length,6);assert.ok(times[5]-times[0]>=950);assert.equal(g.budget.status().requests,6);assert.ok(g.budget.status().events.some(e=>e.queueMs>900));}
  finally{await close(g.server);await close(target);}
});
test("measured DTOs reuse account,chain,requested ID and exact accounting validation",()=>{
  const a="0x1111111111111111111111111111111111111111",b="0x2222222222222222222222222222222222222222",hash=`0x${"a".repeat(64)}`,at=new Date(100000).toISOString();
  const projection={chainId:11155111,syncId:"sepolia-v4",status:"synced",projectionStatus:"applied",latestProjectedBlock:"100",latestIndexedBlock:"100",latestProjectedBlockTimestamp:at,estimateAt:at};
  const data={streamId:"3",sender:a,recipient:b,currentOwner:b,token:"0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9",depositedAmount:"1000",withdrawnAmount:"0",startTime:new Date(0).toISOString(),endTime:new Date(200000).toISOString(),cancelable:true,canceledAt:null,createdTxHash:hash,computed:{vestedAmount:"500",claimableEstimate:"500",remainingReceivable:"1000",estimateTimestamp:at},listing:null,claims:[]};
  const response={data,meta:{projection}};assert.equal(validatePayload("/streams/3",response).data.streamId,"3");
  assert.throws(()=>validatePayload("/streams/4",response));assert.throws(()=>validatePayload("/streams/3",{...response,meta:{projection:{...projection,chainId:1}}}));
  assert.throws(()=>validatePayload("/streams/3",{...response,data:{...data,computed:{...data.computed,claimableEstimate:"501"}}}));
  const trade={id:"1",streamId:"3",seller:a,buyer:b,price:"850",tradedAt:at,transactionHash:hash,logIndex:0};
  assert.throws(()=>validatePayload(`/users/0x${"3".repeat(40)}/trades`,{data:[trade],meta:{projection}}));
  assert.throws(()=>validatePayload("/streams/3",{...response,data:{...data,claims:[{id:"c",streamId:"4",recipient:b,amount:"1",claimedAt:at,transactionHash:hash,logIndex:0}]}}));
});
