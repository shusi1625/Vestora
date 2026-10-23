import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="figure text-[48px] font-bold text-primary">404</p>
        <EmptyState
          titleKey="notFound.title"
          bodyKey="notFound.body"
          action={
            <Link
              to="/market"
              className="rounded-md bg-primary px-4 py-2 text-body-sm font-medium text-primary-foreground transition-colors duration-fast hover:bg-primary/90"
            >
              {t("notFound.actions.backHome")}
            </Link>
          }
        />
      </div>
    </div>
  );
};

export default NotFound;
