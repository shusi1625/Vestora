"use client";
import { useEffect, useRef, useState } from "react";
import { isAddress, parseUnits } from "viem";
import { useVestora } from "../../hooks/use-vestora";
import { sameAddress } from "../../lib/format";
import { sepoliaContracts } from "../../lib/contracts";
import { portfolioFromStreams, streamView, userStreamGroups } from "../../lib/receivable-value";
import { Address, Amount, Badge, Button, Checkbox, DataState, Dialog, Explanation, Field, FilterGroup, MetricRow, Notice, PageHeading } from "../ui/primitives";
import { PortfolioSummary, ReceivableAmounts, ReceivableList, TransactionStatus, type ReceivableView, type TransactionStep } from "../receivables/summary";
import { ServiceShell, type ServiceView } from "./service-shell";
import { Activity, Marketplace, MySales, SentPayments } from "./service-lists";
import "../../styles/design-system.css";

type Action = "claim" | "list" | "unlist" | "buy" | "cancel" | "create" | "mint";
const actionNames:Record<Action,string>={claim:"청구",list:"판매 등록",unlist:"판매 취소",buy:"구매",cancel:"지급 취소",create:"지급 생성",mint:"테스트 토큰 발행"};
type Quote = { action:Action; account:string; amount:bigint|null; remaining:bigint|null; claimable:bigint|null; refund:bigint|null; id:string; owner?:string; seller?:string; price?:bigint; withdrawn?:bigint; canceled?:boolean };
function positive(value:string) { if(!/^\d+(\.\d{1,6})?$/.test(value)) return null;try {const parsed=parseUnits(value,6);return parsed>BigInt(0)?parsed:null;}catch{return null;} }
function timestamp(value?:bigint) {return value===undefined?"확인 불가":new Date(Number(value)*1000).toLocaleString("ko-KR");}
const routes:ServiceView[]=["market","assets","sales","payments","create","activity","detail"];

