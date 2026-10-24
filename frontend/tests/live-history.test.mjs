import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {createRequire} from "node:module";
import vm from "node:vm";
import ts from "typescript";

const root=resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
const snapshotActionHookStubs={
  "./use-market-action":{useMarketAction:()=>({})},
  "./use-cancel-payment":{useCancelPayment:()=>({})},
  "./use-mint-token":{useMintToken:()=>({})},
  "./use-live-action-history":{useLiveActionHistory:(_address,apiRows,_engines)=>{
    if(!Array.isArray(apiRows))throw new TypeError("Expected useLiveActionHistory API rows argument");
    return {records:apiRows,warning:undefined};
  }},
};
const {QueryClient,QueryObserver}=require("@tanstack/react-query");
const a="0x1111111111111111111111111111111111111111", b="0x2222222222222222222222222222222222222222";
const usdc="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9", hash="0x"+"a".repeat(64);
const locale=JSON.parse(readFileSync(resolve(root,"public/locales/ko.json"),"utf8"));
const projection={chainId:11155111,syncId:"sepolia-v4",status:"synced",projectionStatus:"applied",latestProjectedBlock:"100",latestIndexedBlock:"100",latestProjectedBlockTimestamp:"2026-10-19T00:00:00Z",estimateAt:"2026-10-19T00:00:00Z"};
const cutoff=new Date(projection.estimateAt);
const streams=Array.from({length:4},(_,i)=>({streamId:String(i+1),sender:a,recipient:a,currentOwner:a,token:usdc,depositedAmount:"1000",withdrawnAmount:"100",startTime:"2026-10-09T00:00:00Z",endTime:"2026-10-29T00:00:00Z",cancelable:true,canceledAt:null,createdTxHash:hash,computed:{vestedAmount:"500",claimableEstimate:"400",remainingReceivable:"900",estimateTimestamp:projection.estimateAt},listing:null}));
const node=(type,props)=>({type,props});
const walk=value=>Array.isArray(value)?value.flatMap(walk):value&&typeof value==="object"?[value,...walk(value.props?.children)]:[];
const text=value=>value==null||value===false?"":Array.isArray(value)?value.map(text).join(""):typeof value==="object"?text(value.props?.children):String(value);

function fixture({deadlineMs}={}){
  const cache=new Map();
  const deadlines=[];
  let fetchImpl=()=>{throw Error("No transport installed; real network is prohibited");};
  const signals=deadlineMs===undefined?AbortSignal:{any:values=>AbortSignal.any(values),timeout:ms=>{deadlines.push(ms);return AbortSignal.timeout(deadlineMs);}};
  const config={LIVE_API_BASE:"https://fixture.invalid",LIVE_SYNC_ID:"sepolia-v4",LIVE_USDC:usdc,LIVE_MODE:false};
  const imports={...snapshotActionHookStubs,react:{},"@tanstack/react-query":{},viem:{},"./use-injected-wallet":{},"./use-claim-transaction":{},"./use-create-payment":{},"@/lib/live-chain":{},"@/lib/live-config":config,"./live-config":config,
    "@/components/ui/button":{Button:"button"},"lucide-react":{Coins:"Coins"},
    "@/components/workspace/MintTokenAction":{MintTokenDialog:"MintTokenDialog"},"./MarketAction":{MarketAction:"MarketAction"}};
  function load(file,extra={},expose=""){
    const path=resolve(root,file.endsWith(".ts")||file.endsWith(".tsx")?file:`${file}.ts`);
    if(!Object.keys(extra).length&&!expose&&cache.has(path))return cache.get(path);
    const module={exports:{}};
    const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const localRequire=id=>{
      if(id in extra)return extra[id];
      if(id in imports)return imports[id];
      if(id==="zod")return require(id);
      if(id.startsWith("@/"))return load(resolve(root,"src",id.slice(2)));
      if(id.startsWith("."))return load(resolve(dirname(path),id));
      throw Error(`Unexpected dependency ${id}`);
    };
    vm.runInNewContext(`(function(require,module,exports){${code}\n${expose}\n})`,{Date,BigInt,Intl,Error,AbortSignal:signals,fetch:(...args)=>fetchImpl(...args)})(localRequire,module,module.exports);
    if(!Object.keys(extra).length&&!expose)cache.set(path,module.exports);
    return module.exports;
  }
  const api=load("src/lib/live-api.ts");
  const {readHistory}=load("src/hooks/use-live-snapshot.ts",{},"exports.readHistory=readHistory;");
  function transport({failId,status=503,missingClaims=false,wrongId=false,abort}={}){
    let active=0,peak=0;const calls=[];
    fetchImpl=async url=>{
      const path=new URL(url).pathname;calls.push(path);active++;peak=Math.max(peak,active);
      try{
        if(active>2)return {ok:false,status:503};
        await new Promise(done=>setImmediate(done));
        if(path.includes("/users/"))return {ok:true,json:async()=>({data:[],meta:{projection}})};
        const id=path.split("/").at(-1);
        if(id===failId)return {ok:false,status};
        const data={...streams.find(s=>s.streamId===id),claims:[{id:`claim-${id}`,streamId:id,recipient:a,amount:"100",claimedAt:"2026-10-18T00:00:00Z",transactionHash:hash,logIndex:Number(id)}]};
        if(missingClaims)delete data.claims;
        if(wrongId)data.streamId="999";
        return {ok:true,json:async()=>{if(abort)abort.abort();return {data,meta:{projection}};}};
      }finally{active--;}
    };
    return {calls,peak:()=>peak};
  }
  return {load,api,readHistory,transport,deadlines,setTransport:next=>{fetchImpl=next;},ui:{"react/jsx-runtime":{jsx:node,jsxs:node},"react-i18next":{useTranslation:()=>({t:key=>locale[key]||key})}}};
}

