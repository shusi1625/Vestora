import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync,existsSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {createRequire} from "node:module";
import {randomUUID} from "node:crypto";
import vm from "node:vm";

const root=resolve(import.meta.dirname,".."),feature=resolve(root,"../../"),source=existsSync(resolve(root,"src/lib/types.ts"))?root:resolve(process.env.VESTORA_FRONTEND_ROOT||"C:/GitHub/Vestora/frontend");
const require=createRequire(resolve(source,"package.json")),ts=require("typescript"),viem=require("viem");
const account="0x1111111111111111111111111111111111111111",other="0x2222222222222222222222222222222222222222";
const stream="0x2b6beCf31c41c25f3A4eF73F6dAEEff85dB8eD1a",market="0x6184F4C3718447aBbe8B5Eb2bb73163C9Cfc49d7",usdc="0xD8E66a5bfbf8DEa75DfbDc0C1EE65612504Fb7F9";
const hash="0x"+"a".repeat(64),hash2="0x"+"b".repeat(64),blockHash="0x"+"c".repeat(64),held="0xbf9bf852225899b667aa4c73bb082e830abb9de1";
const scope={account,chainId:11155111,streamContract:stream,marketContract:market,tokenContract:usdc};
const provider={request:()=>{throw Error("Wallet is prohibited");}},token={account,chainId:"0xaa36a7",revision:1,provider};
const session={capture:()=>token,assertCurrent:async()=>{}};
const storage=()=>{const data=new Map(),reads=[],writes=[];return {data,reads,writes,getItem:k=>{reads.push(k);return data.get(k)??null;},setItem:(k,v)=>{writes.push(k);data.set(k,v);}};};
function loader(globals={}){
  const cache=new Map();return function load(file){
    let path=resolve(root,file.endsWith(".ts")?file:`${file}.ts`);
    if(!existsSync(path)){
      const marker=path.replaceAll("\\","/").lastIndexOf("/src/");
      path=resolve(source,marker>=0?path.replaceAll("\\","/").slice(marker+1):file);
    }
    if(cache.has(path))return cache.get(path);
    const module={exports:{}};cache.set(path,module.exports);
    const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const get=id=>id==="viem"?viem:id==="./live-config"?{LIVE_STREAM:stream,LIVE_MARKET:market,LIVE_USDC:usdc}:id.startsWith(".")?load(resolve(dirname(path),id)):(()=>{throw Error(`Unexpected import ${id}`);})();
    vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Date,BigInt,Intl,Error,console,crypto:{randomUUID},fetch:()=>{throw Error("Network prohibited");},...globals})(get,module,module.exports);
    return module.exports;
  };
}
const load=loader(),{createLiveActionHistoryJournal:create,liveActionHistoryKey:keyOf}=load("src/lib/live-action-history");
const memory=(extras={})=>create(scope,{storage:null,now:()=>1000,...extras});
const rows=j=>[...j.getRows()];
const one=j=>{assert.equal(j.getRows().length,1);return j.getRows()[0];};
const pending=(patch={})=>({account,contract:stream,chainId:11155111,id:"3",createdAt:100,...patch});
const claimWallet=(patch={})=>({phase:"wallet",quote:{account,token,id:"3",amount:40n},pending:pending(),...patch});
const claimDone=(patch={})=>({phase:"completed",id:"3",evidence:{hash,block:11n,amount:50n,logIndex:2},...patch});
const api=(patch={})=>({id:"claim:api:2",kind:"claim",claimId:"3",token:"MockUSDC",amountRaw:50n,role:"owner",requestedAt:new Date(200).toISOString(),phase:"completed",accountKey:account,hash,...patch});

