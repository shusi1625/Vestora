"use client";

import { useState } from "react";
import "../../styles/design-system.css";
import { Address, Amount, Badge, Button, Checkbox, DataState, Dialog, Explanation, Field, FilterGroup, MetricRow, Notice, PageHeading, Select } from "../../components/ui/primitives";
import { PortfolioSummary, PurchaseSummary, ReceivableAmounts, ReceivableList, TransactionStatus, type ReceivableView, type TransactionStep } from "../../components/receivables/summary";

const samples: ReceivableView[] = [
  { id: "101", name: "프로젝트 정산금", remaining: BigInt(1200000000), claimable: BigInt(300000000), endLabel: "2026. 12. 15", paymentState:"지급 진행 중", estimateAt:"2026-10-17T00:00:00Z", cancelable: false, listed: false },
  { id: "102", name: "디자인 용역대금", remaining: BigInt(800000000), claimable: BigInt(120000000), endLabel: "2026. 11. 30", paymentState:"지급 진행 중", estimateAt:"2026-10-17T00:00:00Z", cancelable: true, listed: true },
  { id: "103", name: "월간 리서치 지급", remaining: BigInt(600000000), claimable: BigInt(0), endLabel: "2027. 01. 15", cancelable: false, listed: false },
];
const purchase: ReceivableView = { paymentState:"지급 진행 중", estimateAt:"2026-10-17T00:00:00Z", id: "204", name: "제품 개발 정산금", remaining: BigInt(1500000000), claimable: BigInt(250000000), endLabel: "2026. 12. 31", cancelable: true, listed: true };
const screens = ["내 자산", "수취권 상세", "구매 확인", "컴포넌트"] as const;
type Screen = typeof screens[number];
const states = ["정상", "로딩", "빈 화면", "조회 오류", "갱신 지연", "소유권 미확인", "긴 데이터"] as const;

