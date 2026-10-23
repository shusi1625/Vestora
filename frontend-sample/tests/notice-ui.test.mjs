import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import vm from "node:vm";
import ts from "typescript";

const root=resolve(import.meta.dirname,".."),locale=JSON.parse(readFileSync(resolve(root,"public/locales/ko.json"),"utf8"));
function load(file,imports={},globals={}){
  const module={exports:{}},source=readFileSync(resolve(root,file),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`,{Error,...globals})(id=>{if(!(id in imports))throw Error(`Unexpected dependency ${id}`);return imports[id];},module,module.exports);
  return module.exports;
}
const {canDismissTransactionNotice}=load("src/lib/notice-policy.ts");
const uiMeasurement=load("src/lib/ui-measurement.ts");
function noticeFixture(){
  let dismissed=null;const node=(type,props)=>({type,props});
  const {DismissibleNotice}=load("src/components/workspace/DismissibleNotice.tsx",{
    react:{useState:()=>[dismissed,value=>{dismissed=value;}]},"react/jsx-runtime":{jsx:node,jsxs:node},"lucide-react":{X:"X"},"@/components/ui/button":{Button:"button"},
  });
  const render=(patch={})=>DismissibleNotice({noticeKey:"create:a:completed:hash",dismissible:true,closeLabel:locale["notice.closeCreate"],children:"receipt proof",...patch});
  return{render,close:()=>render().props.children[0].props.onClick()};
}
test("only verified chain success and known terminal outcomes can be dismissed",()=>{
  for(const phase of ["completed","approved","indexing"]){assert.equal(canDismissTransactionNotice(phase,true),true);assert.equal(canDismissTransactionNotice(phase,false),false);}
  for(const phase of ["checking","preparing","review","wallet","submitted","unknown","error"]){assert.equal(canDismissTransactionNotice(phase,true),false);assert.equal(canDismissTransactionNotice(phase,false),false);}
  for(const phase of ["rejected","reverted","replaced"])assert.equal(canDismissTransactionNotice(phase,false),true);
});
test("close button is labeled, non-submitting and dismisses only the current notice",()=>{
  const f=noticeFixture(),button=f.render().props.children[0];assert.equal(button.type,"button");assert.equal(button.props.type,"button");assert.equal(button.props["aria-label"],"지급 생성 알림 닫기");assert.equal(button.props.title,"지급 생성 알림 닫기");
  f.close();assert.equal(f.render(),null);assert.ok(f.render({noticeKey:"create:a:completed:another-hash"}));assert.ok(f.render({noticeKey:"create:b:completed:hash"}));
});
test("a new phase or warning reappears, but background refresh alone does not reopen a notice",()=>{
  const f=noticeFixture();f.close();assert.equal(f.render({children:"updated background figures"}),null);assert.ok(f.render({noticeKey:"create:a:indexing:hash"}));assert.ok(f.render({noticeKey:"create:a:completed:hash:storage-warning"}));
});
test("non-dismissible states remain visible even if a matching key was previously closed",()=>{
  const f=noticeFixture();f.close();const active=f.render({dismissible:false});assert.ok(active);assert.equal(active.props.children[0],false);assert.equal(active.props.children[1],"receipt proof");
});
test("confirmed refresh copy is consistent while ambiguous outcomes retain recovery guidance",()=>{
  const copy="온체인에서 거래 완료가 확인되었습니다. 화면에 반영되기까지 잠시 시간이 걸릴 수 있습니다.";
  for(const key of ["create.body.indexing","create.refreshWarning","claim.body.indexing","claim.refreshWarning"])assert.equal(locale[key],copy);
  assert.match(locale["create.receiptUnavailable"],/재전송/);assert.match(locale["claim.receiptUnavailable"],/재전송/);
  for(const key of ["notice.closeCreate","notice.closeClaim","notice.closeData","notice.staleBadge","notice.syncBadge"])assert.ok(locale[key]);
});
test("freshness remains visible independently from the dismissible detailed warning",()=>{
  const header=readFileSync(resolve(root,"src/components/workspace/LiveConnection.tsx"),"utf8"),details=readFileSync(resolve(root,"src/components/workspace/WorkspaceDataState.tsx"),"utf8");
  assert.match(header,/notice\.staleBadge/);assert.match(header,/notice\.syncBadge/);assert.match(details,/DismissibleNotice/);
  assert.doesNotMatch(readFileSync(resolve(root,"src/components/workspace/DismissibleNotice.tsx"),"utf8"),/localStorage|engine\.|\.disconnect\(/);
});

test("gas review separates the direct RPC estimate from unknown wallet costs",()=>{
  const node=(type,props)=>({type,props});
  const {GasReview}=load("src/components/workspace/GasReview.tsx",{
    "react/jsx-runtime":{jsx:node,jsxs:node},
    "react-i18next":{useTranslation:()=>({t:key=>{assert.ok(key in locale,key);return locale[key];}})},
    viem:{formatEther:value=>`ether:${value}`,formatGwei:value=>`gwei:${value}`},
  });
  const text=value=>value==null||value===false?"":Array.isArray(value)?value.map(text).join(" "):typeof value==="object"?text(value.props?.children):String(value);
  const estimate={scope:"public-rpc-direct",gasLimit:50000n,maxFeePerGas:17n,maximumCost:850000n,balance:1000000n};
  const rendered=GasReview({estimate}),copy=text(rendered).replace(/\s+/g," ");
  for(const expected of ["직접 호출 기준","RPC 추정 가스량","50,000 gas","RPC 제안 최대 단가","gwei:17","지갑 최종 최대 비용은 아직 확인되지 않았습니다.","잔액 검사도 이 추정치 기준"])assert.ok(copy.includes(expected),expected);
  assert.doesNotMatch(copy,/조회 기준 최대 가스비 추정|지갑 잔액 충분/);
  assert.equal(rendered.props.children[1].props.role,"status");
  assert.match(text(GasReview({})),/지갑 최종 최대 비용은 아직 확인되지/);
});

function workspaceFixture(){
  const node=(type,props)=>({type,props}),ref={current:null};
  class Element {isConnected=true;focus(options){this.focusOptions=options;}}
  const document={activeElement:null,body:new Element()};
  const format=load("src/lib/format.ts",{"./tokens":load("src/lib/tokens.ts")});
  const ui=load("src/components/workspace/WorkspaceUI.tsx",{
    react:{useRef:()=>ref},"react/jsx-runtime":{jsx:node,jsxs:node},
    "react-i18next":{useTranslation:()=>({t:key=>locale[key]||key})},
    "lucide-react":{Info:"Info"},"@/components/ui/button":{Button:"button"},
    "@/components/ui/dialog":{Dialog:"Dialog",DialogContent:"DialogContent",DialogTitle:"DialogTitle",DialogDescription:"DialogDescription"},
    "@/components/ui/popover":{Popover:"Popover",PopoverContent:"PopoverContent",PopoverTrigger:"PopoverTrigger"},
    "@/lib/format":format,"@/lib/live-config":{LIVE_MODE:false},
  },{document,HTMLElement:Element});
  return {ui,document,Element};
}
test("figures show minimum amounts and exact review values without hover",()=>{
  const {ui}=workspaceFixture();
  const minimum=ui.Figure({raw:1n,token:"MockUSDC"});
  assert.equal(minimum.props.children[0].props.children,"0.000001");
  assert.equal(minimum.props.children[2],false);
  const review=ui.Figure({raw:1234567n,token:"MockUSDC",exact:true});
  assert.equal(review.props.children[0].props.children,"1.234567");
  assert.equal(review.props.children[2],false);
  assert.match(readFileSync(resolve(root,"src/pages/issued/CreatePaymentDialog.tsx"),"utf8"),/<Figure raw=\{raw\} token=\{token\} exact/);
});
test("rounded figures expose precision through a named non-submitting button",()=>{
  const {ui}=workspaceFixture();
  const figure=ui.Figure({raw:1234567n,token:"MockUSDC"});
  assert.equal(figure.props.children[0].props.children,"1.23");
  const popover=figure.props.children[2],trigger=popover.props.children[0].props.children;
  assert.equal(trigger.type,"button");assert.equal(trigger.props.type,"button");
  assert.equal(trigger.props["aria-label"],locale["amount.precisionOpen"]);
  assert.equal(popover.props.children[1].props.children[1].props.children,"1.234567 MockUSDC");
  assert.equal(ui.Figure({raw:1000000n,token:"MockUSDC"}).props.children[2],false);
});
test("controlled review modal restores its opener and refreshes it for another opening",()=>{
  const {ui,document,Element}=workspaceFixture();
  const props=ui.ReviewModal({open:true,title:"review",onOpenChange:()=>{},children:null}).props.children.props;
  for(let i=0;i<2;i++){
    const opener=new Element();document.activeElement=opener;props.onOpenAutoFocus();
    document.activeElement=document.body;let prevented=false;
    props.onCloseAutoFocus({preventDefault(){prevented=true;}});
    assert.equal(prevented,true);assert.equal(opener.focusOptions.preventScroll,true);
  }
});
test("removed opener and body-only opening do not override Radix fallback",()=>{
  const {ui,document,Element}=workspaceFixture();
  const props=ui.ReviewModal({open:true,title:"review",onOpenChange:()=>{},children:null}).props.children.props;
  const opener=new Element();document.activeElement=opener;props.onOpenAutoFocus();opener.isConnected=false;
  props.onCloseAutoFocus({preventDefault(){assert.fail("disconnected opener");}});
  document.activeElement=document.body;props.onOpenAutoFocus();
  props.onCloseAutoFocus({preventDefault(){assert.fail("body is not an opener");}});
});

function disconnectDialogFixture(onConfirm=async()=>{}){
  const state=[],refs=[],node=(type,props)=>({type,props});let cursor=0,refCursor=0,closed=0;
  const {DisconnectWalletDialog}=load("src/components/workspace/DisconnectWalletDialog.tsx",{
    react:{useState:initial=>{const index=cursor++;if(!(index in state))state[index]=initial;return[state[index],value=>{state[index]=value;}];},useRef:initial=>{const index=refCursor++;return refs[index]||(refs[index]={current:initial});}},
    "react/jsx-runtime":{jsx:node,jsxs:node},"react-i18next":{useTranslation:()=>({t:key=>locale[key]||key})},
    "lucide-react":{Loader2:"Loader2",LogOut:"LogOut"},"@/components/ui/button":{Button:"button"},
    "@/components/ui/dialog":{Dialog:"Dialog",DialogContent:"DialogContent",DialogTitle:"DialogTitle",DialogDescription:"DialogDescription"},
  });
  const render=()=>{cursor=0;refCursor=0;return DisconnectWalletDialog({account:"0x1111111111111111111111111111111111111111",onConfirm,onClose:()=>closed++,restoreFocus:()=>{}});};
  const buttons=()=>render().props.children.props.children.at(-1).props.children;
  return {render,buttons,closed:()=>closed};
}
test("opening and canceling disconnect confirmation never revoke permissions",()=>{
  let calls=0;const f=disconnectDialogFixture(async()=>{calls++;}),dialog=f.render();
  assert.equal(dialog.props.children.props.role,"alertdialog");assert.equal(calls,0);
  f.buttons()[0].props.onClick();assert.equal(calls,0);assert.equal(f.closed(),1);
  dialog.props.onOpenChange(false);assert.equal(calls,0);assert.equal(f.closed(),2);
});
test("only explicit confirmation invokes disconnect, with duplicate and close guards",async()=>{
  let calls=0,finish;const pending=new Promise(resolve=>{finish=resolve;});
  const f=disconnectDialogFixture(async account=>{assert.equal(account,"0x1111111111111111111111111111111111111111");calls++;await pending;});
  const confirm=f.buttons()[1];confirm.props.onClick();confirm.props.onClick();assert.equal(calls,1);
  assert.equal(f.buttons()[0].props.disabled,true);assert.equal(f.buttons()[1].props.disabled,true);
  f.render().props.onOpenChange(false);assert.equal(f.closed(),0);
  let prevented=false;f.render().props.children.props.onEscapeKeyDown({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  finish();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.closed(),1);
});
test("disconnect failure stays open with actionable translated copy",async()=>{
  const f=disconnectDialogFixture(async()=>{throw Error("live.disconnectUnsupported");});f.buttons()[1].props.onClick();await new Promise(resolve=>setImmediate(resolve));
  const alert=f.render().props.children.props.children.find(item=>item?.props?.role==="alert");assert.equal(alert.props.children,locale["live.disconnectUnsupported"]);assert.equal(f.closed(),0);assert.equal(f.buttons()[1].props.disabled,false);
  for(const key of ["wallet.disconnectTitle","wallet.disconnectDescription","wallet.disconnectScope","wallet.disconnectConsequences","wallet.keepConnection","wallet.disconnectConfirm","wallet.disconnecting","live.endLookup","live.disconnectUnsupported","live.disconnectRejected","live.disconnectFailed","live.disconnectUnverified","live.disconnectAccountChanged"])assert.ok(locale[key],key);
});

test("QA06 shared insufficient-balance copy is accurate in live and sample modes",()=>{
  assert.equal(locale["workspace.insufficientBalance"],"해당 토큰 잔액이 부족합니다. 금액과 연결된 지갑을 확인해 주세요.");
  assert.doesNotMatch(locale["workspace.insufficientBalance"],/샘플/);
});

function marketLocationFixture(search="",initialState=null,blocked=false,listed=true){
  let params=new URLSearchParams(search),state=initialState;const moves=[],node=(type,props)=>({type,props});
  let cursor=0,calculations=0;const hooks=[],effects=[];
  const react={useMemo:(fn,deps)=>{const i=cursor++,old=hooks[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))hooks[i]={deps,value:fn()};return hooks[i].value;},useRef:initial=>{const i=cursor++;return hooks[i]||(hooks[i]={current:initial});},useEffect:(fn,deps)=>{const i=cursor++,old=hooks[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j]))){hooks[i]={deps};effects.push(fn);}}};
  const snapshot={paymentTokens:["MockUSDC","mWETH"],claims:[{id:"3",token:"MockUSDC",owner:"b",cancellable:true,ownership:"verified",endAt:"2027-01-01T00:00:00Z"}],listings:listed?[{id:"listing-3",claimId:"3",status:"active",seller:"b",priceRaw:850000n}]:[],now:new Date(),address:"a",canTransact:true,source:blocked?"live":"sample",scenario:{screens:{market:"normal"},dataCondition:"normal"},refresh:()=>{}};
  const {default:Market}=load("src/pages/market/WorkspaceMarket.tsx",{
    react,
    "react/jsx-runtime":{jsx:node,jsxs:node},"react-i18next":{useTranslation:()=>({t:key=>locale[key]||key})},
    "react-router-dom":{useSearchParams:()=>[params,(next,options)=>{params=new URLSearchParams(next);state=options?.state??null;moves.push({search:params.toString(),options});}],useLocation:()=>({state}),useNavigate:()=>delta=>moves.push({delta})},
    "lucide-react":Object.fromEntries(["LayoutGrid","List","CalendarDays","ShieldCheck","TriangleAlert","RotateCcw","ChevronLeft","ChevronRight"].map(name=>[name,name])),
    "@/components/ui/button":{Button:"button"},"@/hooks/use-workspace-snapshot":{useWorkspaceSnapshot:()=>snapshot},
    "@/lib/ui-measurement":uiMeasurement,
    "@/lib/claim-math":{getClaimTotals:claim=>{calculations++;return{totalUnclaimed:{raw:claim.unclaimedRaw??1000000n},claimableNow:{raw:500000n},paymentStatus:"streaming"};},getListingMetrics:(_claim,_listing,_now,totals)=>{assert.ok(totals,"reuse the same snapshot totals");return{discountRate:.15,expectedProfit:{raw:150000n}};}},
    "@/lib/format":{formatDate:()=>"date",formatPercent:()=>"15%"},"@/lib/workspace-model":{sameAddress:(a,b)=>a===b},
    "@/components/workspace/ClaimReviewDialog":{ClaimReviewDialog:"ClaimReviewDialog"},"@/components/workspace/PaymentStatus":{PaymentStatus:"PaymentStatus"},
    "@/components/workspace/WorkspaceUI":Object.fromEntries(["DetailButton","EmptyRows","Figure","PageHeading","Tag"].map(name=>[name,name])),
    "@/components/workspace/WorkspaceDataState":{WorkspaceDataState:"WorkspaceDataState"},
  },{URLSearchParams});
  const walk=value=>Array.isArray(value)?value.flatMap(walk):value&&typeof value==="object"?[value,...walk(value.props?.children)]:[];
  const nodes=()=>{cursor=0;return walk(Market());};return {nodes,moves,snapshot,params:()=>params,calculations:()=>calculations,flushEffects:()=>{while(effects.length)effects.shift()();},selects:()=>nodes().filter(n=>n.type==="select"),modal:()=>nodes().find(n=>n.type==="ClaimReviewDialog")};
}

function marketWithCount(count,search=""){
  const f=marketLocationFixture(search),claim=f.snapshot.claims[0],listing=f.snapshot.listings[0];
  f.snapshot.claims=Array.from({length:count},(_,i)=>({...claim,id:String(i+3)}));
  f.snapshot.listings=f.snapshot.claims.map(c=>({...listing,id:`listing-${c.id}`,claimId:c.id}));
  return f;
}
const shownIds=f=>f.nodes().filter(n=>n.props?.["data-claim-id"]).map(n=>n.props["data-claim-id"]);
const pageButton=(f,direction)=>f.nodes().find(n=>n.props?.["aria-label"]===locale[`workspace.${direction}Page`]);

test("market pagination caps both layouts at 40 after filtering, including 0/1/40/41/1000",()=>{
  for(const view of ["cards","table"])for(const count of [0,1,40,41,1000]){
    const f=marketWithCount(count,`view=${view}`);
    assert.equal(shownIds(f).length,Math.min(40,count));
    assert.equal(Boolean(pageButton(f,"next")),count>40);
    const countNode=f.nodes().find(n=>n.props?.["aria-live"]==="polite");assert.equal(countNode.props.children,locale["workspace.count"]);
  }
});

test("all 1000 paginated IDs preserve complete stable order without omissions or duplicates",()=>{
  const f=marketWithCount(1000),ids=[];
  for(let page=1;page<=25;page++){
    ids.push(...shownIds(f));
    assert.equal(pageButton(f,"previous").props.disabled,page===1);
    assert.equal(pageButton(f,"next").props.disabled,page===25);
    if(page<25){pageButton(f,"next").props.onClick();assert.equal(f.moves.at(-1).options,undefined);}
  }
  assert.deepEqual(ids,Array.from({length:1000},(_,i)=>String(i+3)));
  assert.equal(new Set(ids).size,1000);
});

test("view retains page, filter/sort/reset return to first page, and unrelated query survives",()=>{
  const f=marketWithCount(81,"page=2&view=cards&other=keep");
  f.nodes().find(n=>n.props?.["aria-label"]===locale["workspace.view.table"]).props.onClick();
  assert.equal(f.params().get("page"),"2");assert.equal(shownIds(f)[0],"43");
  f.selects()[0].props.onChange({target:{value:"MockUSDC"}});assert.equal(f.params().has("page"),false);
  pageButton(f,"next").props.onClick();f.selects()[3].props.onChange({target:{value:"end"}});assert.equal(f.params().has("page"),false);
  pageButton(f,"next").props.onClick();f.nodes().find(n=>n.props?.["aria-label"]===locale["market.resetFilters"]).props.onClick();
  assert.equal(f.params().has("page"),false);assert.equal(f.params().get("view"),"table");assert.equal(f.params().get("other"),"keep");
});

test("invalid pages normalize and a shrinking result clamps without destroying deep links while loading",()=>{
  for(const input of ["0","-1","x","1.5","1e2","9007199254740992","02","999"]){
    const f=marketWithCount(41,`page=${input}`);f.nodes();f.flushEffects();
    assert.equal(f.params().get("page"),input==="999"||input==="02"?"2":"1");assert.equal(f.moves.at(-1)?.options.replace,true);
  }
  const f=marketWithCount(81,"page=3&claim=3");assert.equal(shownIds(f).length,1);
  f.snapshot.listings=f.snapshot.listings.slice(0,41);assert.equal(shownIds(f).length,1);f.flushEffects();assert.equal(f.params().get("page"),"2");assert.equal(f.params().get("claim"),"3");
  for(const condition of ["loading","failure"]){const loading=marketWithCount(0,"page=25");loading.snapshot.scenario.dataCondition=condition;loading.nodes();loading.flushEffects();assert.equal(loading.params().get("page"),"25");}
});

test("off-page detail and close preserve the active page and never bypass a live buy guard",()=>{
  const f=marketWithCount(81,"page=2&claim=3&intent=buy");f.snapshot.source="live";
  assert.equal(shownIds(f).includes("3"),false);assert.equal(f.modal().props.claim.id,"3");assert.equal(f.modal().props.mode,"detail");
  f.modal().props.onClose();assert.equal(f.params().get("page"),"2");assert.equal(f.params().has("claim"),false);
});

test("memo dependencies reuse base calculations for view/detail/page and invalidate snapshot changes",()=>{
  // A dependency-contract harness, not a substitute for real React browser verification.
  const f=marketWithCount(81);f.nodes();assert.equal(f.calculations(),81);
  pageButton(f,"next").props.onClick();f.nodes();assert.equal(f.calculations(),81);
  f.nodes().find(n=>n.props?.["aria-label"]===locale["workspace.view.table"]).props.onClick();f.nodes();assert.equal(f.calculations(),81);
  f.nodes().find(n=>n.type==="DetailButton").props.onClick();f.modal();assert.equal(f.calculations(),81);
  for(const mutate of [()=>f.snapshot.now=new Date(),()=>f.snapshot.address="b",()=>f.snapshot.canTransact=false,()=>f.snapshot.source="live",()=>f.snapshot.claims=f.snapshot.claims.map(c=>({...c,ownership:"unknown"})),()=>f.snapshot.listings=f.snapshot.listings.map(l=>({...l,priceRaw:l.priceRaw+1n}))]){
    const before=f.calculations();mutate();f.nodes();assert.equal(f.calculations(),before+81);
  }
});

test("claim index retains the first duplicate ID like Array.find",()=>{
  const f=marketWithCount(1);f.snapshot.claims=[...f.snapshot.claims,{...f.snapshot.claims[0],token:"mWETH"}];
  f.nodes().find(n=>n.type==="DetailButton").props.onClick();assert.equal(f.modal().props.claim.token,"MockUSDC");
});

test("F03 unclaimed sort is token-scoped and reset preserves the view",()=>{
  const f=marketLocationFixture("token=MockUSDC&cancel=yes&phase=streaming&sort=unclaimed&view=table");
  assert.equal(f.selects()[3].props.value,"unclaimed");
  const reset=()=>f.nodes().find(n=>n.props?.["aria-label"]===locale["market.resetFilters"]);
  assert.equal(reset().props.disabled,false);reset().props.onClick();
  assert.deepEqual(f.selects().map(n=>n.props.value),["all","all","all","review"]);
  assert.equal(f.params().get("view"),"table");assert.equal(reset().props.disabled,true);
  assert.equal(f.moves.at(-1).options.replace,true);
  const all=marketLocationFixture("sort=unclaimed");assert.equal(all.selects()[3].props.value,"review");
  const f2=marketLocationFixture("token=MockUSDC&sort=unclaimed");f2.selects()[0].props.onChange({target:{value:"all"}});assert.equal(f2.params().get("sort"),"review");
});

test("F03 descending unclaimed sort retains BigInt precision and stable ties",()=>{
  const f=marketLocationFixture("token=MockUSDC&sort=unclaimed"),claim=f.snapshot.claims[0],listing=f.snapshot.listings[0];
  f.snapshot.claims=[{...claim,id:"3",unclaimedRaw:9007199254740992n},{...claim,id:"4",unclaimedRaw:9007199254740993n},{...claim,id:"5",unclaimedRaw:9007199254740993n}];
  f.snapshot.listings=[3,4,5].map(id=>({...listing,id:`listing-${id}`,claimId:String(id)}));
  assert.deepEqual(f.nodes().filter(n=>n.type==="article").map(n=>n.props["data-claim-id"]),["4","5","3"]);
});

test("F08 asset scheduled/completed filters retain only the matching owned phase",()=>{
  const node=(type,props)=>({type,props}),state=[];let cursor=0;
  const tokens=load("src/lib/tokens.ts"),format=load("src/lib/format.ts",{"./tokens":tokens}),math=load("src/lib/claim-math.ts",{"./format":format,"./tokens":tokens});
  const model=load("src/lib/workspace-model.ts",{"./claim-math":math});
  const now=new Date("2027-01-01T12:00:00Z"),base={token:"MockUSDC",payer:"a",owner:"b",originalRecipient:"b",deposited:100n,claimed:0n,cancellable:true,ownership:"verified"};
  const snapshot={claims:[{...base,id:"1",startAt:"2027-01-02T00:00:00Z",endAt:"2027-01-03T00:00:00Z"},{...base,id:"2",startAt:"2026-12-30T00:00:00Z",endAt:"2026-12-31T00:00:00Z"},{...base,id:"3",startAt:"2027-01-01T00:00:00Z",endAt:"2027-01-03T00:00:00Z",cancelledAt:"2027-01-01T06:00:00Z"},{...base,id:"4",owner:"a",startAt:"2026-12-30T00:00:00Z",endAt:"2026-12-31T00:00:00Z"}],records:[],listings:[],balances:[],address:"b",accountKey:"b",now,paymentTokens:["MockUSDC"],balancesReady:false,historyReady:true,scenario:{screens:{assets:"normal"},dataCondition:"normal"}};
  const {default:Assets}=load("src/pages/assets/WorkspaceAssets.tsx",{
    react:{useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return[state[i],v=>{state[i]=v;}];}},"react/jsx-runtime":{jsx:node,jsxs:node},"react-i18next":{useTranslation:()=>({t:key=>locale[key]||key})},
    "@/hooks/use-workspace-snapshot":{useWorkspaceSnapshot:()=>snapshot},"@/lib/claim-math":math,"@/lib/workspace-model":model,
    "@/lib/ui-measurement":uiMeasurement,
    "@/components/workspace/ClaimReviewDialog":{ClaimReviewDialog:"ClaimReviewDialog"},"@/components/workspace/PaymentStatus":{PaymentStatus:"PaymentStatus"},"@/components/workspace/WorkspaceDataState":{WorkspaceDataState:"WorkspaceDataState"},"./AssetComposition":{AssetComposition:"AssetComposition"},
    "@/components/workspace/WorkspaceUI":Object.fromEntries(["DetailButton","EmptyRows","Figure","FilterTabs","PageHeading","Tag","WalletGate"].map(v=>[v,v])),
  },{Date});
  const walk=v=>Array.isArray(v)?v.flatMap(walk):v&&typeof v==="object"?[v,...walk(v.props?.children)]:[];
  const nodes=()=>{cursor=0;return walk(Assets());},tabs=()=>nodes().find(n=>n.type==="FilterTabs"&&n.props.label===locale["workspace.ownedClaims"]),ids=()=>nodes().filter(n=>n.type==="strong").map(n=>n.props.children.join(""));
  assert.deepEqual(ids(),["#1","#2","#3"]);assert.ok(tabs().props.options.some(o=>o.value==="scheduled"));
  tabs().props.onChange("scheduled");assert.deepEqual(ids(),["#1"]);
  tabs().props.onChange("completed");assert.deepEqual(ids(),["#2"]);
  tabs().props.onChange("listed");assert.deepEqual(ids(),[]);
  tabs().props.onChange("all");assert.deepEqual(ids(),["#1","#2","#3"]);
});

test("QA07 market URL restores filters, sort and view and rejects unsupported values",()=>{
  const f=marketLocationFixture("token=MockUSDC&cancel=yes&phase=streaming&sort=price&view=table");
  assert.deepEqual(f.selects().map(n=>n.props.value),["MockUSDC","yes","streaming","price"]);
  assert.ok(f.nodes().some(n=>n.type==="table"));f.selects()[0].props.onChange({target:{value:"all"}});
  assert.equal(f.params().get("sort"),"review");assert.equal(f.moves.at(-1).options.replace,true);
  const invalid=marketLocationFixture("token=wrong&cancel=wrong&phase=wrong&sort=wrong&view=wrong");
  assert.deepEqual(invalid.selects().map(n=>n.props.value),["all","all","all","review"]);assert.equal(invalid.nodes().some(n=>n.type==="table"),false);
});

test("QA07 opening market detail pushes one history entry and close returns to its filters",()=>{
  const f=marketLocationFixture("token=MockUSDC&sort=price");f.nodes().find(n=>n.type==="DetailButton").props.onClick();
  assert.equal(f.params().get("claim"),"3");assert.equal(f.params().get("sort"),"price");assert.equal(f.moves[0].options.replace,undefined);assert.equal(f.moves[0].options.state.vestoraMarketModal,true);
  assert.equal(f.modal().props.claim.id,"3");f.modal().props.onClose();assert.equal(f.moves.at(-1).delta,-1);
});

test("QA07 deep-linked close stays on market and blocked buy intent never bypasses guards",()=>{
  const f=marketLocationFixture("token=MockUSDC&sort=price&claim=3&intent=buy",null,true);
  assert.equal(f.modal().props.mode,"detail");f.modal().props.onClose();
  assert.equal(f.params().has("claim"),false);assert.equal(f.params().has("intent"),false);assert.equal(f.params().get("token"),"MockUSDC");assert.equal(f.params().get("sort"),"price");assert.equal(f.moves.at(-1).options.replace,true);
  assert.equal(marketLocationFixture("claim=999").modal(),undefined);
});

test("QA08 market empty states share one surface and distinguish no listings from no matches",()=>{
  for(const view of ["cards","table"]){
    const empty=marketLocationFixture(`view=${view}`,null,false,false),filtered=marketLocationFixture(`token=mWETH&view=${view}`);
    const surface=f=>f.nodes().find(n=>n.props?.className==="ws-empty");
    assert.equal(surface(empty).props.children,locale["workspace.marketEmpty"]);
    assert.equal(surface(filtered).props.children,locale["workspace.marketFilteredEmpty"]);
    assert.notEqual(surface(empty).props.children,surface(filtered).props.children);
    for(const f of [empty,filtered])assert.equal(f.nodes().some(n=>n.type==="table"||n.props?.className==="ws-market-grid"),false);
  }
});

test("market unknown result counts stay distinct from a verified empty response",()=>{
  const count=f=>f.nodes().find(n=>n.type==="span"&&n.props?.["aria-live"]==="polite").props.children;
  for(const state of ["failure","loading"]){
    const f=marketLocationFixture("",null,true,false);f.snapshot.scenario.dataCondition=state;
    assert.equal(count(f),locale[state==="failure"?"workspace.countUnavailable":"workspace.countLoading"]);
    assert.notEqual(count(f),locale["workspace.count"]);
  }
  const first=marketLocationFixture("",null,false,false);first.snapshot.scenario.screens.market="first-load";
  assert.equal(count(first),locale["workspace.countLoading"]);
  const empty=marketLocationFixture("",null,false,false);
  assert.equal(count(empty),locale["workspace.count"]);
});