test("the staged module typechecks against current source types without editing them",()=>{
  const target=resolve(source,"src/lib/live-action-history.ts"),body=readFileSync(resolve(root,"src/lib/live-action-history.ts"),"utf8"),config=ts.readConfigFile(resolve(source,"tsconfig.app.json"),ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,source),host=ts.createCompilerHost(parsed.options),read=host.readFile,exists=host.fileExists,canonical=p=>resolve(p).replaceAll("\\","/").toLowerCase();
  host.readFile=p=>canonical(p)===canonical(target)?body:read(p);host.fileExists=p=>canonical(p)===canonical(target)||exists(p);
  const program=ts.createProgram([target],{...parsed.options,noEmit:true},host),diagnostics=ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:p=>p,getCurrentDirectory:()=>source,getNewLine:()=>"\n"}));
});
test("the staged module passes existing TypeScript ESLint rules",async()=>{
  const {ESLint}=require("eslint"),eslint=new ESLint({cwd:source}),results=await eslint.lintText(readFileSync(resolve(root,"src/lib/live-action-history.ts"),"utf8"),{filePath:resolve(source,"src/lib/live-action-history.ts")});
  assert.deepEqual(results.flatMap(r=>r.messages.filter(m=>m.severity===2).map(m=>`${m.line}: ${m.message}`)),[]);
});
test("scope key includes chain, every deployment address and lowercase account",()=>{
  assert.equal(keyOf(scope),`vestora:action-history:v1:11155111:${stream.toLowerCase()}:${market.toLowerCase()}:${usdc.toLowerCase()}:${account}`);
  assert.equal(keyOf({...scope,account:account.toUpperCase()}),keyOf(scope));
  for(const patch of [{account:other},{chainId:1},{streamContract:other},{marketContract:other},{tokenContract:other}])assert.notEqual(keyOf({...scope,...patch}),keyOf(scope));
});
test("review, preflight checking and an error before a wallet request create no fictional transaction",()=>{
  const j=memory();for(const phase of ["idle","checking","preparing","review","error"]){j.observe("claim",{phase,quote:{amount:40n,id:"3"}},account);assert.equal(rows(j).length,0);}
});
test("claim captures requested amount and keeps actual receipt amounts exclusive to completed rows",()=>{
  const j=memory();j.observe("claim",claimWallet(),account);assert.equal(one(j).amountRaw,40n);assert.equal(one(j).amountMeaning,"requested");assert.equal(one(j).phase,"wallet-pending");
  const id=one(j).id;j.observe("claim",{...claimDone(),phase:"indexing",pending:pending({hash})},account);assert.equal(one(j).id,id);assert.equal(one(j).phase,"indexing");assert.equal(one(j).amountRaw,40n);assert.equal(one(j).amountMeaning,"requested");
  j.observe("claim",claimDone(),account);assert.equal(one(j).id,id);assert.equal(one(j).amountRaw,50n);assert.equal(one(j).amountMeaning,"transferred");assert.equal(one(j).phase,"completed");
});
test("terminal claim rejection and provider errors retain wallet amount/id with safe error keys",()=>{
  for(const [phase,mapped] of [["rejected","rejected"],["error","stalled"],["unknown","stalled"],["reverted","failed-onchain"],["replaced","replaced"]]){
    const j=memory();j.observe("claim",claimWallet(),account);j.observe("claim",{phase,error:"claim.walletGasUnresolved"},account);
    assert.equal(one(j).phase,mapped);assert.equal(one(j).amountRaw,40n);assert.equal(one(j).claimId,"3");assert.equal(one(j).amountMeaning,"requested");
  }
});
test("a restored hashless claim has unknown amount instead of an invented zero transfer",()=>{
  const j=memory();j.observe("claim",{phase:"unknown",pending:pending()},account);assert.equal(one(j).amountRaw,0n);assert.equal(one(j).amountMeaning,"unknown");assert.equal(one(j).phase,"stalled");
});
test("completed without valid receipt evidence is stalled and cannot enter completed-claim sums",()=>{
  for(const evidence of [undefined,{hash,block:11n},{hash,block:-1n,amount:40n},{hash:"bad",block:11n,amount:40n}]){
    const j=memory();j.observe("claim",claimWallet(),account);j.observe("claim",{phase:"completed",id:"3",evidence},account);
    assert.notEqual(one(j).phase,"completed");assert.notEqual(one(j).amountMeaning,"transferred");
  }
});
test("verified receipt context survives late submitted, unknown and error observations",()=>{
  const j=memory();j.observe("claim",claimWallet(),account);j.observe("claim",claimDone(),account);
  for(const phase of ["submitted","unknown","error"]){j.observe("claim",{phase,pending:pending({hash}),error:"claim.readFailed"},account);assert.equal(one(j).phase,"completed");assert.equal(one(j).amountRaw,50n);}
});
test("create approval is an allowance, has no fake claim ID and stays distinct from creation",()=>{
  const j=memory(),draft={recipient:other,amount:200n,start:200n,end:800n,cancelable:true,name:"test"};
  j.observe("create",{phase:"wallet",quote:{account,token,step:"approval",draft},pending:pending({id:undefined,step:"approval",draft:{...draft,amount:"200",start:"200",end:"800"}})},account);
  j.observe("create",{phase:"approved",evidence:{hash,block:11n}},account);
  assert.equal(one(j).kind,"approve");assert.equal(one(j).amountMeaning,"allowance");assert.equal(one(j).amountRaw,200n);assert.equal(one(j).relatedAction,"create");assert.equal(one(j).claimId,"");
  j.observe("create",{phase:"review",quote:{step:"create",draft}},account);
  j.observe("create",{phase:"wallet",quote:{account,token,step:"create",draft},pending:pending({id:undefined,step:"create",createdAt:300,draft:{...draft,amount:"200",start:"200",end:"800"}})},account);
  j.observe("create",{phase:"completed",evidence:{hash:hash2,block:12n,streamId:"4"}},account);
  assert.equal(rows(j).length,2);const row=rows(j).find(r=>r.kind==="create");assert.equal(row.claimId,"4");assert.equal(row.amountMeaning,"transferred");assert.equal(row.amountRaw,200n);
});
test("observing only terminal creation does not recover a lost deposit amount by guessing",()=>{
  const j=memory();j.observe("create",{phase:"completed",evidence:{hash,block:11n,streamId:"4"}},account);
  assert.equal(one(j).kind,"create");assert.equal(one(j).phase,"completed");assert.equal(one(j).amountMeaning,"unknown");assert.equal(one(j).amountRaw,0n);assert.equal(one(j).claimId,"4");
});
test("market terminal states retain buy/list/approval context after engine clears pending and quote",()=>{
  for(const [step,kind,meaning,amount,relatedAction] of [["buy","buy","price",180n,undefined],["list","list","price",180n,undefined],["erc20-approval","approve","allowance",180n,"buy"],["nft-approval","approve","none",0n,"list"],["cancel-listing","unlist","none",0n,undefined]]){
    const j=memory(),p=pending({contract:market,step,price:"180",reservation:step});
    j.observe("market",{phase:"wallet",pending:p},account);j.observe("market",{phase:kind==="approve"?"approved":"completed",id:"3",evidence:{hash,block:11n,id:"3",step,price:180n,logIndex:2}},account);
    const r=one(j);assert.equal(r.kind,kind);assert.equal(r.amountMeaning,meaning);assert.equal(r.amountRaw,amount);assert.equal(r.relatedAction,relatedAction);assert.equal(r.phase,"completed");
  }
});
test("market rejection with no terminal metadata still retains asking price and action",()=>{
  const j=memory();j.observe("market",{phase:"wallet",pending:pending({contract:market,step:"list",price:"180"})},account);j.observe("market",{phase:"rejected",id:"3"},account);
  assert.equal(one(j).kind,"list");assert.equal(one(j).amountMeaning,"price");assert.equal(one(j).amountRaw,180n);assert.equal(one(j).phase,"rejected");
});
test("cancel uses actual sender refund including zero, never owner's vested rights",()=>{
  for(const refund of [0n,70n]){
    const j=memory();j.observe("cancel",{phase:"wallet",quote:{account,sender:account,refund:80n},pending:pending()},account);
    j.observe("cancel",{phase:"indexing",id:"3",evidence:{hash,block:11n,refund,vested:100n-refund}},account);assert.equal(one(j).amountMeaning,"requested");assert.equal(one(j).amountRaw,80n);
    j.observe("cancel",{phase:"completed",id:"3",evidence:{hash,block:11n,refund,vested:100n-refund}},account);
    assert.equal(one(j).amountMeaning,"transferred");assert.equal(one(j).amountRaw,refund);assert.equal(one(j).role,"payer");
  }
});
test("mint is explicit, has no receivable ID and only becomes transferred with completed evidence",()=>{
  const j=memory(),p=pending({contract:usdc,id:undefined,amount:"300"});
  j.observe("mint",{phase:"wallet",pending:p},account);assert.equal(one(j).amountMeaning,"requested");assert.equal(one(j).claimId,"");
  j.observe("mint",{phase:"completed",evidence:{hash,block:11n,amount:300n,account,tokenAddress:usdc}},account);
  assert.equal(one(j).kind,"mint");assert.equal(one(j).amountRaw,300n);assert.equal(one(j).amountMeaning,"transferred");assert.equal(one(j).role,"recipient");
});
test("snapshots and local rows are stable, frozen and notify only for meaningful changes",()=>{
  const j=memory(),initial=j.getSnapshot();let calls=0;const stop=j.subscribe(()=>calls++),s=claimWallet();
  assert.equal(j.getSnapshot(),initial);assert.equal(j.getRows(),initial.rows);j.observe("claim",s,account);const snapshot=j.getSnapshot(),local=j.getRows();
  assert.equal(j.observe("claim",s,account),false);assert.equal(j.observe("claim",{...s},account),false);assert.equal(j.getSnapshot(),snapshot);assert.equal(j.getRows(),local);assert.equal(calls,1);
  assert.throws(()=>local.push({}));assert.throws(()=>{local[0].amountRaw=1n;});stop();j.observe("claim",claimDone(),account);assert.equal(calls,1);
});
test("a throwing history listener cannot interrupt a transaction subscriber",()=>{
  const j=memory();let notified=0;j.subscribe(()=>{throw Error("render failed");});j.subscribe(()=>notified++);
  assert.doesNotThrow(()=>j.observe("claim",claimWallet(),account));assert.equal(notified,1);assert.equal(one(j).phase,"wallet-pending");
});
test("replacement hashes update one stable attempt, retaining its original requested timestamp",()=>{
  const j=memory();j.observe("claim",claimWallet(),account);const before=one(j);j.observe("claim",{phase:"submitted",pending:pending({hash})},account);
  j.observe("claim",{phase:"submitted",pending:pending({hash:hash2})},account);assert.equal(one(j).id,before.id);assert.equal(one(j).requestedAt,before.requestedAt);assert.equal(one(j).hash,hash2);
});
test("a new review followed by wallet creates a new attempt, even for the same ID and timestamp",()=>{
  const j=memory();j.observe("claim",claimWallet(),account);j.observe("claim",{phase:"rejected"},account);j.observe("claim",{phase:"review"},account);j.observe("claim",claimWallet(),account);
  assert.equal(rows(j).length,2);assert.equal(new Set(rows(j).map(r=>r.id)).size,2);
});
test("journal key, pending fields and engine identity checks isolate all accounts and deployments",()=>{
  const j=memory();j.observe("claim",claimWallet(),other);assert.equal(rows(j).length,0);
  for(const patch of [{account:other},{chainId:1},{contract:other},{tokenAddress:other}]){const s=claimWallet({pending:pending(patch)});assert.doesNotThrow(()=>j.observe("claim",s,account));assert.equal(rows(j).length,0);}
  assert.equal(j.getSnapshot().warning,"history.invalidObservation");
  j.observe("claim",claimWallet({quote:{account:other,amount:40n}}),account);assert.equal(rows(j).length,0);
});
test("the B-account may keep display diagnostics without touching its deployment hold",()=>{
  const store=storage(),j=create({...scope,account:held},{storage:store,now:()=>1000});
  j.observe("claim",{phase:"unknown",pending:pending({account:held})},held);assert.equal(one(j).accountKey,held);
  assert.ok(store.reads.every(k=>k===keyOf({...scope,account:held})));assert.ok(store.writes.every(k=>k===keyOf({...scope,account:held})));
});
test("raw BigInts round-trip beyond Number precision, preserving receipt context after reload",()=>{
  const store=storage(),large=2n**200n,j=create(scope,{storage:store,now:()=>1000});
  j.observe("mint",{phase:"wallet",pending:pending({contract:usdc,id:undefined,amount:String(large)})},account);
  j.observe("mint",{phase:"completed",evidence:{hash,block:11n,amount:large,account,tokenAddress:usdc}},account);
  const raw=store.data.get(keyOf(scope));assert.match(raw,new RegExp(String(large)));assert.doesNotMatch(raw,/provider|Wallet is prohibited/);
  const restored=create(scope,{storage:store,now:()=>2000});assert.equal(one(restored).amountRaw,large);assert.equal(one(restored).amountMeaning,"transferred");assert.equal(restored.getSnapshot().warning,undefined);
});
test("a journal stores only allowlisted display fields, never provider/raw errors or arbitrary quote data",()=>{
  const store=storage(),j=create(scope,{storage:store,now:()=>1000}),s=claimWallet();s.quote.secret="private secret";s.quote.token.provider.privateKey="not real";
  j.observe("claim",s,account);j.observe("claim",{phase:"unknown",error:"private provider message with token"},account);
  const raw=store.data.get(keyOf(scope));assert.doesNotMatch(raw,/private|provider|secret|privateKey/);assert.equal(one(j).failureReason,undefined);
  delete provider.privateKey;
});
test("100-entry storage bound keeps the newest rows, including after reload",()=>{
  const store=storage();let now=0;const j=create(scope,{storage:store,now:()=>++now});
  for(let i=0;i<125;i++){j.observe("claim",{phase:"review"},account);j.observe("claim",claimWallet({pending:pending({createdAt:i})}),account);j.observe("claim",{phase:"rejected"},account);}
  assert.equal(rows(j).length,100);assert.equal(new Set(rows(j).map(r=>r.id)).size,100);assert.equal(Date.parse(rows(j).at(-1).requestedAt),25);
  assert.equal(JSON.parse(store.data.get(keyOf(scope))).entries.length,100);assert.equal(rows(create(scope,{storage:store})).length,100);
});
test("caller limits are capped at 100 and honor a smaller positive bound",()=>{
  for(const [limit,want] of [[1,1],[2,2],[1000,5]]){const j=memory({limit});for(let i=0;i<5;i++){j.observe("claim",{phase:"review"},account);j.observe("claim",claimWallet({pending:pending({createdAt:i})}),account);j.observe("claim",{phase:"rejected"},account);}assert.equal(rows(j).length,want);}
});
test("malformed, oversize and wrong-scope journals fail softly without touching any pending key",()=>{
  for(const raw of ["", "null", "[]", "{}", "{", "x".repeat(256001),JSON.stringify({version:1,scope:{...scope,account:other},serial:1,entries:[]})]){
    const store=storage();store.data.set(keyOf(scope),raw);const j=create(scope,{storage:store});assert.equal(rows(j).length,0);assert.equal(j.getSnapshot().warning,"history.storageCorrupt");assert.equal(store.writes.length,0);assert.ok(store.reads.every(k=>k===keyOf(scope)));
  }
});
test("malformed individual journal entries are omitted while valid rows remain visible",()=>{
  const store=storage(),j=create(scope,{storage:store,now:()=>1000});j.observe("claim",claimWallet(),account);const payload=JSON.parse(store.data.get(keyOf(scope)));
  payload.entries.push({...payload.entries[0],row:{...payload.entries[0].row,id:"local:invalid",amountRaw:"NaN"}});store.data.set(keyOf(scope),JSON.stringify(payload));
  const restored=create(scope,{storage:store});assert.equal(rows(restored).length,1);assert.equal(restored.getSnapshot().warning,"history.storageCorrupt");
});
test("storage errors and failed read-back are history warnings and never stop observing",()=>{
  for(const store of [{getItem:()=>{throw Error("denied");},setItem:()=>{throw Error("denied");}},{getItem:()=>null,setItem:()=>{}}]){
    const j=create(scope,{storage:store,now:()=>1000});assert.doesNotThrow(()=>j.observe("claim",claimWallet(),account));assert.equal(one(j).amountRaw,40n);assert.equal(j.getSnapshot().warning,"history.storageUnavailable");
  }
});
test("invalid scope is an inert diagnostic journal without any storage operation",()=>{
  const store=storage(),j=create({...scope,account:"bad"},{storage:store});assert.equal(j.getSnapshot().warning,"history.invalidScope");assert.equal(j.observe("claim",claimWallet(),account),false);assert.equal(j.merge([api()]).length,0);assert.equal(store.reads.length,0);assert.equal(store.writes.length,0);
});
test("non-observation methods do not access storage and merge references are cached",()=>{
  const store=storage(),j=create(scope,{storage:store,now:()=>1000});j.observe("claim",claimWallet(),account);const reads=store.reads.length,writes=store.writes.length,apiRows=[api()],result=j.merge(apiRows);
  assert.equal(j.merge(apiRows),result);j.getRows();j.getSnapshot();j.getMergeWarning();assert.equal(store.reads.length,reads);assert.equal(store.writes.length,writes);
});
test("indexed completed claim replaces a same-hash/same-claim local indexing row exactly once",()=>{
  const j=memory();j.observe("claim",claimWallet(),account);j.observe("claim",{...claimDone(),phase:"indexing",pending:pending({hash})},account);
  const merged=j.merge([api()]);assert.equal(merged.length,1);assert.equal(merged[0].origin,"api");assert.equal(merged[0].amountRaw,50n);assert.equal(merged[0].amountMeaning,"transferred");
  assert.equal(merged.filter(r=>r.kind==="claim"&&r.phase==="completed").reduce((sum,r)=>sum+r.amountRaw,0n),50n);
  assert.equal(one(j).phase,"indexing");assert.equal(one(j).amountMeaning,"requested");
});
test("hash dedup ignores casing; repeated API IDs never double counted",()=>{
  const j=memory();j.observe("claim",claimDone(),account);const merged=j.merge([api({hash:hash.toUpperCase()}),api()]);assert.equal(merged.length,1);assert.equal(merged[0].hash,hash);assert.equal(merged[0].origin,"api");
});
test("buy prefers actual indexed purchase over the local asking-price record",()=>{
  const j=memory();j.observe("market",{phase:"wallet",pending:pending({contract:market,step:"buy",price:"180"})},account);
  j.observe("market",{phase:"completed",id:"3",evidence:{hash,block:11n,id:"3",step:"buy",price:180n,logIndex:2}},account);
  const result=j.merge([api({id:"trade:9:2",kind:"buy",role:"buyer",amountRaw:160n})]);assert.equal(result.length,1);assert.equal(result[0].amountRaw,160n);assert.equal(result[0].amountMeaning,"transferred");assert.equal(result[0].origin,"api");assert.equal(one(j).amountMeaning,"price");
});
test("receipt-proven create, approve and mint retain their local origin on API dedup",()=>{
  for(const kind of ["create","approve","mint"]){
    const j=memory();let expected;
    if(kind==="mint"){j.observe("mint",{phase:"completed",evidence:{hash,block:11n,amount:300n,account,tokenAddress:usdc}},account);expected={kind,claimId:"",role:"recipient",amountRaw:300n};}
    else {const step=kind==="approve"?"approval":"create";j.observe("create",{phase:"wallet",pending:pending({id:undefined,step,draft:{amount:"200"}})},account);j.observe("create",{phase:kind==="approve"?"approved":"completed",evidence:{hash,block:11n,...(kind==="create"?{streamId:"4"}:{})}},account);expected={kind,claimId:kind==="create"?"4":"",role:"payer",amountRaw:200n};}
    const result=j.merge([api({id:`api:${kind}`,amountMeaning:kind==="approve"?"allowance":"transferred",...expected})]);assert.equal(result.length,1);assert.equal(result[0].origin,"local");assert.equal(result[0].kind,kind);
  }
});
test("same hash does not collapse unrelated kinds, IDs, roles or multiple indexed events",()=>{
  const j=memory();j.observe("claim",claimDone(),account);
  const result=j.merge([api(),api({id:"claim:api:3",amountRaw:5n}),api({id:"claim:other",claimId:"4"}),api({id:"trade:one",kind:"buy",role:"buyer"}),api({id:"trade:two",kind:"buy",role:"seller"})]);
  assert.equal(result.length,5);assert.equal(result.filter(r=>r.kind==="claim"&&r.claimId==="3").length,2);
});
test("API account isolation rejects other/missing account rows and cannot overwrite local data",()=>{
  const j=memory();j.observe("claim",claimWallet(),account);const result=j.merge([api({accountKey:other}),api({accountKey:undefined})]);assert.equal(result.length,1);assert.equal(result[0].origin,"local");assert.equal(result[0].accountKey,account);
});
test("API outage leaves local attempts visible and never replaces their requested time",()=>{
  const j=memory();j.observe("claim",claimWallet(),account);j.observe("claim",claimDone(),account);const before=one(j);assert.equal(j.merge([api()])[0].origin,"api");const fallback=j.merge([]);assert.equal(fallback.length,1);assert.equal(fallback[0].origin,"local");assert.equal(fallback[0].requestedAt,before.requestedAt);
});
test("API invalid/unknown amounts stay unavailable and render-safe warnings never notify",()=>{
  const j=memory();let calls=0;j.subscribe(()=>calls++);
  const result=j.merge([api({amountRaw:"50"}),api({id:"unknown",kind:"create",claimId:"",role:"payer",amountRaw:999n}),api({id:"pending",phase:"submitted",amountMeaning:"transferred"})]);
  assert.equal(result.length,2);assert.ok(result.every(r=>r.amountMeaning==="unknown"&&r.amountRaw===0n));assert.equal(j.getMergeWarning(),"history.invalidApiRow");assert.equal(calls,0);assert.equal(j.getSnapshot().warning,undefined);assert.equal(j.merge(null).length,0);
});
test("a restored evidence hint awaiting receipt recheck never manufactures a completed transfer",()=>{
  const j=memory();j.observe("cancel",{phase:"indexing",id:"3",warning:"cancel.receiptRecheckWarning",pending:pending({hash,estimatedRefund:"80"}),evidence:{hash,block:11n,refund:70n,vested:30n}},account);
  assert.equal(one(j).phase,"stalled");assert.equal(one(j).amountMeaning,"requested");assert.equal(one(j).amountRaw,80n);
});

