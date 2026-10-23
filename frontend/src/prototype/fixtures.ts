/**
 * 프로토타입 샘플 데이터 (온체인 연동 전).
 * 실제 컨트랙트가 연결되면 이 파일은 조회 함수로 대체됩니다.
 * 날짜는 2026-10-01을 기준으로 한 상대 오프셋으로 만들어 두어 지급 일정이 자연스럽게 보입니다.
 */
import { TOKENS } from "@/lib/tokens";
import type { Claim, Listing, TokenSymbol, TxRecord, WalletAccount } from "@/lib/types";

const BASE = Date.parse("2026-10-01T00:00:00.000Z");
const DAY = 86_400_000;

/** 기준일로부터 day일 뒤(음수는 이전)의 ISO 시각 */
export const iso = (day: number, hour = 0): string =>
  new Date(BASE + day * DAY + hour * 3_600_000).toISOString();

const parseUnits = (value: string, decimals: number): bigint => {
  const [whole, fraction = ""] = value.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
};

export const usdc = (value: string): bigint =>
  parseUnits(value, TOKENS.MockUSDC.decimals);
export const weth = (value: string): bigint => parseUnits(value, TOKENS.mWETH.decimals);
export const eth = (value: string): bigint => parseUnits(value, TOKENS.ETH.decimals);

export const ACCOUNT_A = "0x7Ac4F2d9B0e1a53C6D8f4B27a19E5c3D8fB26a41";
export const ACCOUNT_B = "0x2B8eD71c5Af3906D4bE27C58a1Fd04b6A9e3C7f2";
export const ACCOUNT_C = "0x9F1c6B30aE74d2580Cf5B1e9D67a3C48b0E5d912";

export type AccountKey = "A" | "B" | "C";

export const ACCOUNTS: Record<AccountKey, WalletAccount> = {
  A: {
    address: ACCOUNT_A,
    label: "지갑 A · 보유자",
    balances: [
      { token: "MockUSDC", raw: usdc("1420.50") },
      { token: "mWETH", raw: weth("0.84") },
    ],
    gasRaw: eth("0.0412"),
  },
  B: {
    address: ACCOUNT_B,
    label: "지갑 B · 구매자",
    balances: [{ token: "MockUSDC", raw: usdc("320.00") }],
    // 가스 잔액 부족 시안을 실제로 재현할 수 있도록 낮게 둡니다.
    gasRaw: eth("0.0008"),
  },
  C: {
    address: ACCOUNT_C,
    label: "지갑 C · 송금자",
    balances: [
      { token: "MockUSDC", raw: usdc("5000.00") },
      { token: "mWETH", raw: weth("12.0") },
    ],
    gasRaw: eth("0.12"),
  },
};

const claim = (input: Claim): Claim => input;

