import { getDecimals } from "./tokens";
import type { TokenSymbol } from "./types";

export type PriceError = "empty" | "format" | "decimals" | "range" | null;

export type ParsedPrice = {
  raw: bigint;
  error: PriceError;
};

/** 사용자가 입력한 가격 문자열을 최소 단위로 변환하고 오류 종류를 구분합니다. */
export const parsePrice = (input: string, token: TokenSymbol): ParsedPrice => {
  const value = input.trim();
  const decimals = getDecimals(token);

  if (value === "") return { raw: 0n, error: "empty" };
  if (!/^\d*\.?\d*$/.test(value)) return { raw: 0n, error: "format" };

  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) return { raw: 0n, error: "decimals" };

  const raw =
    BigInt(whole === "" ? "0" : whole) * 10n ** BigInt(decimals) +
    BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");

  if (raw <= 0n) return { raw, error: "range" };

  return { raw, error: null };
};
