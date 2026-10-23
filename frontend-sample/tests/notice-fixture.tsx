import {useState} from "react";
import {createRoot} from "react-dom/client";
import {DismissibleNotice} from "../src/components/workspace/DismissibleNotice";
import {canDismissTransactionNotice} from "../src/lib/notice-policy";
import "../src/index.css";
import "../src/styles/workspace.css";

/** Isolated dev fixture: no provider, storage, wallet or network interaction. */
export function Fixture(){
  const [transaction,setTransaction]=useState(1);
  return <main className="page-container ws-main"><h1>Vestora · 알림 UI 테스트</h1>
    <div className="live-data-status"><span className="ws-tag ws-warning">최신 데이터 확인 필요</span></div>
    <DismissibleNotice noticeKey={`completed:${transaction}`} dismissible={canDismissTransactionNotice("completed",true)} closeLabel="지급 생성 알림 닫기" className="claim-progress claim-completed"><h2>지급 생성 완료</h2><p>발행한 지급은 지급 관리에서, 수취한 지급은 내 자산에서 확인할 수 있습니다.</p><p>수취권 #{transaction} · 최초 예치액 1.000000 MockUSDC</p></DismissibleNotice>
    <DismissibleNotice noticeKey="data:stale" dismissible closeLabel="데이터 지연 안내 닫기" className="ws-notice"><p>이전 시점의 데이터입니다. 실행 전 최신 상태를 확인해야 합니다.</p></DismissibleNotice>
    <DismissibleNotice noticeKey="indexing:verified" dismissible={canDismissTransactionNotice("indexing",true)} closeLabel="화면 반영 대기 알림 닫기" className="claim-progress claim-indexing"><h2>지급 생성 확인 · 화면 반영 대기</h2><p>온체인에서 거래 완료가 확인되었습니다. 화면에 반영되기까지 잠시 시간이 걸릴 수 있습니다.</p></DismissibleNotice>
    <DismissibleNotice noticeKey="unknown" dismissible={canDismissTransactionNotice("unknown",false)} closeLabel="미확정 알림 닫기" className="claim-progress claim-unknown"><h2>거래 결과 확인 필요</h2><p>기존 거래를 먼저 확인해 주세요.</p></DismissibleNotice>
    <button type="button" onClick={()=>setTransaction(value=>value+1)}>다음 알림</button>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Fixture/>);
