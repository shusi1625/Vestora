export type NavItem = {
  to: string;
  key: string;
  /** 하위 경로까지 활성으로 볼지 여부 */
  matchPrefix?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { to: "/market", key: "nav.marketplace" },
  { to: "/assets", key: "nav.assets" },
  { to: "/my/sales", key: "nav.mySales" },
];

/** 지급 관리 하위 메뉴 */
export const PAYMENT_NAV: NavItem[] = [
  { to: "/manage/create", key: "nav.paymentCreate" },
  { to: "/manage/issued", key: "nav.paymentIssued" },
];

export const SECONDARY_NAV: NavItem[] = [
  { to: "/transactions", key: "nav.transactions" },
];

export const isNavItemActive = (item: NavItem, pathname: string): boolean => {
  if (item.to === "/market") return pathname === "/" || pathname.startsWith("/market");
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
};