export default function DesignSystemReview() {
  const [screen, setScreen] = useState<Screen>("내 자산");
  const [state, setState] = useState<string>("정상");
  const [connected, setConnected] = useState(true);
  const [filter, setFilter] = useState("전체");
  const [selected, setSelected] = useState(samples[0]);
  const [dialog, setDialog] = useState<"청구" | "구매" | null>(null);
  const [step, setStep] = useState<TransactionStep | null>(null);
  const [price, setPrice] = useState("1380");
  const unknown = state === "소유권 미확인";
  const long = state === "긴 데이터";
  const previewAmount = long ? BigInt("12345678901234567890123456") : BigInt(5000000000);
  const go = (next: Screen) => { setScreen(next); setStep(null); setDialog(null); };
  const select = (id: string) => { setSelected(samples.find(item => item.id === id)!); go("수취권 상세"); };
  const displayed = filter === "청구 가능" ? samples.filter(s => s.claimable! > BigInt(0)) : filter === "판매 중" ? samples.filter(s => s.listed) : samples;
  const isDataState = state === "로딩" || state === "빈 화면" || state === "조회 오류";
  const content = screen === "내 자산" ? <>
    <PortfolioSummary total={unknown ? null : previewAmount} wallet={BigInt(2400000000)} claimable={unknown ? null : BigInt(420000000)} future={unknown ? null : BigInt(2180000000)} cancelableFuture={unknown ? null : BigInt(680000000)} />
    <section className="v-stack"><div className="v-section-heading"><h2>보유 수취권</h2><FilterGroup label="수취권 필터" value={filter} onChange={setFilter} options={["전체", "청구 가능", "판매 중"]} /></div>
      <ReceivableList items={displayed.map(item => ({ ...item, name: long ? "장기 프로젝트 공동 개발 및 콘텐츠 제작 정산 수취권" : item.name, remaining: unknown ? null : long ? previewAmount : item.remaining, claimable: unknown ? null : item.claimable }))} onSelect={select} />
      <p className="v-condition">청구 가능액은 지금 받을 수 있는 금액입니다. 지급 예정액은 지급 일정과 취소 조건을 함께 확인하세요.</p>
    </section>
  </> : screen === "수취권 상세" ? <div className="v-detail-grid">
    <div className="v-stack"><ReceivableAmounts item={unknown ? { ...selected, remaining: null, claimable: null } : selected} />
      <section className="v-surface"><h2>소유권과 지급 조건</h2><dl><MetricRow label="현재 소유자"><Address value={unknown ? null : "0xE079c73856257A68fD8Fce48f3Be56750CB260AD"} /></MetricRow><MetricRow label="최초 수취인"><Address value="0xE079c73856257A68fD8Fce48f3Be56750CB260AD" /></MetricRow><MetricRow label="판매 상태"><Badge>{selected.listed ? "판매 중" : "미등록"}</Badge></MetricRow></dl><p className="v-condition">샘플 기준 시각 2026. 10. 17 12:00 · 실행 전 온체인 재확인 필요</p></section></div>
    <section className="v-surface v-stack"><h2>내 수취권 관리</h2><p className="v-muted">청구하면 지갑 잔액이 늘고, 수취권에 남은 금액이 줄어듭니다.</p><Amount value={unknown ? null : selected.claimable} emphasis /><Button variant="primary" disabled={unknown || selected.claimable === BigInt(0)} onClick={() => { setStep(null); setDialog("청구"); }}>청구하기</Button>{(unknown || selected.claimable === BigInt(0)) && <p className="v-condition">{unknown ? "소유권을 확인한 뒤 청구할 수 있습니다." : "현재 청구 가능한 금액이 없습니다."}</p>}<p className="v-condition">검토 페이지에서는 지갑 서명이나 거래를 요청하지 않습니다.</p></section>
  </div> : screen === "구매 확인" ? <div className="v-detail-grid"><div className="v-stack"><ReceivableAmounts item={purchase} /><Notice tone="warning" title="구매하면 청구 권리를 취득합니다">취소 가능한 지급입니다. 예정 금액 전체를 받을 수 있다고 가정하지 마세요.</Notice></div><PurchaseSummary item={purchase} price={BigInt(1380000000)}><Button variant="primary" onClick={() => { setStep(null); setDialog("구매"); }}>구매 전 확인</Button></PurchaseSummary></div> : <div className="v-stack">
    <section className="v-surface v-stack"><h2>색상과 의미</h2><div className="v-swatch-grid"><div className="v-swatch"><Badge>지급 진행 중</Badge><p>일반 정보 · 중립</p></div><div className="v-swatch"><Badge tone="success">반영 완료</Badge><p>완료 · 초록</p></div><div className="v-swatch"><Badge tone="warning">송금자 취소 가능</Badge><p>조건 확인 · 황토</p></div><div className="v-swatch"><Badge tone="danger">거래 실패</Badge><p>오류 · 빨강</p></div></div></section>
    <section className="v-surface v-stack"><h2>버튼과 입력</h2><div className="v-inline"><Button variant="primary" onClick={() => setDialog("구매")}>구매 확인</Button><Button onClick={() => go("내 자산")}>내 자산 보기</Button><Button variant="text" onClick={() => go("수취권 상세")}>상세 보기</Button><Button disabled>청구 가능액 없음</Button></div>
      <Field label="판매 가격 (mUSDC)" value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" hint="가격은 자산 합계에 더하지 않습니다." error={!/^\d+(\.\d{1,6})?$/.test(price) || Number(price) <= 0 ? "0보다 큰 금액을 소수점 6자리 이내로 입력하세요." : undefined} />
      <Checkbox label="송금자가 지급을 취소할 수 있도록 설정" hint="취소 시 미지급 예정액이 송금자에게 반환됩니다." />
      <Explanation label="보유 합계는 어떻게 계산하나요?">지갑 잔액과 현재 소유한 수취권의 총 미청구 금액을 합산합니다. 판매 중 수취권은 한 번만 포함하며, 서로 다른 토큰을 환율 없이 합산하지 않습니다.</Explanation>
    </section>
    <section className="v-surface v-stack"><h2>거래 상태</h2>{(["wallet","confirming","indexing","completed","rejected","failed"] as TransactionStep[]).map(value => <TransactionStatus key={value} step={value} />)}</section>
    <section className="v-surface v-stack"><h2>불확실한 데이터</h2><Amount value={null} /><DataState state="loading" title="자산 정보를 확인하고 있습니다">잔액을 0으로 표시하지 않습니다.</DataState><DataState state="empty" title="보유한 수취권이 없습니다">마켓플레이스에서 지급 조건을 비교하세요.</DataState><DataState state="error" title="현재 잔액을 확인할 수 없습니다" onRetry={() => go("내 자산")}>일부 정보를 불러오지 못했습니다. 마지막 값이 있다면 확인 시각과 함께 유지합니다.</DataState></section>
  </div>;

  return <div className="vestora" lang="ko"><a className="v-skip" href="#review-main">본문 바로가기</a><div className="v-shell">
    <aside className="v-sidebar"><div className="v-logo"><svg viewBox="0 0 30 32" aria-hidden="true"><path d="M3 4h8l7 24h-8z" fill="currentColor"/><path d="M18 4h9l-9 24-4-13z" fill="#8dac79"/></svg>vestora</div><nav aria-label="대표 화면 검토">{screens.map(item => <button key={item} className="v-nav-item" aria-current={screen === item ? "page" : undefined} onClick={() => go(item)}>{item}</button>)}</nav><p className="v-sidebar-note">디자인 검토 v0.1<br/>샘플 데이터 · 실제 거래 없음</p></aside>
    <div><header className="v-header"><span>Sepolia · 디자인 미리보기</span><Button onClick={() => setConnected(!connected)}>{connected ? "샘플 지갑 연결 해제" : "샘플 지갑 연결"}</Button></header>
      <main id="review-main" className="v-main" tabIndex={-1}><PageHeading title={screen === "수취권 상세" ? selected.name : screen} description={screen === "내 자산" ? "보유한 금액과 지금 받을 수 있는 금액을 확인하세요." : screen === "컴포넌트" ? "같은 의미를 같은 표현으로 전달하는 UI 구성 요소입니다." : "금액, 지급 시점, 취소 조건을 확인하세요."} />
        <div className="v-review-tools"><Select label="검토할 데이터 상태" value={state} onChange={e => setState(e.target.value)}>{states.map(value => <option key={value}>{value}</option>)}</Select><p className="v-muted">현재 데이터와 거래 결과는 시안 검토용입니다.</p></div>
        <div className="v-stack">{!connected && screen !== "컴포넌트" ? <DataState state="empty" title="지갑을 연결해 자산을 확인하세요"><Button variant="primary" onClick={() => setConnected(true)}>샘플 지갑 연결</Button></DataState> : isDataState ? <DataState state={state === "로딩" ? "loading" : state === "빈 화면" ? "empty" : "error"} title={state === "로딩" ? "자산 정보를 확인하고 있습니다" : state === "빈 화면" ? "표시할 수취권이 없습니다" : "자산 정보를 불러오지 못했습니다"} onRetry={state === "조회 오류" ? () => setState("정상") : undefined}>데이터가 없거나 조회되지 않은 상태를 잔액 0과 구분합니다.</DataState> : <>{state === "갱신 지연" && <Notice tone="warning" title="정보 갱신이 지연되고 있습니다">마지막 조회 결과입니다. 거래 직전에 소유권과 금액을 다시 확인합니다.</Notice>}{unknown && <Notice tone="warning" title="소유권을 확인하지 못했습니다">보유 합계를 확정할 수 없습니다. 알려진 지갑 잔액은 별도로 표시합니다.</Notice>}{content}</>}</div>
      </main></div></div>
    <Dialog open={dialog !== null} title={dialog === "청구" ? "청구 전 확인" : "구매 전 확인"} onClose={() => setDialog(null)} footer={<><Button onClick={() => setDialog(null)}>돌아가기</Button><Button variant="primary" onClick={() => setStep(step === "indexing" ? "completed" : "indexing")}>{step === "completed" ? "상태 다시 보기" : step === "indexing" ? "반영 완료 보기" : "반영 대기 보기"}</Button></>}>
      {dialog === "청구" ? <dl><MetricRow label="이번 청구 예상액"><Amount value={selected.claimable} /></MetricRow><MetricRow label="청구 후 미청구 수취액"><Amount value={selected.remaining !== null && selected.claimable !== null ? selected.remaining - selected.claimable : null} /></MetricRow></dl> : <dl><MetricRow label="지불할 금액"><Amount value={BigInt(1380000000)} /></MetricRow><MetricRow label="취득할 수취액"><Amount value={purchase.remaining} /></MetricRow></dl>}
      <p className="v-condition">실제 거래를 실행하지 않는 상태 미리보기입니다. 예시 금액은 바뀌지 않습니다.</p>{step && <TransactionStatus step={step} />}
    </Dialog>
  </div>;
}
