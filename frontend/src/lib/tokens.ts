import type { Amount, TokenInfo, TokenSymbol } from "./types";

export const TOKENS: Record<TokenSymbol, TokenInfo> = {
  MockUSDC: {
    symbol: "MockUSDC",
    name: "테스트 달러",
    decimals: 6,
    kind: "payment",
  },
  mWETH: {
    symbol: "mWETH",
    name: "테스트 이더",
    decimals: 18,
    kind: "payment",
  },
  ETH: {
    symbol: "ETH",
    name: "가스용 이더",
    decimals: 18,
    kind: "gas",
  },
};

export const PAYMENT_TOKENS: TokenSymbol[] = ["MockUSDC", "mWETH"];

export const getDecimals = (token: TokenSymbol): number => TOKENS[token].decimals;

export const amount = (token: TokenSymbol, raw: bigint): Amount => ({ token, raw });

export const zero = (token: TokenSymbol): Amount => ({ token, raw: 0n });

/** 표시용 기본 소수 자릿수. 결제 토큰은 2/4자리로 반올림해 보여줍니다. */
export const displayDecimals = (token: TokenSymbol): number =>
  TOKENS[token].decimals === 6 ? 2 : 4;

export const addAmount = (a: Amount, b: Amount): Amount => {
  if (a.token !== b.token) {
    throw new Error(`다른 토큰은 합산할 수 없습니다: ${a.token} + ${b.token}`);
  }
  return { token: a.token, raw: a.raw + b.raw };
};

export const subAmount = (a: Amount, b: Amount): Amount => {
  if (a.token !== b.token) {
    throw new Error(`다른 토큰은 뺄 수 없습니다: ${a.token} - ${b.token}`);
  }
  return { token: a.token, raw: a.raw - b.raw };
};

export const isPositive = (a: Amount): boolean => a.raw > 0n;

/**
 * 토큰이 섞인 목록을 토큰별 합계로 묶습니다.
 * 환율 근거 없이 서로 다른 토큰을 하나의 금액으로 만들지 않기 위한 유일한 합산 경로입니다.
 */
export const sumByToken = (amounts: Amount[]): Amount[] => {
  const totals = new Map<TokenSymbol, bigint>();
  for (const item of amounts) {
    totals.set(item.token, (totals.get(item.token) ?? 0n) + item.raw);
  }
  return [...totals.entries()].map(([token, raw]) => ({ token, raw }));
};
