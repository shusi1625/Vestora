import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {transformSync} from "esbuild";

function fixture(){
  const handlers={},frames=[],response={status:200,headers:{get:()=>null}};let at=1,nextFetch=async()=>response;
  const module={exports:{}},document={visibilityState:"visible",hasFocus:()=>true,addEventListener:(name,fn)=>{handlers[name]=fn;},querySelectorAll:()=>[],getElementById:()=>({})};
  const window={fetch:(...args)=>nextFetch(...args)};
  const code=transformSync(readFileSync(new URL("../manual-qa/performance.ts",import.meta.url),"utf8"),{loader:"ts",format:"cjs",define:{"import.meta.env.PROD":"true"}}).code;
  vm.runInNewContext(code,{module,exports:module.exports,window,document,URL,location:{href:"http://127.0.0.1:4213/market",pathname:"/market"},innerWidth:1280,innerHeight:800,performance:{now:()=>at,timeOrigin:0,getEntriesByType:()=>[]},PerformanceObserver:class{static supportedEntryTypes=[];},MutationObserver:class{observe(){}},requestAnimationFrame:fn=>frames.push(fn),Error});
  module.exports.installQaPerformance();
  return {api:module.exports,window,document,frames,setTime:v=>{at=v;},fetcher:fn=>{nextFetch=fn;},click:()=>handlers.click({type:"click",target:{closest:()=>({getAttribute:()=>"상세 보기",closest:()=>null})}}),flush:()=>{while(frames.length)frames.shift()();}};
}
test("network telemetry exhaustion cannot discard user input observations",async()=>{
  const f=fixture();for(let i=0;i<2100;i++)await f.window.fetch("http://127.0.0.1:4391/streams");
  for(let i=0;i<20;i++){f.click();f.flush();}
  const p=f.api.qaPerformanceSnapshot();assert.equal(p.droppedByKind.network,100);assert.equal(p.droppedByKind.input,0);assert.equal(p.rows.filter(r=>r.kind==="dispatch-to-second-frame").length,20);
  assert.ok(p.rows.length<=5000);assert.equal(p.environment,"production-fixture");
});
test("reset isolates the observation window and excludes older pending callbacks",async()=>{
  const f=fixture();let resolve;f.fetcher(()=>new Promise(r=>{resolve=r;}));
  const pending=f.window.fetch("http://127.0.0.1:4391/streams");f.click();f.api.qaPerformanceReset();
  resolve({status:200,headers:{get:()=>null}});await pending;f.flush();
  let p=f.api.qaPerformanceSnapshot();assert.equal(p.windowStarted,1);assert.equal(p.measurement,1);assert.equal(p.rows.length,1);assert.equal(p.rows[0].kind,"measurement-window");assert.equal(p.dropped,0);
  f.setTime(21);f.click();f.flush();p=f.api.qaPerformanceSnapshot();assert.equal(p.rows.filter(r=>r.kind==="dispatch-to-second-frame").length,1);assert.equal(p.visibility,"visible");assert.equal(p.focused,true);
});
