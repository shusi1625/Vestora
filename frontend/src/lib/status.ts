import type {
  ClaimStatus,
  ListingInvalidReason,
  ListingStatus,
  OwnershipState,
  PaymentStatus,
  TxKind,
  TxPhase,
} from "./types";

/**
 * 상태 라벨은 컴포넌트에서 t(키)로 읽습니다(동적 키 생성 금지 규칙 준수).
 * 색만으로 상태를 구분하지 않기 위해 라벨 키와 톤을 항상 함께 보관합니다.
 */

export type StatusTone = "claimable" | "scheduled" | "warning" | "void" | "listed" | "muted";

export type StatusMeta = {
  key: string;
  tone: StatusTone;
};

/** 축 1: 지급 상태 */
export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  streaming: { key: "status.payment.streaming", tone: "listed" },
  completed: { key: "status.payment.completed", tone: "scheduled" },
  cancelled: { key: "status.payment.cancelled", tone: "void" },
};

/** 축 2: 청구 상태 */
export const CLAIM_STATUS: Record<ClaimStatus, StatusMeta> = {
  claimable: { key: "status.claim.claimable", tone: "claimable" },
  "not-accrued": { key: "status.claim.notAccrued", tone: "muted" },
  "fully-claimed": { key: "status.claim.fullyClaimed", tone: "scheduled" },
};

/** 축 3: 판매 상태 */
export const LISTING_STATUS: Record<ListingStatus, StatusMeta> = {
  unlisted: { key: "status.listing.unlisted", tone: "muted" },
  listed: { key: "status.listing.listed", tone: "listed" },
  sold: { key: "status.listing.sold", tone: "scheduled" },
  cancelled: { key: "status.listing.cancelled", tone: "warning" },
  void: { key: "status.listing.void", tone: "void" },
};

export const OWNERSHIP_STATE: Record<OwnershipState, StatusMeta> = {
  verified: { key: "status.ownership.verified", tone: "claimable" },
  verifying: { key: "status.ownership.verifying", tone: "scheduled" },
  unverified: { key: "status.ownership.unverified", tone: "warning" },
};

export const LISTING_INVALID_REASON: Record<ListingInvalidReason, string> = {
  "ownership-changed": "market.invalid.ownershipChanged",
  "claim-changed": "market.invalid.claimChanged",
  "fully-claimed": "market.invalid.fullyClaimed",
  "payment-cancelled": "market.invalid.paymentCancelled",
};

export type TxPhaseMeta = StatusMeta & { hintKey: string; terminal: boolean };

/** 공통 거래 처리 상태. 반영 지연을 실패로 바꾸지 않습니다. */
export const TX_PHASE: Record<TxPhase, TxPhaseMeta> = {
  preparing: {
    key: "tx.phase.preparing",
    hintKey: "tx.hint.preparing",
    tone: "scheduled",
    terminal: false,
  },
  "approval-required": {
    key: "tx.phase.approvalRequired",
    hintKey: "tx.hint.approvalRequired",
    tone: "listed",
    terminal: false,
  },
  "wallet-pending": {
    key: "tx.phase.walletPending",
    hintKey: "tx.hint.walletPending",
    tone: "listed",
    terminal: false,
  },
  rejected: {
    key: "tx.phase.rejected",
    hintKey: "tx.hint.rejected",
    tone: "warning",
    terminal: true,
  },
  submitted: {
    key: "tx.phase.submitted",
    hintKey: "tx.hint.submitted",
    tone: "listed",
    terminal: false,
  },
  mining: {
    key: "tx.phase.mining",
    hintKey: "tx.hint.mining",
    tone: "scheduled",
    terminal: false,
  },
  "failed-onchain": {
    key: "tx.phase.failedOnchain",
    hintKey: "tx.hint.failedOnchain",
    tone: "void",
    terminal: true,
  },
  indexing: {
    key: "tx.phase.indexing",
    hintKey: "tx.hint.indexing",
    tone: "warning",
    terminal: false,
  },
  completed: {
    key: "tx.phase.completed",
    hintKey: "tx.hint.completed",
    tone: "claimable",
    terminal: true,
  },
  stalled: {
    key: "tx.phase.stalled",
    hintKey: "tx.hint.stalled",
    tone: "warning",
    terminal: false,
  },
  replaced: {
    key: "tx.phase.replaced",
    hintKey: "tx.hint.replaced",
    tone: "void",
    terminal: true,
  },
};

/** 타임라인에 표시하는 정상 진행 순서 */
export const TX_PHASE_ORDER: TxPhase[] = [
  "preparing",
  "approval-required",
  "wallet-pending",
  "submitted",
  "mining",
  "indexing",
  "completed",
];

export const TX_KIND: Record<TxKind, string> = {
  create: "tx.kind.create",
  approve: "tx.kind.approve",
  list: "tx.kind.list",
  unlist: "tx.kind.unlist",
  buy: "tx.kind.buy",
  claim: "tx.kind.claim",
  "cancel-payment": "tx.kind.cancelPayment",
};

export const TX_ROLE_KEY: Record<string, string> = {
  owner: "tx.role.owner",
  buyer: "tx.role.buyer",
  seller: "tx.role.seller",
  payer: "tx.role.payer",
  recipient: "tx.role.recipient",
};
