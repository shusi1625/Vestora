import type {TxRecord} from "./types";

export type LiveHistoryEngineKind="claim"|"create"|"market"|"cancel"|"mint";
export type LiveHistoryAmountMeaning="transferred"|"price"|"allowance"|"requested"|"none"|"unknown";
export type LiveActionHistoryRow=Omit<TxRecord,"kind">&{kind:TxRecord["kind"]|"mint";origin:"local"|"api";amountMeaning:LiveHistoryAmountMeaning;relatedAction?:string};
export type LiveActionHistoryScope={account:string;chainId:number;streamContract:string;marketContract:string;tokenContract:string};
export type LiveActionHistoryWarning="history.storageUnavailable"|"history.storageCorrupt"|"history.invalidScope"|"history.invalidObservation"|"history.invalidApiRow";
export type LiveActionHistorySnapshot={readonly rows:readonly LiveActionHistoryRow[];readonly revision:number;readonly warning?:LiveActionHistoryWarning};
export type LiveActionHistoryOptions={storage?:Pick<Storage,"getItem"|"setItem">|null;now?:()=>number;limit?:number};
type Obj=Record<string,unknown>;
type Context={kind:LiveActionHistoryRow["kind"];step:string;claimId:string;role:LiveActionHistoryRow["role"];amount?:bigint;meaning:Exclude<LiveHistoryAmountMeaning,"transferred">;relatedAction?:string};
type Entry={row:LiveActionHistoryRow;engine:LiveHistoryEngineKind;step:string;attempt?:string;context:Context;verified:boolean;settledAmount?:bigint;updatedAt:number};
const engines:LiveHistoryEngineKind[]=["claim","create","market","cancel","mint"];
const kinds=["claim","create","approve","buy","list","unlist","cancel-payment","mint"];
const roles=["owner","buyer","seller","payer","recipient"];
const phases=["preparing","approval-required","wallet-pending","rejected","submitted","mining","failed-onchain","indexing","completed","stalled","replaced"];
const meanings:LiveHistoryAmountMeaning[]=["transferred","price","allowance","requested","none","unknown"];
const terminal=new Set(["completed","rejected","failed-onchain","replaced"]);
const EMPTY:readonly TxRecord[]=Object.freeze([]);
const maxRawBytes=256_000;
const obj=(v:unknown):Obj=>v&&typeof v==="object"&&!Array.isArray(v)?v as Obj:{};
const addr=(v:unknown):v is string=>typeof v==="string"&&/^0x[\da-f]{40}$/i.test(v)&&!/^0x0{40}$/i.test(v);
const hash=(v:unknown):v is string=>typeof v==="string"&&/^0x[\da-f]{64}$/i.test(v);
const eq=(a:unknown,b:unknown)=>typeof a==="string"&&typeof b==="string"&&a.toLowerCase()===b.toLowerCase();
const uint=(v:unknown):bigint|undefined=>{
  if(typeof v==="bigint")return v>=0n&&v<2n**256n?v:undefined;
  if(typeof v==="string"&&/^(0|[1-9]\d{0,77})$/.test(v)){const n=BigInt(v);return n<2n**256n?n:undefined;}
  return undefined;
};
const id=(v:unknown)=>typeof v==="string"&&/^[1-9]\d{0,77}$/.test(v)&&BigInt(v)<2n**256n?v:"";
const text=(v:unknown,n=220):v is string=>typeof v==="string"&&v.length<=n;
const at=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=8_640_000_000_000_000;
const errorKey=(v:unknown)=>typeof v==="string"&&/^(claim|create|market|cancel|mint|actions|live|workspace)\.[\w.-]{1,100}$/.test(v)?v:undefined;
const json=(v:unknown)=>JSON.stringify(v,(_key,value)=>typeof value==="bigint"?value.toString():value);
const explorer=(scope:LiveActionHistoryScope,h?:string)=>h&&scope.chainId===11155111?`https://sepolia.etherscan.io/tx/${h}`:undefined;
function scopeOf(scope:LiveActionHistoryScope):LiveActionHistoryScope{
  if(!scope||!addr(scope.account)||!addr(scope.streamContract)||!addr(scope.marketContract)||!addr(scope.tokenContract)||!Number.isSafeInteger(scope.chainId)||scope.chainId<=0)throw new Error("history.invalidScope");
  return {account:scope.account.toLowerCase(),chainId:scope.chainId,streamContract:scope.streamContract.toLowerCase(),marketContract:scope.marketContract.toLowerCase(),tokenContract:scope.tokenContract.toLowerCase()};
}
export function liveActionHistoryKey(scope:LiveActionHistoryScope){
  const s=scopeOf(scope);return `vestora:action-history:v1:${s.chainId}:${s.streamContract}:${s.marketContract}:${s.tokenContract}:${s.account}`;
}
function contextOf(engine:LiveHistoryEngineKind,s:Obj,prior?:Context):Context|undefined{
  const q=obj(s.quote),p=obj(s.pending),e=obj(s.evidence),draft=obj(q.draft),packed=obj(p.draft);
  const claimId=id(e.streamId)||id(e.id)||id(p.id)||id(q.id)||id(s.id)||prior?.claimId||"";
  if(engine==="claim")return {kind:"claim",step:"claim",claimId,role:"owner",amount:uint(q.amount)??prior?.amount,meaning:"requested"};
  if(engine==="cancel")return {kind:"cancel-payment",step:"cancel",claimId,role:"payer",amount:uint(q.refund)??uint(p.estimatedRefund)??prior?.amount,meaning:"requested"};
  if(engine==="mint")return {kind:"mint",step:"mint",claimId:"",role:"recipient",amount:uint(q.amount)??uint(p.amount)??prior?.amount,meaning:"requested"};
  if(engine==="create"){
    const step=typeof p.step==="string"?p.step:typeof q.step==="string"?q.step:s.phase==="approved"?"approval":id(e.streamId)?"create":prior?.step;
    if(step!=="approval"&&step!=="create")return;
    return {kind:step==="approval"?"approve":"create",step,claimId:step==="approval"?"":claimId,role:"payer",
      amount:uint(draft.amount)??uint(packed.amount)??(prior?.step===step?prior.amount:undefined),meaning:step==="approval"?"allowance":"requested",relatedAction:step==="approval"?"create":undefined};
  }
  const step=typeof e.step==="string"?e.step:typeof p.step==="string"?p.step:typeof q.step==="string"?q.step:prior?.step;
  if(!step||!["erc20-approval","nft-approval","buy","list","cancel-listing"].includes(step))return;
  const amount=uint(q.price)??uint(p.price)??uint(e.price)??(prior?.step===step?prior.amount:undefined);
  if(step==="erc20-approval")return {kind:"approve",step,claimId,role:"buyer",amount,meaning:"allowance",relatedAction:"buy"};
  if(step==="nft-approval")return {kind:"approve",step,claimId,role:"owner",meaning:"none",relatedAction:"list"};
  if(step==="cancel-listing")return {kind:"unlist",step,claimId,role:"seller",meaning:"none"};
  return {kind:step==="buy"?"buy":"list",step,claimId,role:step==="buy"?"buyer":"seller",amount,meaning:"price"};
}
function bindingMatches(engine:LiveHistoryEngineKind,s:Obj,scope:LiveActionHistoryScope){
  const p=obj(s.pending),q=obj(s.quote),e=obj(s.evidence),token=obj(q.token);
  const target=engine==="market"?scope.marketContract:engine==="mint"?scope.tokenContract:scope.streamContract;
  if([p.account,q.account,token.account,e.account].some(v=>v!==undefined&&!eq(v,scope.account)))return false;
  if(p.chainId!==undefined&&p.chainId!==scope.chainId||p.contract!==undefined&&!eq(p.contract,target))return false;
  if(token.chainId!==undefined&&(typeof token.chainId!=="string"||!/^0x[\da-f]+$/i.test(token.chainId)||BigInt(token.chainId)!==BigInt(scope.chainId)))return false;
  if([p.tokenAddress,p.paymentToken,e.tokenAddress].some(v=>v!==undefined&&!eq(v,scope.tokenContract))||p.stream!==undefined&&!eq(p.stream,scope.streamContract))return false;
  if(engine==="cancel"&&[q.sender,e.sender].some(v=>v!==undefined&&!eq(v,scope.account)))return false;
  if(p.hash!==undefined&&!hash(p.hash)||e.hash!==undefined&&!hash(e.hash)||hash(p.hash)&&hash(e.hash)&&!eq(p.hash,e.hash))return false;
  return true;
}
function receiptContext(engine:LiveHistoryEngineKind,s:Obj,c:Context):{verified:boolean;amount?:bigint}{
  const e=obj(s.evidence);
  if(!["indexing","completed","approved"].includes(String(s.phase))||s.warning==="cancel.receiptRecheckWarning"||!hash(e.hash)||typeof e.block!=="bigint"||e.block<0n)return {verified:false};
  if(engine==="claim"||engine==="mint"){
    const amount=typeof e.amount==="bigint"?uint(e.amount):undefined;
    return {verified:amount!==undefined&&amount>0n,amount};
  }
  if(engine==="cancel"){
    const amount=typeof e.refund==="bigint"?uint(e.refund):undefined;
    return {verified:amount!==undefined&&typeof e.vested==="bigint"&&e.vested>=0n,amount};
  }
  if(engine==="create")return {verified:c.step==="approval"||Boolean(id(e.streamId)),amount:c.step==="create"?c.amount:undefined};
  return {verified:e.step===c.step&&id(e.id)===c.claimId&&typeof e.logIndex==="number"&&Number.isSafeInteger(e.logIndex)&&e.logIndex>=0&&typeof e.price==="bigint"};
}
function phaseOf(phase:string,verified:boolean,prior?:Entry):LiveActionHistoryRow["phase"]{
  if(verified&&prior?.verified&&!["rejected","reverted","replaced"].includes(phase)){
    if(prior.row.phase==="completed")return "completed";
    if(prior.row.phase==="indexing"&&["submitted","unknown","error"].includes(phase))return "indexing";
  }
  if(phase==="wallet")return "wallet-pending";
  if(phase==="submitted")return "submitted";
  if(phase==="rejected")return "rejected";
  if(phase==="reverted")return "failed-onchain";
  if(phase==="replaced")return "replaced";
  if(phase==="completed"||phase==="approved")return verified?"completed":"stalled";
  if(phase==="indexing")return verified?"indexing":"stalled";
  if(prior?.verified&&["completed","indexing"].includes(prior.row.phase))return prior.row.phase;
  return "stalled";
}
function freezeRows(entries:Entry[]):readonly LiveActionHistoryRow[]{return Object.freeze(entries.map(e=>Object.freeze({...e.row})));}
function apiRow(input:TxRecord,scope:LiveActionHistoryScope):LiveActionHistoryRow|undefined{
  const r=input as TxRecord&{amountMeaning?:LiveHistoryAmountMeaning;relatedAction?:string};
  if(!r||!eq(r.accountKey,scope.account))return;
  if(!text(r.id)||!r.id||!kinds.includes(r.kind)||!roles.includes(r.role)||!phases.includes(r.phase)||!["MockUSDC","mWETH","ETH"].includes(r.token)||
    !(r.claimId===""||id(r.claimId))||typeof r.amountRaw!=="bigint"||uint(r.amountRaw)===undefined||!text(r.requestedAt)||!at(Date.parse(r.requestedAt))||r.hash!==undefined&&!hash(r.hash))return;
  let amountMeaning=r.amountMeaning;
  if(amountMeaning!==undefined&&!meanings.includes(amountMeaning))return;
  if(!amountMeaning)amountMeaning=r.phase==="completed"&&["buy","claim"].includes(r.kind)?"transferred":"unknown";
  if(amountMeaning==="transferred"&&r.phase!=="completed")amountMeaning="unknown";
  const h=r.hash?.toLowerCase();
  return {id:r.id,kind:r.kind,claimId:r.claimId,token:r.token,role:r.role,accountKey:scope.account,requestedAt:r.requestedAt,phase:r.phase,
    amountRaw:amountMeaning==="unknown"||amountMeaning==="none"?0n:r.amountRaw,origin:"api",amountMeaning,
    relatedAction:text(r.relatedAction,60)?r.relatedAction:undefined,hash:h,explorerUrl:explorer(scope,h),failureReason:errorKey(r.failureReason)};
}
function matches(a:LiveActionHistoryRow,b:LiveActionHistoryRow){
  if(a.kind!==b.kind||a.role!==b.role||a.token!==b.token||a.relatedAction&&b.relatedAction&&a.relatedAction!==b.relatedAction)return false;
  if(a.claimId!==b.claimId&&!(a.kind==="create"&&(!a.claimId||!b.claimId)))return false;
  return a.id===b.id||Boolean(a.hash&&b.hash&&eq(a.hash,b.hash));
}