function observedSnapshot(f){
  let config,current={data:undefined,isPending:true,isFetching:false,isError:false};
  const waiters=new Set(),states=[];
  const {useLiveSnapshot}=f.load("src/hooks/use-live-snapshot.ts",{
    react:{useState:initial=>[initial,()=>{}]},
    "@tanstack/react-query":{useQuery:options=>{config=options;return current;}},
    "./use-injected-wallet":{useInjectedWallet:()=>({address:a,session:{}})},
    "./use-claim-transaction":{useClaimTransaction:()=>({})},
    "./use-create-payment":{useCreatePayment:()=>({})},
    "@/lib/live-chain":{readBalances:async()=>({balances:[{token:"MockUSDC",raw:2000000n}],gasRaw:1000n})},
  });
  const render=()=>useLiveSnapshot();
  render();
  const client=new QueryClient(),observer=new QueryObserver(client,config);
  const unsubscribe=observer.subscribe(result=>{
    current=result;
    states.push({status:result.status,fetchStatus:result.fetchStatus,condition:render().scenario.dataCondition});
    for(const check of waiters)check();
  });
  return {observer,render,states,current:()=>current,waitFor:predicate=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{waiters.delete(check);reject(Error("Query result deadline exceeded"));},5000);
    const check=()=>{if(predicate(current)){clearTimeout(timer);waiters.delete(check);resolve(current);}};
    waiters.add(check);check();
  }),dispose:()=>{unsubscribe();observer.destroy();client.clear();}};
}

const untilAbort=(_url,{signal})=>new Promise((_resolve,reject)=>{
  if(signal.aborted)reject(signal.reason);
  else signal.addEventListener("abort",()=>reject(signal.reason),{once:true});
});

function normalResponse(url){
  const path=new URL(url).pathname;
  const data=path==="/streams"?streams:path.includes("/users/")?[]:{...streams.find(s=>s.streamId===path.split("/").at(-1)),claims:[]};
  return Promise.resolve({ok:true,json:async()=>({data,meta:{projection}})});
}

