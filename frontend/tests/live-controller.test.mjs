import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const owner="0x1111111111111111111111111111111111111111",buyer="0x2222222222222222222222222222222222222222";
const contracts=require("../lib/contracts.ts").sepoliaContracts;
const reviewed={account:buyer,id:"1",seller:owner,price:40000000n,remaining:100000000n,withdrawn:0n,canceled:false};
function harness(options={}) {
 const effects=[],writes=[],states=[],receiptHash="0x"+"a".repeat(64);
 let account=options.account??owner, withdrawn=0n;
 const chainStream={sender:owner,token:contracts.mockUSDC,depositedAmount:100000000n,startTime:0n,endTime:100n,withdrawnAmount:withdrawn,cancelable:true,canceled:false,canceledAt:0n,...options.stream};
 const listing={seller:options.listed===false?"0x"+"0".repeat(40):owner,price:40000000n,...options.listing};
 function read(name) {
  return {getStream:{...chainStream,withdrawnAmount:withdrawn+chainStream.withdrawnAmount},ownerOf:options.owner??owner,
  claimableAmount:options.claimable??20000000n,vestedAmount:50000000n,getListing:listing,balanceOf:options.balance??200000000n,
  nextStreamId:3n,paymentToken:contracts.mockUSDC,receivableNft:contracts.receivableStream,name:"MockUSDC",symbol:"mUSDC"}[name];
 }
 const publicClient={getTransactionReceipt:async()=>{if(options.receiptError)throw new Error("missing");return {status:options.revert?"reverted":"success",blockNumber:10n,logs:[]};},getBlock:async()=>({timestamp:50n}),readContract:async request=>read(request.functionName),
 waitForTransactionReceipt:async()=>{if(options.afterReceipt)options.afterReceipt({changeAccount:x=>account=x,changeWithdrawn:x=>withdrawn=x});
  if(options.receiptError)throw new Error("receipt unavailable");
  return {status:options.revert?"reverted":"success",blockNumber:10n,logs:[]};}};
 let stateIndex=0;
 const initial={1:owner,7:"1",13:options.account??owner,...options.state};
 const react={useEffect(fn,deps){effects.push({fn,deps});},useMemo:fn=>fn(),useState:value=>{const i=stateIndex++;const current=Object.hasOwn(initial,i)?initial[i]:value;return [current,next=>states.push({index:i,value:next})];}};
 const wagmi={useAccount:()=>({address:options.account??owner,isConnected:true}),useChainId:()=>11155111,
 useConnect:()=>({connect(){},connectors:[],isPending:false}),useDisconnect:()=>({disconnect(){}}),useSwitchChain:()=>({switchChain(){}}),
 usePublicClient:()=>publicClient,useReadContract:r=>({data:read(r.functionName),dataUpdatedAt:1,isError:false,refetch:async()=>({data:read(r.functionName),isError:false})}),
 useWriteContract:()=>({isPending:false,writeContractAsync:async r=>{if(options.writeError)throw options.writeError;writes.push(r);return receiptHash;}})};
 const query={useQuery:r=>({data:r.queryKey[0]==="chain-block"?{timestamp:50n}:r.queryKey[0]==="listings"?{data:[],meta:{projection:{latestProjectedBlock:"10"}}}:{data:[]},
 dataUpdatedAt:1,isError:false,refetch:async()=>({isError:false})})};
 const mocks={"react":react,"wagmi":wagmi,"wagmi/actions":{getAccount:()=>({address:account,chainId:options.currentChain??11155111})},
 "../lib/wagmi":{wagmiConfig:{}},"@tanstack/react-query":query,
 "../lib/api":{VestoraApiError:class extends Error{}},
 "../lib/contracts":require("../lib/contracts.ts"),
 "../lib/pending-transaction":require("../lib/pending-transaction.ts"),
 "../lib/transaction-policy":require("../lib/transaction-policy.ts"),
 "../lib/format":{sameAddress:(a,b)=>!!a&&!!b&&a.toLowerCase()===b.toLowerCase(),formatTokenAmount:(v)=>String(v)}};
 const source=fs.readFileSync(new URL("../hooks/use-vestora.ts",import.meta.url),"utf8");
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const compiledModule={exports:{}};
 vm.runInNewContext(compiled,{module:compiledModule,exports:compiledModule.exports,require:name=>mocks[name]??require(name),Date,BigInt,Promise,console});
 return {controller:compiledModule.exports.useVestora(),writes,states,effects};
}
test("claim refreshes authority before writing; owner mismatch or zero claim prevents submission",async()=>{
 for(const options of [{owner:buyer},{claimable:0n}]){const h=harness(options);await h.controller.handleClaim();assert.equal(h.writes.length,0);assert.equal(h.states.at(-1).value.status,"error");}
 const h=harness();await h.controller.handleClaim();assert.equal(h.writes[0].functionName,"claim");assert.equal(h.writes[0].chainId,11155111);assert.equal(h.writes[0].account,owner);
});
test("list checks owner again after NFT approval; existing listing is not overwritten",async()=>{
 const h=harness({listed:true});await h.controller.handleList();assert.deepEqual(h.writes.map(r=>r.functionName),["approve"]);assert.equal(h.states.at(-1).value.status,"error");
});
test("wallet/network changes prevent signing using stale UI account",async()=>{
 for(const options of [{currentChain:1},{afterReceipt:({changeAccount})=>changeAccount(buyer),listed:false}]){
  const h=harness(options);await h.controller.handleList();assert.ok(h.writes.length<=1);assert.ok(!h.writes.some(r=>r.functionName==="list"));
 }
});
test("buy retains protected settlement and rechecks after payment approval",async()=>{
 const h=harness({account:buyer});await h.controller.handleBuy(reviewed);
 assert.deepEqual(h.writes.map(r=>r.functionName),["approve","buyWithProtection"]);
 assert.deepEqual([...h.writes[1].args],[1n,40000000n,100000000n,0n,owner]);
});
test("changed withdrawn value after approval cannot silently lower acquired rights",async()=>{
 const h=harness({account:buyer,afterReceipt:({changeWithdrawn})=>changeWithdrawn(10000000n)});
 await assert.rejects(h.controller.handleBuy(reviewed),/변경/);
 assert.deepEqual(h.writes.map(r=>r.functionName),["approve"]);
});
test("self buy and insufficient token balance never submit purchase",async()=>{
 const own=harness();await own.controller.handleBuy({...reviewed,account:owner});assert.equal(own.writes.length,0);
 const poor=harness({account:buyer,balance:1n});await assert.rejects(poor.controller.handleBuy(reviewed),/잔액/);assert.equal(poor.writes.length,0);
});
test("cancel requires sender, cancelability and uncanceled state",async()=>{
 for(const options of [{account:buyer},{stream:{cancelable:false}},{stream:{canceled:true}}]){
  const h=harness(options);await h.controller.handleCancelStream();assert.equal(h.writes.length,0);
 }
 const h=harness();await h.controller.handleCancelStream();assert.equal(h.writes[0].functionName,"cancel");
});
test("creation rejects malformed schedule or recipient before approval",async()=>{
 const schedule=harness({state:{3:"Infinity"}});await assert.rejects(schedule.controller.handleCreateStream(),/정수/);assert.equal(schedule.writes.length,0);
 const address=harness({state:{1:"0x"+"0".repeat(40)}});await address.controller.handleCreateStream();assert.equal(address.writes.length,0);
});
test("receipt timeout is unknown outcome rather than safe-to-retry failure",async()=>{
 const h=harness({receiptError:true});await h.controller.handleClaim();assert.equal(h.states.at(-1).value.phase,"unknown");assert.equal(h.writes.length,1);
});