/** Display diagnostics only. No transaction authorization or pending-store access belongs here. */
export function createLiveActionHistoryJournal(inputScope:LiveActionHistoryScope,options:LiveActionHistoryOptions={}){
  let scope:LiveActionHistoryScope,key="",warning:LiveActionHistoryWarning|undefined,enabled=true;
  try{scope=scopeOf(inputScope);key=liveActionHistoryKey(scope);}catch{scope=inputScope;enabled=false;warning="history.invalidScope";}
  const limit=typeof options.limit==="number"&&Number.isFinite(options.limit)?Math.max(1,Math.min(100,Math.floor(options.limit))):100;
  let storage:LiveActionHistoryOptions["storage"];
  try{storage=options.storage===undefined?localStorage:options.storage;}catch{warning=warning||"history.storageUnavailable";}
  const listeners=new Set<()=>void>(),cursor=new Map<LiveHistoryEngineKind,string>(),lastState=new Map<LiveHistoryEngineKind,unknown>();
  let entries:Entry[]=[],serial=0,snapshot:LiveActionHistorySnapshot=Object.freeze({rows:Object.freeze([]),revision:0,warning});
  let mergeInput:readonly TxRecord[]|undefined,mergeRevision=-1,merged:readonly LiveActionHistoryRow[]=Object.freeze([]);
  const refresh=()=>{snapshot=Object.freeze({rows:freezeRows(entries),revision:snapshot.revision+1,warning});for(const fn of listeners){try{fn();}catch{/* History observers cannot affect transaction outcomes. */}}};
  const warn=(value:LiveActionHistoryWarning)=>{if(warning===value)return;warning=value;refresh();};
  const trim=()=>{entries.sort((a,b)=>Date.parse(b.row.requestedAt)-Date.parse(a.row.requestedAt)||b.updatedAt-a.updatedAt||b.row.id.localeCompare(a.row.id));entries=entries.slice(0,limit);};
  const persist=()=>{
    if(!enabled||storage===null)return;
    try{
      if(!storage)throw 0;
      const raw=json({version:1,scope,serial,entries});
      storage.setItem(key,raw);if(storage.getItem(key)!==raw)throw 0;
    }catch{warning="history.storageUnavailable";}
  };
  const decodeEntry=(v:unknown):Entry=>{
    const e=obj(v),r=obj(e.row),c=obj(e.context);
    if(r.origin!=="local"||!engines.includes(e.engine as LiveHistoryEngineKind)||!text(e.step,40)||!text(r.id)||!String(r.id).startsWith("local:")||
      !text(e.attempt,180)&&e.attempt!==undefined||!at(e.updatedAt)||typeof e.verified!=="boolean")throw 0;
    const row=apiRow({...r,amountRaw:uint(r.amountRaw)} as TxRecord,scope);
    if(!row||!meanings.includes(r.amountMeaning as LiveHistoryAmountMeaning)||!kinds.includes(String(c.kind))||!roles.includes(String(c.role))||
      !text(c.step,40)||!(c.claimId===""||id(c.claimId))||!["price","allowance","requested","none","unknown"].includes(String(c.meaning))||
      c.amount!==undefined&&uint(c.amount)===undefined||e.settledAmount!==undefined&&uint(e.settledAmount)===undefined||
      c.relatedAction!==undefined&&!text(c.relatedAction,60)||c.kind!==row.kind||c.role!==row.role||c.claimId!==row.claimId||c.step!==e.step)throw 0;
    if(row.phase==="completed"&&!e.verified||r.amountMeaning==="transferred"&&(!e.verified||row.phase!=="completed"||uint(e.settledAmount)!==row.amountRaw))throw 0;
    return {row:{...row,origin:"local"},engine:e.engine as LiveHistoryEngineKind,step:e.step,attempt:e.attempt as string|undefined,context:{...c,amount:uint(c.amount)} as Context,
      verified:e.verified,settledAmount:uint(e.settledAmount),updatedAt:e.updatedAt};
  };
  if(enabled&&storage){
    try{
      const raw=storage.getItem(key);
      if(raw!==null){
        if(raw.length>maxRawBytes)throw 0;const data=obj(JSON.parse(raw));
        if(data.version!==1||json(data.scope)!==json(scope)||!Number.isSafeInteger(data.serial)||Number(data.serial)<0||!Array.isArray(data.entries)||data.entries.length>100)throw 0;
        serial=Number(data.serial);const seen=new Set<string>();
        for(const v of data.entries){try{const e=decodeEntry(v);if(seen.has(e.row.id))throw 0;seen.add(e.row.id);entries.push(e);}catch{warning="history.storageCorrupt";}}
        trim();
      }
    }catch(error){warning=error instanceof SyntaxError||error===0?"history.storageCorrupt":"history.storageUnavailable";}
  }
  snapshot=Object.freeze({rows:freezeRows(entries),revision:0,warning});
  const observe=(engine:LiveHistoryEngineKind,value:unknown,account:string):boolean=>{
    if(!enabled||!eq(account,scope.account)||value==null)return false;
    const before=snapshot;
    try{
      if(!engines.includes(engine))throw 0;
      if(lastState.get(engine)===value)return false;
      const s=obj(value),phase=s.phase;
      if(typeof phase!=="string")throw 0;
      if(!bindingMatches(engine,s,scope))throw 0;
      if(["idle","checking","preparing","review"].includes(phase)){
        if(phase==="review")cursor.delete(engine);
        lastState.set(engine,value);return false;
      }
      if(!["wallet","submitted","approved","indexing","completed","rejected","reverted","replaced","unknown","error"].includes(phase))throw 0;
      const p=obj(s.pending),e=obj(s.evidence),current=entries.find(entry=>entry.row.id===cursor.get(engine));
      const preliminary=contextOf(engine,s,current?.context);if(!preliminary)return false;
      const attempt=at(p.createdAt)?`${preliminary.step}:${p.createdAt}:${text(p.reservation,100)?p.reservation:""}`:undefined;
      const incomingHash=hash(e.hash)?e.hash.toLowerCase():hash(p.hash)?p.hash.toLowerCase():undefined;
      let prior=entries.find(entry=>entry.engine===engine&&entry.step===preliminary.step&&incomingHash&&entry.row.hash===incomingHash);
      if(!prior&&attempt)prior=entries.find(entry=>entry.engine===engine&&entry.attempt===attempt&&!(phase==="wallet"&&terminal.has(entry.row.phase)));
      if(!prior&&current?.step===preliminary.step&&(!attempt||current.attempt===attempt)&&!(phase==="wallet"&&terminal.has(current.row.phase)))prior=current;
      const c=contextOf(engine,s,prior?.context);if(!c)return false;
      if(!prior&&phase!=="wallet"&&!Object.keys(p).length&&!incomingHash)return false;
      const now=options.now?.()??Date.now();if(!at(now))throw 0;
      const created=at(p.createdAt)?p.createdAt:now,h=incomingHash||prior?.row.hash,proof=receiptContext(engine,s,c);
      const verified=proof.verified||Boolean(prior?.verified&&(!incomingHash||incomingHash===prior.row.hash));
      const settledAmount=proof.verified?proof.amount:verified?prior?.settledAmount:undefined;
      const rowPhase=phaseOf(phase,verified,prior);
      let amountMeaning:LiveHistoryAmountMeaning=c.meaning,amountRaw=c.amount??0n;
      if(c.meaning==="none"){amountRaw=0n;}else if(c.amount===undefined){amountMeaning="unknown";}
      if(rowPhase==="completed"&&verified&&settledAmount!==undefined&&["claim","create","cancel","mint"].includes(engine)&&c.kind!=="approve"){
        amountMeaning="transferred";amountRaw=settledAmount;
      }
      const row:LiveActionHistoryRow={id:prior?.row.id||`local:${scope.chainId}:${scope.account}:${engine}:${serial+1}`,kind:c.kind,claimId:c.claimId,token:"MockUSDC",role:c.role,
        amountRaw,origin:"local",amountMeaning,relatedAction:c.relatedAction,accountKey:scope.account,requestedAt:prior?.row.requestedAt||new Date(created).toISOString(),phase:rowPhase,
        hash:h,explorerUrl:explorer(scope,h),failureReason:rowPhase==="completed"?undefined:errorKey(s.error)||prior?.row.failureReason};
      const entry:Entry={row,engine,step:c.step,attempt:attempt||prior?.attempt,context:c,verified,settledAmount,updatedAt:prior?.updatedAt??now};
      cursor.set(engine,row.id);lastState.set(engine,value);
      if(prior&&json(prior)===json(entry))return false;
      entry.updatedAt=now;
      if(prior)entries=entries.map(item=>item===prior?entry:item);else{serial++;entries.push(entry);}
      trim();persist();refresh();
    }catch{warn("history.invalidObservation");}
    return snapshot!==before;
  };
  const merge=(apiRows:readonly TxRecord[]=EMPTY):readonly LiveActionHistoryRow[]=>{
    if(!enabled)return snapshot.rows;
    if(!Array.isArray(apiRows)){mergeWarning="history.invalidApiRow";return snapshot.rows;}
    if(mergeInput===apiRows&&mergeRevision===snapshot.revision)return merged;
    const indexed=new Map<string,LiveActionHistoryRow>();let invalid=false;
    for(const input of apiRows){
      if(!input||!eq(input.accountKey,scope.account))continue;
      const row=apiRow(input,scope);if(!row){invalid=true;continue;}
      const prior=indexed.get(row.id);
      if(!prior||row.phase==="completed"&&prior.phase!=="completed")indexed.set(row.id,row);
    }
    // Merge is render-safe: malformed API rows are omitted, without notifications or storage writes.
    const output=[...indexed.values()];
    for(const entry of entries){
      const i=output.findIndex(row=>row.origin==="api"&&matches(entry.row,row));
      if(i<0){output.push(entry.row);continue;}
      const api=output[i],actual=api.phase==="completed"&&api.amountMeaning==="transferred";
      if(actual&&["buy","claim"].includes(api.kind))continue;
      if(entry.verified||!actual)output[i]=entry.row;
    }
    output.sort((a,b)=>Date.parse(b.requestedAt)-Date.parse(a.requestedAt)||a.id.localeCompare(b.id));
    merged=Object.freeze(output.map(row=>Object.freeze({...row})));mergeInput=apiRows;mergeRevision=snapshot.revision;
    // API input warnings are available without changing the external-store snapshot during render.
    mergeWarning=invalid?"history.invalidApiRow":undefined;
    return merged;
  };
  let mergeWarning:LiveActionHistoryWarning|undefined;
  return {observe,merge,getRows:()=>snapshot.rows,getSnapshot:()=>snapshot,getMergeWarning:()=>mergeWarning,
    subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
}
export type LiveActionHistoryJournal=ReturnType<typeof createLiveActionHistoryJournal>;