test("DEP-E06 timeout reaches failure after the actual configured retry and can recover",async t=>{
  const f=fixture({deadlineMs:5});let requests=0;
  f.setTransport((...args)=>{requests++;return untilAbort(...args);});
  const observed=observedSnapshot(f);t.after(observed.dispose);
  const result=await observed.waitFor(value=>value.isError&&!value.isFetching);
  assert.equal(requests,2);assert.deepEqual(f.deadlines,[20000,20000]);
  assert.equal(result.error.name,"TimeoutError");assert.equal(result.data,undefined);
  assert.equal(observed.render().scenario.dataCondition,"failure");
  assert.equal(observed.render().balancesReady,false);assert.equal(observed.render().historyReady,false);
  f.setTransport(normalResponse);
  await observed.observer.refetch();
  const recovered=observed.render();
  assert.equal(recovered.claims.length,4);assert.equal(recovered.balancesReady,true);assert.equal(recovered.historyReady,true);
  assert.equal(recovered.scenario.dataCondition,"stale");
  assert.ok(observed.states.some(value=>value.condition==="failure"));
});

test("DEP-E06 history timeout keeps verified balances but marks personal history unavailable",async t=>{
  const f=fixture({deadlineMs:5});
  f.setTransport((url,options)=>new URL(url).pathname==="/streams"?normalResponse(url):untilAbort(url,options));
  const observed=observedSnapshot(f);t.after(observed.dispose);
  await observed.waitFor(value=>value.isSuccess&&!value.isFetching);
  const snapshot=observed.render();
  assert.deepEqual(f.deadlines,[20000,20000]);
  assert.equal(snapshot.claims.length,4);assert.equal(snapshot.balancesReady,true);
  assert.equal(snapshot.historyReady,false);assert.equal(snapshot.records.length,0);
  assert.equal(snapshot.balances[0].raw,2000000n);
  assert.equal(snapshot.scenario.dataCondition,"stale");
});

test("Q1 reproducer: four parallel detail reads exceed a two-slot API",async()=>{
  const f=fixture(),transport=f.transport();
  const result=await Promise.allSettled(streams.map(s=>f.api.readApi(`/streams/${s.streamId}`,f.api.detailSchema)));
  assert.equal(result.filter(r=>r.status==="rejected").length,2);
  assert.equal(result.filter(r=>r.status==="fulfilled").length,2);
  assert.ok(transport.peak()>2);
});

test("Q1 history collection stays within one slot and retains all four claim records",async()=>{
  const f=fixture(),transport=f.transport(),records=await f.readHistory(streams,a,cutoff,new AbortController().signal);
  assert.equal(transport.peak(),1);assert.equal(records.length,4);
  assert.equal(transport.calls.length,5);assert.deepEqual(Array.from(records,r=>r.claimId).sort(),["1","2","3","4"]);
});

for(const status of [429,503])test(`history HTTP ${status} rejects instead of returning a partial/zero history`,async()=>{
  const f=fixture(),transport=f.transport({failId:"2",status});
  await assert.rejects(()=>f.readHistory(streams,a,cutoff,new AbortController().signal),new RegExp(String(status)));
  assert.equal(transport.calls.includes("/streams/3"),false);assert.equal(transport.calls.includes("/streams/4"),false);
});

for(const patch of [{missingClaims:true},{wrongId:true}])test(`incomplete detail ${JSON.stringify(patch)} fails closed`,async()=>{
  const f=fixture(),transport=f.transport(patch);
  await assert.rejects(()=>f.readHistory(streams,a,cutoff,new AbortController().signal),/Incomplete claim history/);
  assert.equal(transport.calls.length,2);
});

test("an aborted account query never starts the next history request",async()=>{
  const f=fixture(),abort=new AbortController(),transport=f.transport({abort});
  await assert.rejects(()=>f.readHistory(streams,a,cutoff,abort.signal),/abort/i);
  assert.equal(transport.calls.length,2);
});

test("unknown history cannot assert either purchase or direct acquisition",()=>{
  const f=fixture(),model=f.load("src/lib/workspace-model.ts"),claim={id:"1",originalRecipient:a};
  const records=[{claimId:"1",accountKey:a,kind:"buy",phase:"completed",amountRaw:400n,requestedAt:"2026-10-18T00:00:00Z"}];
  assert.equal(model.acquisitionFor(claim,[],a,false).label,"unknown");
  assert.equal(model.acquisitionFor(claim,records,a,false).label,"unknown");
  assert.equal(model.acquisitionFor(claim,records,a,true).label,"purchased");
  assert.equal(model.acquisitionFor(claim,[],a,true).label,"direct");
  assert.equal(model.acquisitionFor(claim,[],b,true).label,"transferUnknown");
});

