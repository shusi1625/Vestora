import { useCallback, useMemo, useState, type ReactNode } from "react";

import { amount } from "@/lib/tokens";
import type { Amount, Claim, Listing, TokenSymbol, TxRecord } from "@/lib/types";
import {
  ACCOUNTS,
  CLAIMS as SEED_CLAIMS,
  INITIAL_TX_RECORDS,
  LISTINGS as SEED_LISTINGS,
  type AccountKey,
} from "@/prototype/fixtures";

import {
  PrototypeDataContext,
  type PrototypeDataValue,
} from "./prototype-data-context";

const seedBalances = (): Record<AccountKey, Amount[]> => ({
  A: ACCOUNTS.A.balances.map((item) => ({ ...item })),
  B: ACCOUNTS.B.balances.map((item) => ({ ...item })),
  C: ACCOUNTS.C.balances.map((item) => ({ ...item })),
});

const seedGas = (): Record<AccountKey, bigint> => ({
  A: ACCOUNTS.A.gasRaw,
  B: ACCOUNTS.B.gasRaw,
  C: ACCOUNTS.C.gasRaw,
});

const adjustBalance = (
  balances: Record<AccountKey, Amount[]>,
  key: AccountKey,
  token: TokenSymbol,
  delta: bigint,
): Record<AccountKey, Amount[]> => {
  const list = balances[key];
  const hasToken = list.some((item) => item.token === token);
  const next = hasToken
    ? list.map((item) =>
        item.token === token ? { ...item, raw: item.raw + delta } : item,
      )
    : [...list, amount(token, delta)];
  return { ...balances, [key]: next };
};

const findAccountKey = (address: string): AccountKey | null => {
  const keys = Object.keys(ACCOUNTS) as AccountKey[];
  return keys.find((key) => ACCOUNTS[key].address === address) ?? null;
};

const replaceBalance = (
  balances: Record<AccountKey, Amount[]>,
  from: AccountKey | null,
  to: AccountKey | null,
  token: TokenSymbol,
  deltaFrom: bigint,
  deltaTo: bigint,
): Record<AccountKey, Amount[]> => {
  let next = balances;
  if (from) next = adjustBalance(next, from, token, deltaFrom);
  if (to) next = adjustBalance(next, to, token, deltaTo);
  return next;
};

/**
 * 프로토타입 데이터 저장소. 거래가 확정되면 이 저장소를 갱신해
 * 자산 합계·상세·매물 화면이 실제로 다시 렌더되도록 합니다.
 */
export const PrototypeDataProvider = ({ children }: { children: ReactNode }) => {
  const [claims, setClaims] = useState<Claim[]>(() => SEED_CLAIMS.map((item) => ({ ...item })));
  const [listings, setListings] = useState<Listing[]>(() =>
    SEED_LISTINGS.map((item) => ({ ...item })),
  );
  const [balancesByAccount, setBalances] =
    useState<Record<AccountKey, Amount[]>>(seedBalances);
  const [gas] = useState<Record<AccountKey, bigint>>(seedGas);
  const [records, setRecords] = useState<TxRecord[]>(() =>
    INITIAL_TX_RECORDS.map((item) => ({ ...item })),
  );
  const [pendingIndexClaimIds, setPendingIndex] = useState<string[]>([]);

  const markPendingIndex = useCallback((claimId: string, active: boolean) => {
    setPendingIndex((prev) =>
      active ? [...new Set([...prev, claimId])] : prev.filter((id) => id !== claimId),
    );
  }, []);

  const applyClaim = useCallback(
    (claimId: string, accountKey: AccountKey, amountRaw: bigint) => {
      const token = claims.find((item) => item.id === claimId)?.token;
      setClaims((prev) =>
        prev.map((item) =>
          item.id === claimId ? { ...item, claimed: item.claimed + amountRaw } : item,
        ),
      );
      if (token) {
        setBalances((prev) => adjustBalance(prev, accountKey, token, amountRaw));
      }
    },
    [claims],
  );

  const applyPurchase = useCallback(
    (claimId: string, accountKey: AccountKey, priceRaw: bigint) => {
      const target = claims.find((item) => item.id === claimId);
      if (target) {
        const sellerKey = findAccountKey(target.owner);
        setBalances((prev) =>
          replaceBalance(
            prev,
            sellerKey,
            accountKey,
            target.token,
            priceRaw,
            -priceRaw,
          ),
        );
      }
      setClaims((prev) =>
        prev.map((item) =>
          item.id === claimId ? { ...item, owner: ACCOUNTS[accountKey].address } : item,
        ),
      );
      setListings((prev) =>
        prev.map((item) =>
          item.claimId === claimId && item.status === "active"
            ? { ...item, status: "sold", closedAt: new Date().toISOString() }
            : item,
        ),
      );
    },
    [claims],
  );

  const applyListing = useCallback(
    (claimId: string, accountKey: AccountKey, priceRaw: bigint) => {
      const seller = ACCOUNTS[accountKey].address;
      setListings((prev) => {
        const existing = prev.find((item) => item.claimId === claimId);
        if (!existing) {
          return [
            ...prev,
            {
              id: `L-${claimId}-${Date.now()}`,
              claimId,
              seller,
              priceRaw,
              status: "active",
            },
          ];
        }
        return prev.map((item) =>
          item.claimId === claimId
            ? {
                ...item,
                seller,
                priceRaw,
                status: "active",
                invalidReason: undefined,
                closedAt: undefined,
              }
            : item,
        );
      });
    },
    [],
  );

  const applyUnlist = useCallback((claimId: string) => {
    setListings((prev) =>
      prev.map((item) =>
        item.claimId === claimId && item.status === "active"
          ? { ...item, status: "unlisted" }
          : item,
      ),
    );
  }, []);

  const applyCancelPayment = useCallback(
    (claimId: string, accountKey: AccountKey, refundRaw: bigint) => {
      const token = claims.find((item) => item.id === claimId)?.token;
      setClaims((prev) =>
        prev.map((item) =>
          item.id === claimId
            ? { ...item, cancelledAt: new Date().toISOString() }
            : item,
        ),
      );
      if (token) {
        setBalances((prev) => adjustBalance(prev, accountKey, token, refundRaw));
      }
    },
    [claims],
  );

  const appendRecord = useCallback((record: TxRecord) => {
    setRecords((prev) => [record, ...prev]);
  }, []);

  const updateRecord = useCallback((id: string, patch: Partial<TxRecord>) => {
    setRecords((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const value = useMemo<PrototypeDataValue>(
    () => ({
      claims,
      listings,
      balancesByAccount,
      gas,
      records,
      pendingIndexClaimIds,
      applyClaim,
      applyPurchase,
      applyListing,
      applyUnlist,
      applyCancelPayment,
      setPendingIndex: markPendingIndex,
      appendRecord,
      updateRecord,
    }),
    [
      claims,
      listings,
      balancesByAccount,
      gas,
      records,
      pendingIndexClaimIds,
      applyClaim,
      applyPurchase,
      applyListing,
      applyUnlist,
      applyCancelPayment,
      markPendingIndex,
      appendRecord,
      updateRecord,
    ],
  );

  return (
    <PrototypeDataContext.Provider value={value}>{children}</PrototypeDataContext.Provider>
  );
};
