import { useTranslation } from "react-i18next";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { PAYMENT_NAV, PRIMARY_NAV, SECONDARY_NAV, isNavItemActive } from "./nav-items";

const navItemClass = (active: boolean) =>
  cn(
    "relative inline-flex items-center gap-1 rounded-md px-3 py-2 text-body-sm font-medium transition-colors duration-fast",
    active
      ? "text-primary"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );

const Underline = ({ active }: { active: boolean }) =>
  active ? (
    <span
      aria-hidden
      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
    />
  ) : null;

export const HeaderNav = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const paymentActive = PAYMENT_NAV.some((item) => isNavItemActive(item, location.pathname));

  return (
    <nav className={cn("items-center gap-1", className)} aria-label={t("nav.main")}>
      {PRIMARY_NAV.map((item) => (
        <NavLink key={item.to} to={item.to} className={navItemClass(false)}>
          {({ isActive }) => (
            <>
              {t(item.key)}
              <Underline active={isActive} />
            </>
          )}
        </NavLink>
      ))}

      <DropdownMenu>
        <DropdownMenuTrigger className={navItemClass(paymentActive)}>
          {t("nav.paymentManage")}
          <ChevronDown aria-hidden className="size-3.5" />
          <Underline active={paymentActive} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel className="text-caption font-medium text-muted-foreground">
            {t("nav.paymentManage")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PAYMENT_NAV.map((item) => (
            <DropdownMenuItem key={item.to} asChild>
              <Link to={item.to} className="w-full">
                {t(item.key)}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {SECONDARY_NAV.map((item) => (
        <NavLink key={item.to} to={item.to} className={navItemClass(false)}>
          {({ isActive }) => (
            <>
              {t(item.key)}
              <Underline active={isActive} />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
};
