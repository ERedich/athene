import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <p className="max-w-md text-sm text-on-surface-variant">{t("dashboard.empty")}</p>
    </div>
  );
}
