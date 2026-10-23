import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { NetworkBadge } from "./NetworkBadge";
import {
  PAYMENT_NAV,
  PRIMARY_NAV,
  SECONDARY_NAV,
  isNavItemActive,
  type NavItem,
} from "./nav-items";

export const MobileNav = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pathname, setPathname] = useState("/");

  const renderItems = (items: NavItem[]) =>
    items.map((item) => (
      <li key={item.to}>
        <Link
          to={item.to}
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center justify-between rounded-md px-3 py-2.5 text-[15px] font-medium transition-colors duration-fast",
            isNavItemActive(item, pathname)
              ? "bg-listed-bg text-listed"
              : "text-foreground hover:bg-accent",
          )}
        >
          {t(item.key)}
        </Link>
      </li>
    ));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors duration-fast hover:bg-accent md:hidden"
        aria-label={t("nav.openMenu")}
        onClick={() => setPathname(window.location.pathname)}
      >
        <Menu aria-hidden className="size-4" />
      </SheetTrigger>
      <SheetContent side="right" className="w-[86vw] max-w-sm overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Vestora</SheetTitle>
          <SheetDescription>{t("nav.mobileDescription")}</SheetDescription>
        </SheetHeader>
        <nav className="mt-4 space-y-4">
          <ul className="space-y-1">{renderItems(PRIMARY_NAV)}</ul>
          <div className="space-y-1">
            <p className="px-3 text-caption font-semibold text-muted-foreground">
              {t("nav.paymentManage")}
            </p>
            <ul className="space-y-1">{renderItems(PAYMENT_NAV)}</ul>
          </div>
          <ul className="space-y-1">{renderItems(SECONDARY_NAV)}</ul>
        </nav>
        <div className="mt-6 space-y-2 border-t border-border pt-4">
          <p className="text-caption text-muted-foreground">{t("nav.networkState")}</p>
          <NetworkBadge />
          <SheetClose asChild>
            <button type="button" className="sr-only">
              {t("common.close")}
            </button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
};