const claim={id:"1",token:"MockUSDC",payer:b,owner:a,originalRecipient:a,deposited:1000n,claimed:100n,startAt:"2026-10-09T00:00:00Z",endAt:"2026-10-29T00:00:00Z",cancellable:true,ownership:"verified"};
const components=Object.fromEntries(["DetailButton","EmptyRows","FieldRow","Figure","FilterTabs","PageHeading","ReviewModal","Tag","WalletGate","ExecutionFooter"].map(v=>[v,v]));

test("Q2 assets and owned detail display unknown acquisition when history is unavailable",()=>{
  const f=fixture(),snapshot={source:"live",claims:[claim],records:[],listings:[],balances:[],address:a,accountKey:a,now:cutoff,paymentTokens:["MockUSDC"],balancesReady:false,historyReady:false,scenario:{screens:{assets:"normal"},dataCondition:"normal"}};
  const {default:Assets}=f.load("src/pages/assets/WorkspaceAssets.tsx",{...f.ui,react:{useState:v=>[v,()=>{}]},"@/hooks/use-workspace-snapshot":{useWorkspaceSnapshot:()=>snapshot},"@/components/workspace/WorkspaceUI":components,"@/components/workspace/WorkspaceDataState":{WorkspaceDataState:"WorkspaceDataState"},"@/components/workspace/PaymentStatus":{PaymentStatus:"PaymentStatus"},"@/components/workspace/ClaimReviewDialog":{ClaimReviewDialog:"ClaimReviewDialog"},"./AssetComposition":{AssetComposition:"AssetComposition"}});
  const acquisition=walk(Assets()).find(n=>n.type==="td"&&n.props["data-label"]===locale["workspace.claimAcquisition"]);
  assert.ok(text(acquisition).includes(locale["workspace.unknown"]));assert.ok(!text(acquisition).includes(locale["workspace.direct"]));
  const {ClaimReviewDialog}=f.load("src/components/workspace/ClaimReviewDialog.tsx",{...f.ui,"@/components/workspace/WorkspaceUI":components,"./WorkspaceUI":components,"./PaymentStatus":{PaymentStatus:"PaymentStatus"},"./ClaimAction":{ClaimAction:"ClaimAction"},"@/providers/live-context":{useLiveWorkspace:()=>null}});
  const field=walk(ClaimReviewDialog({...snapshot,claim,onClose:()=>{}})).find(n=>n.type==="FieldRow"&&n.props.label===locale["workspace.acquiredBy"]);
  assert.equal(text(field),locale["workspace.unknown"]);
});

test("Q1 an open receipt survives history refresh failure but not an account change",()=>{
  const f=fixture(),states=[],effects=[],dependencies=[];let cursor=0,effectCursor=0;
  const record={id:"tx-1",accountKey:a,claimId:"1",kind:"buy",phase:"completed",amountRaw:400n,token:"MockUSDC",requestedAt:"2026-10-18T00:00:00Z",explorerUrl:`https://sepolia.etherscan.io/tx/${hash}`};
  const snapshot={source:"live",address:a,accountKey:a,historyReady:true,records:[record],scenario:{dataCondition:"normal"},refresh(){},connect(){}};
  const react={useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v;}];},useEffect:(fn,deps)=>{const i=effectCursor++;if(!dependencies[i]||deps.some((v,j)=>v!==dependencies[i][j])){dependencies[i]=deps;effects.push(fn);}}};
  const {default:Page}=f.load("src/pages/transactions/index.tsx",{...f.ui,react,"@/hooks/use-workspace-snapshot":{useWorkspaceSnapshot:()=>snapshot},"@/components/workspace/WorkspaceUI":components,"@/components/workspace/WorkspaceDataState":{WorkspaceDataState:"WorkspaceDataState"}});
  const render=()=>{cursor=0;effectCursor=0;const tree=Page();effects.splice(0).forEach(fn=>fn());return walk(tree);};
  render().find(n=>n.type==="DetailButton").props.onClick();assert.ok(render().some(n=>n.type==="ReviewModal"));
  snapshot.records=[];snapshot.historyReady=false;
  const nodes=render(),modal=nodes.find(n=>n.type==="ReviewModal"),data=nodes.find(n=>n.type==="WorkspaceDataState");
  assert.ok(modal);assert.ok(!walk(data).includes(modal));assert.ok(text(modal).includes(locale["live.historyDetailStale"]));
  snapshot.address=b;snapshot.accountKey=b;assert.ok(!render().some(n=>n.type==="ReviewModal"));
  snapshot.address=a;snapshot.accountKey=a;assert.ok(!render().some(n=>n.type==="ReviewModal"));
});