test("purchase retains the user-reviewed terms before any approval",async()=>{
 for(const change of [{price:39000000n},{seller:buyer},{remaining:110000000n},{withdrawn:1n},{canceled:true},{account:owner},{id:"2"}]){
  const h=harness({account:buyer});
  await assert.rejects(h.controller.handleBuy({...reviewed,...change}),/변경/);
  assert.equal(h.writes.length,0);
 }
});

test("restored transaction recovery reads receipts without signing or continuing approval",async()=>{
 for(const label of ["Claim Stream","Approve Marketplace Payment"]){
  for(const kind of ["success","revert","missing"]){
   const h=harness({revert:kind==="revert",receiptError:kind==="missing",state:{9:{label,hash:"0x"+"a".repeat(64),status:"error",phase:"unknown"}}});
   await h.controller.recoverTransaction();
   assert.equal(h.writes.length,0);
   assert.equal(h.states.filter(s=>s.index===9).at(-1).value.phase,kind==="missing"?"unknown":kind==="revert"?"error":label.startsWith("Approve")?"completed":"indexing_pending");
  }
 }
});

test("wallet hydration restores a saved pending transaction and selected stream",()=>{
 const pending=require("../lib/pending-transaction.ts");
 const record={version:1,account:owner,chainId:11155111,hash:"0x"+"a".repeat(64),label:"Claim Stream",streamId:"2"};
 globalThis.window={localStorage:{getItem:key=>key===pending.pendingKey(owner,contracts.receivableStream)?JSON.stringify(record):null}};
 try {
  const h=harness();h.effects.find(e=>e.deps?.length===1&&e.deps[0]===owner).fn();
  assert.equal(h.states.find(s=>s.index===9).value.phase,"unknown");
  assert.equal(h.states.find(s=>s.index===7).value,"2");
  assert.equal(h.writes.length,0);
  const other=harness({account:buyer});other.effects.find(e=>e.deps?.length===1&&e.deps[0]===buyer).fn();
  assert.equal(other.states.find(s=>s.index===9).value.phase,"idle");
 }finally{delete globalThis.window;}
});

test("wallet rejection is not shown as chain failure and never submits",async()=>{
 const h=harness({writeError:{cause:{code:4001}}});await h.controller.handleClaim();
 assert.equal(h.writes.length,0);assert.equal(h.states.filter(s=>s.index===9).at(-1).value.phase,"rejected");
 const rpc=harness({writeError:{code:-32000}});await rpc.controller.handleClaim();
 assert.equal(rpc.states.filter(s=>s.index===9).at(-1).value.phase,"error");
});
