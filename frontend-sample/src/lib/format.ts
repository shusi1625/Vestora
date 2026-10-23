import { TOKENS, displayDecimals, getDecimals } from "./tokens";
import type { Amount, TokenSymbol } from "./types";

/** 최소 단위 수량을 소수 문자열로 변환합니다(반올림 없음 = 전체 정밀값). */
export const toDecimalString = (raw: bigint, decimals: number): string => {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const fraction = (abs % base).toString().padStart(decimals, "0");
  const sign = negative ? "-" : "";
  if (decimals === 0) return `${sign}${whole.toString()}`;
  return `${sign}${whole.toString()}.${fraction}`;
};

/** 지정 자릿수로 반올림합니다(반올림 표시용). */
export const roundUnits = (raw: bigint, from: number, to: number): bigint => {
  if (to >= from) return raw * 10n ** BigInt(to - from);
  const factor = 10n ** BigInt(from - to);
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const rounded = (abs + factor / 2n) / factor;
  return negative ? -rounded : rounded;
};

const groupThousands = (value: string): string => {
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
};

/** 표시용 금액 문자열(토큰 단위 제외). displayDecimals 자리로 반올림 후 천 단위 구분. */
export const formatUnits = (
  raw: bigint,
  token: TokenSymbol,
  digits?: number,
): string => {
  const decimals = getDecimals(token);
  const display = digits ?? displayDecimals(token);
  const rounded = roundUnits(raw, decimals, display);
  // A nonzero claim must never look like an empty balance.
  if (raw !== 0n && rounded === 0n) return groupThousands(toDecimalString(raw, decimals));
  return groupThousands(toDecimalString(rounded, display));
};

/** 전체 정밀값(반올림 없이 컨트랙트가 다루는 값 그대로). */
export const formatFullUnits = (raw: bigint, token: TokenSymbol): string =>
  toDecimalString(raw, getDecimals(token));

/** 반올림 표시 값과 전체 정밀값이 다른지 여부(전체 정밀값 확인 안내 노출 판단). */
export const hasHiddenPrecision = (
  raw: bigint,
  token: TokenSymbol,
  digits?: number,
): boolean => {
  const decimals = getDecimals(token);
  const display = digits ?? displayDecimals(token);
  if (display >= decimals) return false;
  return raw % (10n ** BigInt(decimals - display)) !== 0n;
};

/** 금액을 항상 토큰 단위와 함께 문자열로 만듭니다. */
export const formatAmountText = (item: Amount, digits?: number): string =>
  `${formatUnits(item.raw, item.token, digits)} ${item.token}`;

export const shortenAddress = (address: string, size = 4): string => {
  if (!address) return "-";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export const formatDate = (iso: string): string =>
  dateFormatter.format(new Date(iso));

export const formatDateTime = (iso: string): string =>
  dateTimeFormatter.format(new Date(iso));

export const formatTime = (iso: string): string => timeFormatter.format(new Date(iso));

export const toDateTimeAttr = (iso: string): string => new Date(iso).toISOString();

/** 비율을 퍼센트 문자열로. 값이 없으면 null을 반환해 UI가 항목을 숨깁니다. */
export const formatPercent = (ratio: number | null, digits = 1): string | null => {
  if (ratio === null || !Number.isFinite(ratio)) return null;
  return `${(ratio * 100).toFixed(digits)}%`;
};

export const percentRatio = (numerator: bigint, denominator: bigint): number | null => {
  if (denominator === 0n) return null;
  return Number(numerator) / Number(denominator);
};

export const gasText = (raw: bigint): string =>
  `${formatUnits(raw, "ETH", 6)} ${TOKENS.ETH.symbol}`;