function transactionsFixture(snapshot){
  const f=fixture(),states=[],effects=[],dependencies=[];let cursor=0,effectCursor=0;
  const react={useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=v;}];},useEffect:(fn,deps)=>{const i=effectCursor++;if(!dependencies[i]||deps.some((v,j)=>v!==dependencies[i][j])){dependencies[i]=deps;effects.push(fn);}}};
  const {default:Page}=f.load("src/pages/transactions/index.tsx",{...f.ui,react,"@/hooks/use-workspace-snapshot":{useWorkspaceSnapshot:()=>snapshot},"@/components/workspace/WorkspaceUI":components,"@/components/workspace/WorkspaceDataState":{WorkspaceDataState:"WorkspaceDataState"}});
  const render=()=>{cursor=0;effectCursor=0;const nodes=walk(Page());effects.splice(0).forEach(fn=>fn());return nodes;};
  const rows=()=>render().filter(n=>n.type==="tr"&&walk(n).some(child=>child.type==="td"));
  return {render,rows,tabs:()=>render().find(n=>n.type==="FilterTabs"),snapshot};
}

test("staged transactions retain all ten live filters and isolate local records by account",()=>{
  const kinds=["buy","sale","claim","create","approve","list","unlist","cancel-payment","mint"];
  const records=kinds.map((kind,index)=>({id:`local-${index}`,accountKey:a,claimId:String(index+1),kind:kind==="sale"?"buy":kind,role:kind==="sale"?"seller":undefined,
    phase:"submitted",origin:"local",amountMeaning:"unknown",amountRaw:999n,token:"MockUSDC",requestedAt:`2026-10-18T00:00:0${index}Z`}));
  const f=transactionsFixture({source:"live",address:a,accountKey:a,historyReady:false,records:[...records,{...records[0],id:"foreign",accountKey:b,claimId:"999"}],scenario:{dataCondition:"normal"},refresh(){},connect(){}});
  assert.deepEqual(Array.from(f.tabs().props.options,o=>o.value),["all",...kinds]);assert.equal(f.rows().length,9);
  for(const [index,kind] of kinds.entries()){
    f.tabs().props.onChange(kind);const rows=f.rows();assert.equal(rows.length,1);assert.ok(text(rows[0]).includes(`#${index+1}`));assert.ok(!text(rows[0]).includes("#999"));
  }
  f.tabs().props.onChange("all");assert.equal(f.rows().length,9);
});

test("staged local history survives API failure without inventing amounts or confirmed receipts",()=>{
  const record={id:"local-unknown",accountKey:a,kind:"approve",phase:"stalled",origin:"local",amountMeaning:"none",amountRaw:999n,token:"MockUSDC",requestedAt:"2026-10-18T00:00:00Z",failureReason:"actions.otherPending"};
  const f=transactionsFixture({source:"live",address:a,accountKey:a,historyReady:false,historyWarning:"actions.storageUnavailable",records:[record,{...record,id:"local-value-unknown",amountMeaning:"unknown"}],scenario:{dataCondition:"failure"},refresh(){},connect(){}});
  let nodes=f.render();assert.equal(nodes.find(n=>n.type==="WorkspaceDataState").props.condition,"normal");assert.equal(f.rows().length,2);
  assert.ok(nodes.some(n=>n.props?.role==="status"&&text(n)===(locale["actions.historyPartial"]||"actions.historyPartial")));
  assert.ok(nodes.some(n=>n.props?.role==="status"&&text(n)===(locale["actions.storageUnavailable"]||"actions.storageUnavailable")));
  for(const [index,row] of f.rows().entries()){
    const amount=walk(row).find(n=>n.type==="td"&&n.props["data-label"]===locale["workspace.txAmount"]);
    assert.ok(text(amount).includes(locale[index===0?"actions.notApplicable":"workspace.unknown"]));assert.ok(!walk(amount).some(n=>n.type==="Figure"));
    const tag=walk(row).find(n=>n.type==="Tag");assert.equal(tag.props.tone,"warning");assert.equal(text(tag),locale["actions.historyPhase.stalled"]||"actions.historyPhase.stalled");
  }
  nodes.find(n=>n.type==="DetailButton").props.onClick();nodes=f.render();const modal=nodes.find(n=>n.type==="ReviewModal");
  assert.ok(modal);assert.ok(!walk(modal).some(n=>n.type==="Figure"));assert.ok(text(modal).includes(locale["actions.localReceipt"]||"actions.localReceipt"));
  assert.ok(walk(modal).some(n=>n.props?.role==="alert"&&text(n)===(locale["actions.otherPending"]||"actions.otherPending")));
  f.snapshot.records=[];assert.equal(f.render().find(n=>n.type==="WorkspaceDataState").props.condition,"failure");
});

