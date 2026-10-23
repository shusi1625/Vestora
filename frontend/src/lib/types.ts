/**
 * Vestora 도메인 타입.
 * 온체인 연동 전이지만 값의 정밀도를 유지해야 하므로 모든 수량은 최소 단위 bigint로 다룹니다.
 */

export type TokenSymbol = "MockUSDC" | "mWETH" | "ETH";

export type TokenInfo = {
  symbol: TokenSymbol;
  name: string;
  decimals: number;
  /** gas: 가스비 전용, payment: 지급 예치·결제 토큰 */
  kind: "payment" | "gas";
};

/** 최소 단위 수량. token으로 decimals를 알 수 있습니다. */
export type Amount = {
  token: TokenSymbol;
  raw: bigint;
};

export type PaymentStatus = "streaming" | "completed" | "cancelled";
export type ClaimStatus = "claimable" | "not-accrued" | "fully-claimed";
export type ListingStatus = "unlisted" | "listed" | "sold" | "cancelled" | "void";
export type OwnershipState = "verified" | "verifying" | "unverified";

export type Claim = {
  /** Verified API projection valuation; never extrapolated with the local clock. */
  valuation?: { at: string; vestedRaw: bigint };
  id: string;
  token: TokenSymbol;
  /** 송금자 */
  payer: string;
  /** 최초 수취인 */
  originalRecipient: string;
  /** 현재 소유자 */
  owner: string;
  /** 최초 예치액 */
  deposited: bigint;
  /** 누적 청구액(소유자가 바뀌었을 수 있어 "내가 받은 금액"이 아님) */
  claimed: bigint;
  startAt: string;
  endAt: string;
  cancellable: boolean;
  cancelledAt?: string;
  ownership: OwnershipState;
};

export type ListingInvalidReason =
  | "ownership-changed"
  | "claim-changed"
  | "fully-claimed"
  | "payment-cancelled";

export type ListingRecordStatus = "active" | "sold" | "unlisted" | "void";

export type Listing = {
  id: string;
  claimId: string;
  seller: string;
  priceRaw: bigint;
  status: ListingRecordStatus;
  /** 판매 완료 시점 */
  closedAt?: string;
  invalidReason?: ListingInvalidReason;
};

export type TxKind =
  | "create"
  | "approve"
  | "list"
  | "unlist"
  | "buy"
  | "claim"
  | "cancel-payment";

export type TxPhase =
  | "preparing"
  | "approval-required"
  | "wallet-pending"
  | "rejected"
  | "submitted"
  | "mining"
  | "failed-onchain"
  | "indexing"
  | "completed"
  | "stalled"
  | "replaced";

export type TxRecord = {
  id: string;
  kind: TxKind;
  claimId: string;
  token: TokenSymbol;
  /** 이 거래로 실제 이동한 수량 */
  amountRaw: bigint;
  /** 조회한 지갑의 역할 */
  role: "owner" | "buyer" | "seller" | "payer" | "recipient";
  requestedAt: string;
  phase: TxPhase;
  /** 거래를 실행한 계정(지갑) 키 */
  accountKey?: string;
  hash?: string;
  explorerUrl?: string;
  failureReason?: string;
};

/** 지갑 계정. 프로토타입에서는 A/B/C로 역할을 나눠 두 지갑 흐름을 시연합니다. */
export type WalletAccount = {
  address: string;
  label: string;
  /** 결제 토큰 잔액(가스용 ETH와 분리) */
  balances: Amount[];
  /** 가스용 ETH 잔액 */
  gasRaw: bigint;
};

export type ClaimRole = "owner" | "payer" | "recipient";

export type DataCondition =
  | "normal"
  | "loading"
  | "refreshing"
  | "empty"
  | "partial-failure"
  | "failure"
  | "stale"
  | "pending-index";