function enginePorts(){
  let saved=null,sends=0;return {session,storage:{read:()=>saved,save:r=>{saved=r;},clear:()=>{saved=null;}},now:()=>100,lock:async(_a,fn)=>fn(),refresh:async()=>{},projected:async()=>true,
    verifyRecovery:async()=>{},send:async()=>{sends++;return sends===1?hash:hash2;}};
}
function subscribe(j,kind,engine){return engine.subscribe(()=>j.observe(kind,engine.getSnapshot()[account],account));}
test("real claim engine subscription captures wallet context before terminal quote/pending are discarded",async()=>{
  const {createClaimEngine}=load(resolve(source,"src/lib/claim-engine.ts")),ports={...enginePorts(),contract:stream,quote:async()=>({id:"3",account,token,amount:40n,withdrawn:0n,block:10n,at:200n}),receipt:async r=>({hash:r.hash,block:11n,amount:50n,logIndex:2})};
  const engine=createClaimEngine(ports),j=memory();subscribe(j,"claim",engine);await engine.review("3");assert.equal(rows(j).length,0);await engine.execute(account);assert.equal(one(j).amountRaw,50n);assert.equal(one(j).phase,"completed");assert.equal(one(j).amountMeaning,"transferred");assert.equal(one(j).claimId,"3");
});
test("real create engine records approval and subsequent creation as separate wallet attempts",async()=>{
  const {createPaymentEngine}=load(resolve(source,"src/lib/create-payment-engine.ts"));let approved=false;
  const draft={recipient:other,amount:200n,start:200n,end:800n,cancelable:true,name:"test"},ports={...enginePorts(),quote:async()=>({draft,account,token,step:approved?"create":"approval",allowance:approved?200n:0n,block:10n,at:100n}),receipt:async r=>({hash:r.hash,block:11n,...(r.step==="create"?{streamId:"4"}:{})})};
  const engine=createPaymentEngine(ports),j=memory();subscribe(j,"create",engine);await engine.review(draft);await engine.execute(account);assert.equal(one(j).kind,"approve");assert.equal(one(j).amountMeaning,"allowance");
  approved=true;await engine.review(draft);await engine.execute(account);assert.equal(rows(j).length,2);const created=rows(j).find(r=>r.kind==="create");assert.equal(created.amountRaw,200n);assert.equal(created.amountMeaning,"transferred");assert.equal(created.claimId,"4");
});
test("real staged market engine retains requested asking price and NFT-approval meaning at terminal",async()=>{
  const path=resolve(feature,"market/frontend/src/lib/market-action-engine.ts");if(!existsSync(path))return;
  const {createMarketActionEngine}=load(path),draft={action:"list",id:"3",price:180n},ports={...enginePorts(),quote:async()=>({draft,id:"3",account,token,step:"nft-approval",owner:account,seller:account,price:180n,remaining:200n,withdrawn:0n,claimable:20n,canceled:false,cancelable:true,allowance:0n,approved:account,approvedForAll:false,block:10n,at:100n}),receipt:async r=>({hash:r.hash,block:11n,id:r.id,step:r.step,price:180n,logIndex:2})};
  const engine=createMarketActionEngine(ports),j=memory();subscribe(j,"market",engine);await engine.review(draft);await engine.execute(account);assert.equal(one(j).phase,"completed");assert.equal(one(j).kind,"approve");assert.equal(one(j).amountMeaning,"none");assert.equal(one(j).relatedAction,"list");assert.equal(one(j).amountRaw,0n);
});
test("real staged cancel engine exposes only actual refund after completion",async()=>{
  const path=resolve(feature,"cancel/frontend/src/lib/cancel-payment-engine.ts");if(!existsSync(path))return;
  const {createCancelPaymentEngine}=load(path),q={id:"3",account,token,sender:account,owner:other,tokenAddress:usdc,deposited:900n,withdrawn:0n,start:100n,end:1000n,block:10n,at:200n,vested:100n,refund:800n,ownerUnclaimed:100n,listingSeller:other,listingPrice:750n};
  const ports={...enginePorts(),quote:async()=>q,receipt:async r=>({hash:r.hash,block:11n,blockHash,at:300n,logIndex:3,sender:account,recipient:other,tokenAddress:usdc,vested:200n,refund:700n,withdrawnAtBlock:0n,ownerUnclaimedAtBlock:200n,refundLogIndex:2})};
  const engine=createCancelPaymentEngine(ports),j=memory();subscribe(j,"cancel",engine);await engine.review("3");await engine.execute(account);assert.equal(one(j).phase,"completed");assert.equal(one(j).amountRaw,700n);assert.equal(one(j).amountMeaning,"transferred");
});
test("real staged mint engine keeps a receipt transfer despite balance/refresh read failures",async()=>{
  const path=resolve(feature,"mint/frontend/src/lib/mint-token-engine.ts");if(!existsSync(path))return;
  const {createMintTokenEngine}=load(path),gasEstimate={scope:"public-rpc-direct",gasLimit:21000n,maxFeePerGas:1n,maxPriorityFeePerGas:1n,maximumCost:21000n,balance:999999n};
  const ports={...enginePorts(),quote:async()=>({amount:300n,account,token,block:10n,at:200n,gasEstimate,walletCost:"wallet-final-unknown"}),receipt:async r=>({hash:r.hash,block:11n,blockHash,amount:300n,logIndex:2,account,tokenAddress:usdc,source:"erc20-mint-transfer"}),balanceAt:async()=>{throw Error("offline");},refresh:async()=>{throw Error("offline");}};
  const engine=createMintTokenEngine(ports),j=memory();subscribe(j,"mint",engine);await engine.review(300n);await engine.execute(account);assert.equal(one(j).phase,"completed");assert.equal(one(j).amountRaw,300n);assert.equal(one(j).amountMeaning,"transferred");assert.equal(one(j).claimId,"");
});