export const CLAIMS: Claim[] = [
  claim({ id: "1061", token: "MockUSDC", payer: ACCOUNT_A, originalRecipient: ACCOUNT_B, owner: ACCOUNT_C, deposited: usdc("2000"), claimed: usdc("350"), startAt: iso(0), endAt: iso(61), cancellable: true, ownership: "verified" }),
  claim({ id: "1058", token: "MockUSDC", payer: ACCOUNT_A, originalRecipient: ACCOUNT_B, owner: ACCOUNT_B, deposited: usdc("1200"), claimed: usdc("900"), startAt: iso(-30), endAt: iso(14), cancellable: false, ownership: "verified" }),
  claim({ id: "1046", token: "MockUSDC", payer: ACCOUNT_A, originalRecipient: ACCOUNT_B, owner: ACCOUNT_B, deposited: usdc("800"), claimed: usdc("160"), startAt: iso(-16), endAt: iso(44), cancelledAt: iso(2), cancellable: true, ownership: "verified" }),
  claim({ id: "1062", token: "MockUSDC", payer: ACCOUNT_A, originalRecipient: ACCOUNT_C, owner: ACCOUNT_C, deposited: usdc("1000"), claimed: 0n, startAt: iso(31), endAt: iso(61), cancellable: false, ownership: "verified" }),
  claim({
    id: "1049",
    token: "MockUSDC",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_B,
    owner: ACCOUNT_A,
    deposited: usdc("1000.00"),
    claimed: usdc("0"),
    startAt: iso(0),
    endAt: iso(90),
    cancellable: true,
    ownership: "verified",
  }),
  claim({
    id: "1050",
    token: "mWETH",
    payer: ACCOUNT_A,
    originalRecipient: ACCOUNT_B,
    owner: ACCOUNT_A,
    deposited: weth("4.5"),
    claimed: weth("0"),
    startAt: iso(3),
    endAt: iso(120),
    cancellable: false,
    ownership: "verified",
  }),
  claim({
    id: "1051",
    token: "MockUSDC",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_B,
    owner: ACCOUNT_B,
    deposited: usdc("500.00"),
    claimed: usdc("100.00"),
    startAt: iso(-10),
    endAt: iso(50),
    cancellable: true,
    ownership: "verified",
  }),
  claim({
    id: "1052",
    token: "MockUSDC",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_B,
    owner: ACCOUNT_B,
    deposited: usdc("250.00"),
    claimed: usdc("250.00"),
    startAt: iso(-80),
    endAt: iso(-10),
    cancellable: false,
    ownership: "verified",
  }),
  claim({
    id: "1053",
    token: "MockUSDC",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_A,
    owner: ACCOUNT_A,
    deposited: usdc("800.00"),
    claimed: usdc("120.00"),
    startAt: iso(-60),
    endAt: iso(30),
    cancellable: true,
    cancelledAt: iso(-2),
    ownership: "verified",
  }),
  claim({
    id: "1054",
    token: "mWETH",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_A,
    owner: ACCOUNT_A,
    deposited: weth("2.0"),
    claimed: weth("0"),
    startAt: iso(-5),
    endAt: iso(40),
    cancellable: false,
    ownership: "verifying",
  }),
  claim({
    id: "1055",
    token: "MockUSDC",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_B,
    owner: ACCOUNT_B,
    deposited: usdc("300.00"),
    claimed: usdc("0"),
    startAt: iso(10),
    endAt: iso(100),
    cancellable: true,
    ownership: "verified",
  }),
  claim({
    id: "1056",
    token: "MockUSDC",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_B,
    owner: ACCOUNT_B,
    deposited: usdc("420.00"),
    claimed: usdc("0"),
    startAt: iso(-20),
    endAt: iso(70),
    cancellable: false,
    ownership: "verified",
  }),
  claim({
    id: "1057",
    token: "MockUSDC",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_B,
    owner: ACCOUNT_B,
    deposited: usdc("60.00"),
    claimed: usdc("60.00"),
    startAt: iso(-70),
    endAt: iso(-5),
    cancellable: false,
    ownership: "verified",
  }),
  claim({
    id: "1048",
    token: "MockUSDC",
    payer: ACCOUNT_C,
    originalRecipient: ACCOUNT_A,
    owner: ACCOUNT_B,
    deposited: usdc("500.00"),
    claimed: usdc("50.00"),
    startAt: iso(-30),
    endAt: iso(60),
    cancellable: true,
    ownership: "verified",
  }),
];

export const LISTINGS: Listing[] = [
  {
    id: "L-9001",
    claimId: "1049",
    seller: ACCOUNT_A,
    priceRaw: usdc("850.00"),
    status: "active",
  },
  {
    id: "L-9002",
    claimId: "1051",
    seller: ACCOUNT_B,
    // 수취액보다 높은 가격: 0%로 숨기지 않고 초과 가격으로 표시되는지 확인용
    priceRaw: usdc("560.00"),
    status: "active",
  },
  {
    id: "L-9003",
    claimId: "1054",
    seller: ACCOUNT_A,
    priceRaw: weth("1.5"),
    status: "active",
  },
  {
    id: "L-9004",
    claimId: "1055",
    seller: ACCOUNT_B,
    priceRaw: usdc("320.00"),
    status: "void",
    invalidReason: "ownership-changed",
  },
  {
    id: "L-9005",
    claimId: "1057",
    seller: ACCOUNT_B,
    priceRaw: usdc("10.00"),
    status: "active",
  },
  {
    id: "L-9006",
    claimId: "1048",
    seller: ACCOUNT_A,
    priceRaw: usdc("380.00"),
    status: "sold",
    closedAt: iso(-3, 5),
  },
];