export function LiveApp() {
 const c=useVestora();
 const [view,setView]=useState<ServiceView>("market");
 const [marketFilter,setMarketFilter]=useState("전체");
 const [assetFilter,setAssetFilter]=useState("전체");
 const [salesFilter,setSalesFilter]=useState("판매 중");
 const [quote,setQuote]=useState<Quote|null>(null);
 const [busy,setBusy]=useState(false);
 const [localError,setLocalError]=useState("");
 const [searchId,setSearchId]=useState("");
 const actionLock=useRef(false);
 const mainFocus=useRef(false);
 const setStreamId=c.setStreamIdInput;
 useEffect(()=>{
  const apply=()=>{const [next,id]=window.location.hash.slice(1).split("/");if(routes.includes(next as ServiceView)){setView(next as ServiceView);if(next==="detail"&&/^\d+$/.test(id??"")&&BigInt(id)>BigInt(0))setStreamId(id);}if(mainFocus.current)document.getElementById("service-main")?.focus();mainFocus.current=true;};
  apply();window.addEventListener("hashchange",apply);return()=>window.removeEventListener("hashchange",apply);
 },[setStreamId]);
 const priorAccount=useRef(c.address);
 useEffect(()=>{if(priorAccount.current!==c.address){setQuote(null);setLocalError("");priorAccount.current=c.address;}},[c.address]);
 function navigate(next:ServiceView,id?:string) {
  if(busy)return;
  setQuote(null);setLocalError("");setView(next);
  if(id)setStreamId(id);
  window.location.hash=next+(id?"/"+id:"");
 }
 const allStreams=c.userStreams.data?.data;
 const groups=userStreamGroups(allStreams??[],c.address??"");
 const wallet=c.mockUsdcBalance.data??null;
 const value=portfolioFromStreams(wallet,allStreams,c.address??"",sepoliaContracts.mockUSDC);
 const blocked=busy||c.isWriting||c.txState.status==="pending"||c.txState.phase==="unknown";
 const owned=groups.owned.filter(s=>assetFilter==="청구 가능"?BigInt(s.computed.claimableEstimate??"0")>BigInt(0):assetFilter==="판매 중"?s.listing?.status==="ACTIVE":assetFilter==="청구 완료"?s.computed.fullyClaimed===true:true);
 const current=c.stream.data;
 const chainRemaining=current?(current.canceled?(c.vestedAmount.data??null):current.depositedAmount):null;
 const remaining=chainRemaining!==null&&current?(chainRemaining>current.withdrawnAmount?chainRemaining-current.withdrawnAmount:BigInt(0)):null;
 const detailItem:ReceivableView|null=c.backendSelectedStream?streamView(c.backendSelectedStream):current?{
  id:c.selectedStreamIdText??"",name:"수취권 #"+c.selectedStreamIdText,remaining,claimable:c.claimableAmount.data??null,
  paymentState:current.canceled?"지급 취소됨":!c.chainBlock.data?"지급 시점 확인 불가":c.chainBlock.data.timestamp<current.startTime?"지급 시작 전":c.chainBlock.data.timestamp>=current.endTime?"지급 종료":"지급 진행 중",
  estimateAt:c.chainBlock.data?new Date(Number(c.chainBlock.data.timestamp)*1000).toISOString():null,
  endLabel:timestamp(current.endTime),cancelable:current.cancelable,canceled:current.canceled,
  ended:c.chainBlock.data!==undefined&&c.chainBlock.data.timestamp>=current.endTime,listed:c.isListed
 }:null;
 const ownerIsMe=sameAddress(c.streamOwner.data,c.address);
 const senderIsMe=sameAddress(current?.sender,c.address);
 const refresh=async()=>{try{await c.refreshReads();setLocalError("");}catch{setLocalError("일부 정보를 갱신하지 못했습니다. 표시된 값의 확인 시각을 확인하세요.");}};
 const amount=positive(c.streamAmount),salePrice=positive(c.listingPrice);
 const scheduleValid=/^\d+$/.test(c.startDelayMinutes)&&/^\d+$/.test(c.durationMinutes)&&BigInt(c.durationMinutes)>BigInt(0)&&BigInt(c.startDelayMinutes)<=BigInt(5256000)&&BigInt(c.durationMinutes)<=BigInt(5256000);
 const recipientValid=isAddress(c.recipient)&&!/^0x0{40}$/i.test(c.recipient);
 async function confirm(action:Action) {
  if(blocked||!c.canWrite||!c.address)return;
  setLocalError("");setBusy(true);
  try {
   if(action==="create"||action==="mint"){
    const value=positive(action==="create"?c.streamAmount:c.mintAmount);
    if(!value)throw new Error("0보다 큰 금액을 소수점 6자리 이내로 입력하세요.");
    if(action==="create"&&(!recipientValid||!scheduleValid))throw new Error("수취인과 지급 일정을 확인하세요.");
    setQuote({action,account:c.address,id:"",amount:value,remaining:null,claimable:null,refund:null});return;
   }
   const [s,o,l,v,a]=await Promise.all([c.stream.refetch(),c.streamOwner.refetch(),c.listing.refetch(),c.vestedAmount.refetch(),c.claimableAmount.refetch()]);
   if(s.isError||o.isError||l.isError||v.isError||a.isError||!s.data||!o.data||!l.data||v.data===undefined||a.data===undefined)throw new Error("온체인 조건을 확인하지 못했습니다. 잠시 후 다시 조회하세요.");
   const ceiling=s.data.canceled?v.data:s.data.depositedAmount;
   const remainder=ceiling>s.data.withdrawnAmount?ceiling-s.data.withdrawnAmount:BigInt(0);
   if(["claim","list"].includes(action)&&!sameAddress(o.data,c.address))throw new Error("현재 소유자가 아닙니다.");
   if(action==="claim"&&a.data===BigInt(0))throw new Error("현재 청구 가능한 금액이 없습니다.");
   if(action==="list"&&(!salePrice||remainder===BigInt(0)))throw new Error("판매 가격과 남은 수취액을 확인하세요.");
   if(action==="unlist"&&!sameAddress(l.data.seller,c.address))throw new Error("본인이 판매 중인 매물이 아닙니다.");
   if(action==="cancel"&&(!sameAddress(s.data.sender,c.address)||!s.data.cancelable||s.data.canceled))throw new Error("취소할 수 없는 지급입니다.");
   if(action==="buy"&&(sameAddress(l.data.seller,c.address)||!sameAddress(l.data.seller,o.data)||l.data.price===BigInt(0)||remainder===BigInt(0)))throw new Error("구매 가능한 매물이 아닙니다.");
   setQuote({action,account:c.address,id:c.selectedStreamIdText??"",amount:action==="claim"?a.data:action==="list"?salePrice:action==="buy"?l.data.price:null,remaining:remainder,claimable:a.data,refund:s.data.depositedAmount-v.data,owner:o.data,seller:l.data.seller,price:l.data.price,withdrawn:s.data.withdrawnAmount,canceled:s.data.canceled});
  }catch(e){setLocalError(e instanceof Error?e.message:"조건을 확인하지 못했습니다.");}finally{setBusy(false);}
 }
 async function execute() {
  if(!quote||actionLock.current||blocked)return;
  actionLock.current=true;setBusy(true);setLocalError("");
  try {
   if(!sameAddress(quote.account,c.address)||!c.canWrite)throw new Error("지갑과 네트워크를 다시 확인하세요.");
   if(quote.id!==""&&quote.id!==c.selectedStreamIdText)throw new Error("선택한 수취권이 변경되었습니다.");
   if(quote.action==="buy"){
    if(quote.seller===undefined||quote.price===undefined||quote.remaining===null||quote.withdrawn===undefined||quote.canceled===undefined)throw new Error("구매 조건을 다시 확인하세요.");
    await c.handleBuy({account:quote.account,id:quote.id,seller:quote.seller,price:quote.price,remaining:quote.remaining,withdrawn:quote.withdrawn,canceled:quote.canceled});
   }else{
    await ({claim:c.handleClaim,list:c.handleList,unlist:c.handleCancelListing,cancel:c.handleCancelStream,create:c.handleCreateStream,mint:c.handleMint}[quote.action])();
   }
   setQuote(null);
  }catch(e){setLocalError(e instanceof Error?e.message:"거래를 실행하지 못했습니다.");}finally{actionLock.current=false;setBusy(false);}
 }
 const privateView=["assets","sales","payments","create","activity"].includes(view);
 const transactionStep:TransactionStep=c.displayedPhase==="completed"?"completed":c.displayedPhase==="indexing_pending"||c.displayedPhase==="refreshing_onchain"?"indexing":c.displayedPhase==="wallet_confirmation"?"wallet":c.displayedPhase==="rejected"?"rejected":c.displayedPhase==="error"?"failed":"confirming";
 function queryState(query:{isPending:boolean;isError:boolean;data:unknown},content:React.ReactNode){
  if(query.isPending&&!query.data)return <DataState state="loading" title="정보를 불러오고 있습니다">금액을 확인하기 전에는 잔액을 0으로 표시하지 않습니다.</DataState>;
  if(query.isError&&!query.data)return <DataState state="error" title="정보를 불러오지 못했습니다" onRetry={()=>void refresh()}>네트워크 연결과 API 상태를 확인한 뒤 다시 시도하세요.</DataState>;
  return <>{query.isError&&<Notice tone="warning" title="마지막 조회 결과입니다">재조회에 실패했습니다. 거래 전 현재 상태를 다시 확인합니다.</Notice>}{content}</>;
 }
 const titles:Record<ServiceView,[string,string]>={market:["마켓플레이스","판매 가격, 지급 일정, 취소 조건을 비교하세요."],assets:["내 자산","보유한 금액과 지금 받을 수 있는 금액을 확인하세요."],sales:["내 판매","판매 중인 수취권과 지난 판매 상태를 확인하세요."],payments:["지급 관리","송금자로서 지급 조건을 확인하세요."],create:["새 지급 만들기","전체 금액을 예치하고 일정에 따라 청구할 권리를 만듭니다."],activity:["거래 내역","조회 가능한 거래와 현재 처리 결과를 확인하세요."],detail:["수취권 #"+(c.selectedStreamIdText??"—"),"금액, 지급 조건, 현재 소유자를 확인하세요."]};
 let content:React.ReactNode=null;
 if(view==="market")content=queryState(c.backendListings,<Marketplace listings={c.backendListings.data?.data??[]} account={c.address} filter={marketFilter} onFilter={setMarketFilter} onSelect={id=>navigate("detail",id)}/>);
 if(view==="assets")content=queryState(c.userStreams,<div className="v-stack"><PortfolioSummary {...value} wallet={wallet}/><div className="v-section-heading"><h2>보유 수취권</h2><FilterGroup label="보유 수취권 필터" value={assetFilter} options={["전체","청구 가능","판매 중","청구 완료"]} onChange={setAssetFilter}/></div>{owned.length?<ReceivableList items={owned.map(streamView)} onSelect={id=>navigate("detail",id)}/>:<DataState state="empty" title="조건에 맞는 보유 수취권이 없습니다">마켓플레이스에서 지급 조건을 비교할 수 있습니다.</DataState>}</div>);
 if(view==="sales")content=queryState(c.backendListings,<MySales listings={c.backendListings.data?.data??[]} account={c.address??""} filter={salesFilter} onFilter={setSalesFilter} onSelect={id=>navigate("detail",id)}/>);
 if(view==="payments")content=queryState(c.userStreams,<SentPayments streams={groups.sent} onSelect={id=>navigate("detail",id)} onCreate={()=>navigate("create")}/>);
 if(view==="activity")content=queryState(c.userTrades,<Activity trades={c.userTrades.data?.data??[]} streams={allStreams??[]} address={c.address??""}/>);
 if(view==="create")content=<div className="v-detail-grid"><section className="v-surface v-stack"><Field label="수취인 주소" value={c.recipient} onChange={e=>c.setRecipient(e.target.value)} autoComplete="off" error={c.recipient&&!recipientValid?"0이 아닌 유효한 지갑 주소를 입력하세요.":undefined}/><Field label="예치 금액 (mUSDC)" inputMode="decimal" value={c.streamAmount} onChange={e=>c.setStreamAmount(e.target.value)} error={!amount?"0보다 큰 금액, 소수점 최대 6자리":wallet!==null&&amount>wallet?"지갑 잔액이 부족합니다.":undefined}/><Field label="시작 대기 (분)" inputMode="numeric" value={c.startDelayMinutes} onChange={e=>c.setStartDelayMinutes(e.target.value)}/><Field label="지급 기간 (분)" inputMode="numeric" value={c.durationMinutes} onChange={e=>c.setDurationMinutes(e.target.value)} error={!scheduleValid?"시작 대기는 0 이상, 기간은 1 이상인 정수로 입력하세요. 최대 10년입니다.":undefined}/><Checkbox label="송금자가 지급을 취소할 수 있도록 설정" checked={c.cancelable} onChange={e=>c.setCancelable(e.target.checked)} hint="취소 시 아직 지급되지 않은 금액은 송금자에게 반환됩니다."/></section><section className="v-surface v-stack"><h2>예치 전 확인</h2><Amount value={amount} emphasis/><p>전체 금액이 지갑에서 예치됩니다. 수취권 소유자가 바뀌면 청구 권리도 이전됩니다.</p><Button variant="primary" disabled={blocked||!c.canWrite||!amount||!recipientValid||!scheduleValid||wallet===null||amount>wallet} onClick={()=>void confirm("create")}>지급 조건 확인</Button>{c.createdStreamId&&<Button onClick={()=>navigate("detail",c.createdStreamId)}>생성한 수취권 #{c.createdStreamId} 보기</Button>}</section></div>;
 if(view==="detail")content=!c.selectedStreamIdText?<DataState state="empty" title="수취권을 선택하세요">목록에서 수취권을 선택하거나 ID로 조회하세요.</DataState>:!detailItem?<DataState state={c.stream.isPending||c.backendStream.isPending?"loading":"error"} title={c.stream.isPending?"수취권을 확인하고 있습니다":"수취권 정보를 확인하지 못했습니다"} onRetry={()=>void refresh()}>존재하는 ID인지 확인하세요. 백엔드 반영이 지연될 수도 있습니다.</DataState>:<div className="v-detail-grid"><div className="v-stack"><ReceivableAmounts item={detailItem}/><section className="v-surface v-stack"><h2>온체인 확인 정보</h2><dl><MetricRow label="현재 소유자"><Address value={c.streamOwner.data??null}/></MetricRow><MetricRow label="송금자"><Address value={current?.sender??null}/></MetricRow><MetricRow label="청구 가능액"><Amount value={c.claimableAmount.data??null}/></MetricRow><MetricRow label="미청구 수취액"><Amount value={remaining}/></MetricRow><MetricRow label="누적 청구액"><Amount value={current?.withdrawnAmount??null}/></MetricRow><MetricRow label="판매 상태"><Badge>{c.isListed?"판매 중":"미등록"}</Badge></MetricRow></dl><p className="v-condition">온체인 확인 {c.claimableAmount.dataUpdatedAt?new Date(c.claimableAmount.dataUpdatedAt).toLocaleString("ko-KR"):"미확인"} · 누적 청구액은 이전 소유자의 청구를 포함합니다.</p>{(c.stream.isError||c.streamOwner.isError||c.claimableAmount.isError)&&<Notice tone="warning" title="온체인 조회 실패">마지막 확인 값일 수 있습니다. 실행 전 재조회가 필요합니다.</Notice>}</section></div><section className="v-surface v-stack"><h2>{ownerIsMe?"내 수취권 관리":"거래 조건"}</h2>{!c.isConnected?<p>지갑을 연결하면 가능한 행동을 확인할 수 있습니다.</p>:ownerIsMe?<><Button variant="primary" disabled={blocked||!c.canWrite||!c.claimableAmount.data} onClick={()=>void confirm("claim")}>청구하기</Button>{!c.claimableAmount.data&&<p className="v-condition">현재 청구 가능한 금액이 없거나 조회되지 않았습니다.</p>}{c.isListed?<Button disabled={blocked||!c.canWrite} onClick={()=>void confirm("unlist")}>판매 취소</Button>:<><Field label="판매 가격 (mUSDC)" inputMode="decimal" value={c.listingPrice} onChange={e=>c.setListingPrice(e.target.value)} error={!salePrice?"0보다 큰 금액을 소수점 6자리 이내로 입력하세요.":undefined}/><Button disabled={blocked||!c.canWrite||!salePrice||remaining===null||remaining===BigInt(0)} onClick={()=>void confirm("list")}>판매 조건 확인</Button></>}</>:c.isListed?<><Amount emphasis value={c.listing.data?.price??null}/><p className="v-condition">구매 후 청구는 별도 거래입니다. 취소 가능 여부와 남은 수취액을 확인하세요.</p><Button variant="primary" disabled={blocked||!c.canWrite} onClick={()=>void confirm("buy")}>구매 조건 확인</Button></>:<p>현재 판매 중인 수취권이 아닙니다.</p>}{senderIsMe&&current?.cancelable&&!current.canceled&&<><hr/><Notice tone="warning" title="송금자 지급 관리">지급 취소는 향후 지급을 중단합니다. 판매 취소와 다른 행동입니다.</Notice><Button disabled={blocked||!c.canWrite} onClick={()=>void confirm("cancel")}>지급 취소 검토</Button></>}</section></div>;
 return <ServiceShell view={view} onNavigate={navigate} controller={c}><div className="v-stack">
 {(view!=="payments"||!c.isConnected)&&<PageHeading title={titles[view][0]} description={titles[view][1]} action={<Button disabled={busy} onClick={()=>void refresh()}>새로고침</Button>}/>}
 {c.connectError&&<Notice tone="danger" title="지갑 연결 실패">MetaMask 설치 여부와 지갑 요청을 확인하세요.</Notice>}
 {c.switchError&&<Notice tone="danger" title="네트워크를 전환하지 못했습니다">지갑에서 Sepolia를 선택하세요.</Notice>}
 {c.isConnected&&!c.isSepolia&&<Notice tone="warning" title="Sepolia로 전환해야 거래할 수 있습니다"><Button onClick={()=>c.switchChain({chainId:11155111})}>네트워크 전환</Button></Notice>}
 {(c.backendIsStale||c.indexerMetrics.data?.indexer.status==="lagging"||c.indexerMetrics.data?.indexer.status==="rpc_error")&&<Notice tone="warning" title="정보 반영이 지연되고 있습니다">조회 값은 마지막 반영 시점 기준입니다. 거래 전 온체인 조건을 다시 확인합니다.</Notice>}
 {localError&&<Notice tone="danger" title="확인이 필요합니다">{localError}</Notice>}
 {c.storageWarning&&<Notice tone="warning" title="거래 저장 안내">{c.storageWarning}</Notice>}
 {c.txState.label&&<section className="v-surface v-stack"><h2>거래 처리 상태</h2>{c.txState.phase==="unknown"?<Notice tone="warning" title="거래 결과 확인이 지연되고 있습니다">거래가 이미 제출됐습니다. 중복 실행하지 말고 탐색기에서 결과를 확인하세요.</Notice>:c.txState.label==="Buy Preflight"&&!c.txState.hash?<Notice title="구매 조건 확인">{c.txState.status==="error"?"현재 조건으로 구매할 수 없습니다.":"구매 조건을 다시 확인하고 있습니다."}</Notice>:<TransactionStatus step={transactionStep}/>}<Explanation label="거래 확인 정보"><p>{c.txState.label}</p><p>{c.displayedMessage}</p>{c.txState.refreshWarning&&<p>거래는 성공했지만 일부 정보 갱신에 실패했습니다.</p>}{c.txState.hash&&<a href={"https://sepolia.etherscan.io/tx/"+c.txState.hash} target="_blank" rel="noreferrer">블록 탐색기에서 거래 보기</a>}</Explanation>{(c.txState.phase==="unknown"||c.txState.refreshWarning)&&<Button disabled={c.txState.status==="pending"} onClick={()=>void c.recoverTransaction()}>거래 결과 다시 확인</Button>}</section>}
 {privateView&&!c.isConnected?<DataState state="empty" title="지갑을 연결해 확인하세요">상단의 지갑 연결 버튼으로 개인 자산과 거래 내역을 확인할 수 있습니다.</DataState>:content}
 {(view==="market"||view==="assets")&&<form className="v-inline" onSubmit={e=>{e.preventDefault();if(/^\d+$/.test(searchId)&&BigInt(searchId)>BigInt(0))navigate("detail",BigInt(searchId).toString());}}><Field label="수취권 ID로 조회" value={searchId} onChange={e=>setSearchId(e.target.value)} inputMode="numeric"/><Button type="submit" disabled={!/^\d+$/.test(searchId)||BigInt(searchId||"0")===BigInt(0)}>상세 조회</Button></form>}
 {c.isConnected&&view==="assets"&&<Explanation label="테스트 도구 · MockUSDC 발행"><div className="v-stack"><Field label="발행 수량 (mUSDC)" value={c.mintAmount} onChange={e=>c.setMintAmount(e.target.value)} inputMode="decimal"/><p>실제 가치가 없는 테스트 토큰입니다.</p><Button disabled={blocked||!c.canWrite||!positive(c.mintAmount)} onClick={()=>void confirm("mint")}>발행 확인</Button></div></Explanation>}
 </div><Dialog open={quote!==null} title={quote?actionNames[quote.action]+" 전 확인":"거래 확인"} onClose={()=>{if(!busy)setQuote(null);}} busy={busy} footer={<><Button disabled={busy} onClick={()=>setQuote(null)}>돌아가기</Button><Button variant="primary" disabled={blocked||!c.canWrite} onClick={()=>void execute()}>{busy?"처리 중":"지갑에서 확인"}</Button></>}>
 {quote&&<div className="v-stack"><p className="v-muted">Sepolia 실제 테스트넷 거래 · 지갑 서명이 필요합니다.</p><dl><MetricRow label="실행 지갑"><Address value={quote.account}/></MetricRow>{quote.id&&<MetricRow label="수취권">#{quote.id}</MetricRow>}{quote.amount!==null&&<MetricRow label={quote.action==="buy"?"지불 금액":quote.action==="list"?"판매 가격":quote.action==="create"?"전체 예치 금액":"수량"}><Amount value={quote.amount}/></MetricRow>}{quote.remaining!==null&&<MetricRow label="미청구 수취액"><Amount value={quote.remaining}/></MetricRow>}{quote.action==="claim"&&<MetricRow label="청구 후 미청구액"><Amount value={quote.remaining!==null&&quote.amount!==null?quote.remaining-quote.amount:null}/></MetricRow>}{quote.action==="cancel"&&<><MetricRow label="송금자 환급 예상"><Amount value={quote.refund}/></MetricRow><MetricRow label="소유자에게 남는 권리"><Amount value={quote.claimable}/></MetricRow></>}{quote.action==="create"&&<><MetricRow label="수취인"><Address value={c.recipient}/></MetricRow><MetricRow label="시작 대기 / 지급 기간">{c.startDelayMinutes}분 / {c.durationMinutes}분</MetricRow><MetricRow label="송금자 취소">{c.cancelable?"가능":"불가"}</MetricRow></>}</dl>
 {quote.action==="buy"&&<Notice tone={current?.cancelable?"warning":"neutral"} title={current?.cancelable?"송금자가 지급을 취소할 수 있습니다":"취득할 청구 권리를 확인하세요"}>미청구 금액에는 현재 청구 가능액이 포함됩니다. 지급 조건이 유지된다는 가정이며 수익이 보장되지 않습니다.</Notice>}
 {quote.action==="unlist"&&<Notice title="판매 등록만 해제합니다">수취권과 청구 권리는 계속 보유합니다.</Notice>}
 {quote.action==="cancel"&&<Notice tone="warning" title="앞으로의 지급이 중단됩니다">취소 시점까지 발생한 미청구 권리는 소유자에게 남습니다. 표시 금액은 시간에 따라 바뀔 수 있습니다.</Notice>}
 <p className="v-condition">가스비는 ETH로 지불하며 지갑에서 확인합니다. 승인과 본 거래는 별개이며, 승인만 성공하고 본 거래가 실패할 수 있습니다.</p>
 {localError&&<Notice tone="danger" title="실행하지 못했습니다">{localError}</Notice>}</div>}
 </Dialog></ServiceShell>;
}
