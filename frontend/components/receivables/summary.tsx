import { Amount, Badge, Button, MetricRow, Notice } from "../ui/primitives";
import type { ReactNode } from "react";
import { priceComparison } from "../../lib/receivable-value";

export type ReceivableView = {
  id: string; name: string; remaining: bigint | null; claimable: bigint | null;
  paymentState?: string; claimState?: string; estimateAt?: string | null;
  endLabel: string; cancelable: boolean; listed: boolean; canceled?: boolean; ended?: boolean;
};
export function PortfolioSummary({ total, wallet, claimable, future, cancelableFuture }: {
  total: bigint | null; wallet: bigint | null; claimable: bigint | null; future: bigint | null; cancelableFuture: bigint | null;
}) {
  return <section className="v-portfolio" aria-label="보유 자산 구성">
    <div className="v-portfolio-total"><h2>보유 합계 <span>명목 기준</span></h2><Amount value={total} emphasis />
      <p>지갑 잔액 + 현재 보유한 수취권의 미청구액</p><p>판매 중인 수취권 포함 · 판매 가격은 합산하지 않음</p></div>
    <div className="v-portfolio-parts"><dl><MetricRow label="지갑 잔액"><Amount value={wallet} /></MetricRow><MetricRow label="청구 가능액"><Amount value={claimable} /></MetricRow><MetricRow label="지급 예정액"><Amount value={future} /></MetricRow></dl>
      <p className="v-condition">예정액 중 <Amount value={cancelableFuture} />는 송금자가 취소할 수 있습니다.</p></div>
  </section>;
}
export function ReceivableList({ items, onSelect }: { items: ReceivableView[]; onSelect: (id: string) => void }) {
  return <div className="v-table-scroll"><table className="v-table"><caption className="v-sr-only">보유 수취권의 금액, 지급 조건, 판매 상태</caption>
    <thead><tr><th>수취권</th><th className="v-numeric">미청구 수취액</th><th className="v-numeric">청구 가능액</th><th>지급 조건</th><th>판매 상태</th><th><span className="v-sr-only">상세 이동</span></th></tr></thead>
    <tbody>{items.map(item => <tr key={item.id}><th scope="row">{item.name}<span className="v-muted">#{item.id}</span></th><td data-label="미청구 수취액" className="v-numeric"><Amount value={item.remaining} /></td><td data-label="청구 가능액" className="v-numeric"><Amount value={item.claimable} /></td><td data-label="지급 조건"><div>{item.endLabel}<span className="v-table-condition">{item.canceled ? "지급 취소됨" : item.cancelable ? "송금자 취소 가능" : "취소 불가"}</span></div></td><td data-label="판매 상태"><Badge>{item.listed ? "판매 중" : "미등록"}</Badge></td><td><Button variant="text" aria-label={item.name + " 상세 보기"} onClick={() => onSelect(item.id)}>상세 보기</Button></td></tr>)}</tbody>
  </table></div>;
}
export function ReceivableAmounts({ item }: { item: ReceivableView }) {
  const future = item.remaining !== null && item.claimable !== null && item.remaining >= item.claimable ? item.remaining - item.claimable : null;
  return <section className="v-surface"><div className="v-section-heading"><h2>받을 금액과 일정</h2><Badge>{item.paymentState ?? (item.canceled ? "지급 취소됨" : item.ended ? "지급 종료" : "지급 시점 확인 불가")}</Badge></div>
    <dl className="v-detail-metrics"><MetricRow label="청구 상태">{item.claimState ?? (item.remaining === BigInt(0) ? "청구 완료" : item.claimable === null ? "청구 가능액 확인 불가" : item.claimable > BigInt(0) ? "청구 가능" : "현재 청구 가능액 없음")}</MetricRow><MetricRow label="판매 상태">{item.listed ? "판매 중" : "미등록"}</MetricRow><MetricRow label="총 미청구 수취액"><Amount value={item.remaining} /></MetricRow><MetricRow label="청구 가능액"><Amount value={item.claimable} /></MetricRow><MetricRow label="지급 예정액"><Amount value={future} /></MetricRow></dl>
    <p className="v-condition">추정 기준 {item.estimateAt ? new Date(item.estimateAt).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}) : "확인 불가"}</p>
    <p className="v-condition">지급 종료일 {item.endLabel} · 청구 가능액은 위 미청구 수취액에 포함됩니다.</p>
    <Notice tone={item.cancelable ? "warning" : "neutral"} title={item.canceled ? "향후 지급이 중단되었습니다" : item.cancelable ? "송금자가 지급을 취소할 수 있습니다" : "송금자가 취소할 수 없는 지급입니다"}>
      {item.cancelable ? "취소 시 아직 지급되지 않은 금액은 송금자에게 반환됩니다. 취소 시점까지 발생한 미청구 권리는 소유자에게 남습니다." : "취소 불가가 무위험을 의미하지 않습니다. 토큰과 컨트랙트 위험은 남습니다."}
    </Notice></section>;
}
export function PurchaseSummary({ item, price, children }: { item: ReceivableView; price: bigint | null; children?: ReactNode }) {
  const comparison = priceComparison(item.remaining, price, true);
  return <section className="v-surface v-purchase"><h2>구매 조건</h2><dl><MetricRow label="지불할 금액"><Amount value={price} /></MetricRow><MetricRow label="취득할 미청구 수취액"><Amount value={item.remaining} /></MetricRow><MetricRow label="그중 청구 가능액"><Amount value={item.claimable} /></MetricRow><MetricRow label="예상 차익"><Amount value={comparison?.difference ?? null} /></MetricRow></dl>
    <p className="v-condition">비용 제외 · 지급 조건 유지 가정. 확정 수익이 아닙니다.</p>{comparison?.premium && <Notice tone="warning" title="가격이 남은 수취액보다 높습니다" />}
    <p className="v-condition">예상 가스비는 지갑 확인 단계에서 확인합니다. 청구에는 별도 거래가 필요합니다.</p>{children}</section>;
}
export type TransactionStep = "wallet" | "confirming" | "indexing" | "completed" | "rejected" | "failed";
const steps: Record<TransactionStep, { title: string; description: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  wallet: { title: "지갑에서 확인해 주세요", description: "아직 거래가 제출되지 않았습니다.", tone: "neutral" },
  confirming: { title: "거래 확정 대기", description: "네트워크에서 거래 결과를 확인하고 있습니다.", tone: "neutral" },
  indexing: { title: "거래 완료 · 자산 갱신 중", description: "거래는 성공했습니다. 이전 잔액이 잠시 표시될 수 있습니다.", tone: "warning" },
  completed: { title: "자산 갱신 완료", description: "거래 결과를 자산 정보에 반영했습니다.", tone: "success" },
  rejected: { title: "지갑 요청을 취소했습니다", description: "거래가 제출되지 않았습니다. 조건을 확인하고 다시 시도할 수 있습니다.", tone: "neutral" },
  failed: { title: "거래가 실행되지 않았습니다", description: "실패 원인과 현재 상태를 확인한 뒤 다시 시도하세요.", tone: "danger" },
};
export function TransactionStatus({ step }: { step: TransactionStep }) {
  const state = steps[step];
  return <div aria-live="polite"><Notice tone={state.tone} title={state.title}>{state.description}</Notice></div>;
}