function paymentForm(){
  const f=fixture(),state=[false,"","",a,"MockUSDC","1","2026-10-24T01:00","2026-10-24T01:20",false,0n];let cursor=0;
  const {CreatePaymentDialog}=f.load("src/pages/issued/CreatePaymentDialog.tsx",{...f.ui,react:{useState:()=>{const i=cursor++;return[state[i],value=>{state[i]=value;}];}},"@/components/ui/button":{Button:"button"},"@/components/workspace/WorkspaceUI":components,"@/components/workspace/CreatePaymentAction":{CreatePaymentAction:"CreatePaymentAction"}});
  const nodes=()=>{cursor=0;return walk(CreatePaymentDialog({open:true,onClose(){},balances:[{token:"MockUSDC",raw:2000000n}],paymentTokens:["MockUSDC"]}));};
  const change=(placeholder,value)=>nodes().find(n=>n.type==="input"&&n.props.placeholder===placeholder).props.onChange({target:{value}});
  const submit=()=>{nodes().find(n=>n.type==="form").props.onSubmit({preventDefault(){}});return{review:state[0],error:state[1],raw:state[9]};};
  return {state,nodes,change,submit};
}

for(const [value,error] of [["0","workspace.invalidAmount"],["-1","workspace.invalidAmount"],["0.0000001","workspace.invalidAmount"],["1e2","workspace.invalidAmount"],["2.000001","workspace.insufficientBalance"]])test(`DEP-E01 real form submit rejects ${value} with valid recipient and dates`,()=>{
  const f=paymentForm();f.change("0.00",value);const result=f.submit();assert.equal(result.review,false);assert.equal(result.error,error);
});

for(const [value,raw] of [["0.000001",1n],["2",2000000n]])test(`DEP-E01 real form submit accepts exact supported amount ${value}`,()=>{
  const f=paymentForm();f.change("0.00",value);const result=f.submit();assert.equal(result.error,"");assert.equal(result.review,true);assert.equal(result.raw,raw);
});

for(const recipient of ["0x"+"0".repeat(40),"0x1234"])test(`DEP-E02 real form rejects recipient ${recipient}`,()=>{
  const f=paymentForm();f.change("0x…",recipient);const result=f.submit();assert.equal(result.review,false);assert.equal(result.error,"workspace.invalidRecipient");
});

for(const [start,end] of [["2026-10-24T01:00","2026-10-24T01:00"],["2026-10-24T01:01","2026-10-24T01:00"],["invalid","2026-10-24T01:00"]])test(`DEP-E03 real form rejects invalid interval ${start}/${end}`,()=>{
  const f=paymentForm();f.state[6]=start;f.state[7]=end;const result=f.submit();assert.equal(result.review,false);assert.equal(result.error,"workspace.invalidPeriod");
});

test("DEP-E04 the actual name input declares the 60 UTF-16 unit boundary",()=>{
  const f=paymentForm(),name=f.nodes().find(n=>n.type==="input"&&n.props.maxLength===60);
  assert.ok(name);assert.equal(name.props.value,"");
});
