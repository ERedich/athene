import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet } from "react-router-dom";

export function RequireAuth() {
  const { t } = useTranslation();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/auth/me", { credentials: "include" })
      .then((r) => {
        if (!alive) return;
        setOk(r.ok);
      })
      .catch(() => {
        if (!alive) return;
        setOk(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (ok === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-on-surface-variant text-sm">
        {t("auditLog.loadingSession")}
      </div>
    );
  }
  if (!ok) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