/** 세션 시작 시 확인할 수 있도록 남겨 둔 과거 거래 기록 */
export const INITIAL_TX_RECORDS: TxRecord[] = [
  { id: "tx-seed-buy-A", kind: "buy", claimId: "1049", token: "MockUSDC", amountRaw: usdc("850"), role: "buyer", accountKey: "A", requestedAt: iso(17, 2), phase: "completed" },
  { id: "tx-seed-claim-A", kind: "claim", claimId: "1053", token: "MockUSDC", amountRaw: usdc("120"), role: "owner", accountKey: "A", requestedAt: iso(-3, 4), phase: "completed" },
  { id: "tx-seed-failed-A", kind: "claim", claimId: "1049", token: "MockUSDC", amountRaw: usdc("50"), role: "owner", accountKey: "A", requestedAt: iso(17, 1), phase: "failed-onchain", failureReason: "tx.reason.failedOnchain" },
  {
    id: "tx-seed-1",
    accountKey: "B",
    kind: "claim",
    claimId: "1048",
    token: "MockUSDC",
    amountRaw: usdc("50.00"),
    role: "owner",
    requestedAt: iso(-3, 6),
    phase: "completed",
    hash: "0x4b1f8c2a9d7e3f5b6c8a1d2e4f7a9b0c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90",
    explorerUrl:
      "https://sepolia.etherscan.io/tx/0x4b1f8c2a9d7e3f5b6c8a1d2e4f7a9b0c3d5e6f7a8b9c0d1e2f3a4b5c6d7e8f90",
  },
  {
    id: "tx-seed-2",
    accountKey: "B",
    kind: "buy",
    claimId: "1048",
    token: "MockUSDC",
    amountRaw: usdc("380.00"),
    role: "buyer",
    requestedAt: iso(-3, 5),
    phase: "completed",
    hash: "0x9c2e4f6a8b0d1e3f5a7b9c0d2e4f6a8b0c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f",
    explorerUrl:
      "https://sepolia.etherscan.io/tx/0x9c2e4f6a8b0d1e3f5a7b9c0d2e4f6a8b0c1d3e5f7a9b0c2d4e6f8a0b1c3d5e7f",
  },
];

export const TOKEN_LABEL: Record<TokenSymbol, string> = {
  MockUSDC: "MockUSDC",
  mWETH: "mWETH",
  ETH: "ETH",
};

/** 예상 가스비. 실제 컨트랙트 연결 시 추정 함수로 대체됩니다. */
export const GAS_ESTIMATE = {
  claim: eth("0.0014"),
  buy: eth("0.0021"),
  list: eth("0.0018"),
  approve: eth("0.0009"),
  "cancel-payment": eth("0.0016"),
} as const;

export const getClaimById = (id: string): Claim | undefined =>
  CLAIMS.find((item) => item.id === id);

export const getListingForClaim = (
  listings: Listing[],
  claimId: string,
): Listing | null =>
  listings.find(
    (listing) => listing.claimId === claimId && listing.status !== "void",
  ) ??
  listings.find((listing) => listing.claimId === claimId) ??
  null;

export const getListingsForClaim = (listings: Listing[], claimId: string): Listing[] =>
  listings.filter((listing) => listing.claimId === claimId);

export const genTxHash = (seed: number): string =>
  `0x${(seed.toString(16) + "a1b2c3d4e5f60718293a4b5c6d7e8f90".repeat(4)).slice(0, 64)}`;

export const explorerTxUrl = (hash: string): string =>
  `https://sepolia.etherscan.io/tx/${hash}`;
export const explorerAddressUrl = (address: string): string =>
  `https://sepolia.etherscan.io/address/${address}`;
export const explorerTokenUrl = (address: string, tokenId: string): string =>
  `https://sepolia.etherscan.io/token/${address}?a=${tokenId}`;
