import type { ClaimTotals } from "@/lib/claim-math";

export type ClaimFilter = "all" | "claimable" | "future" | "listed" | "claimed";

export const CLAIM_FILTERS: { value: ClaimFilter; key: string }[] = [
  { value: "all", key: "assets.filter.all" },
  { value: "claimable", key: "assets.filter.claimable" },
  { value: "future", key: "assets.filter.future" },
  { value: "listed", key: "assets.filter.listed" },
  { value: "claimed", key: "assets.filter.claimed" },
];

export const isClaimFilter = (value: string | null): value is ClaimFilter =>
  value === "all" ||
  value === "claimable" ||
  value === "future" ||
  value === "listed" ||
  value === "claimed";

export const matchesClaimFilter = (
  filter: ClaimFilter,
  totals: ClaimTotals,
  isListed: boolean,
): boolean => {
  switch (filter) {
    case "claimable":
      return totals.claimableNow.raw > 0n;
    case "future":
      return totals.futureAmount.raw > 0n;
    case "listed":
      return isListed;
    case "claimed":
      return totals.claimStatus === "fully-claimed";
    case "all":
    default:
      return true;
  }
};
