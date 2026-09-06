import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Button } from "primereact/button";
import { Toast } from "primereact/toast";

import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { fetchAssignmentUserDetail } from "../lib/assignmentsApi";
import type { AssignmentUserDetail } from "../lib/assignmentTypes";

export function AssignmentsUserPage() {
  const { t } = useTranslation();
  const { userId } = useParams();
  const navigate = useNavigate();
  const { setHeaderActions, setHeaderRowCount } =
    useOutletContext<AppShellOutletContext>();
  const toast = useRef<Toast>(null);

  const [detail, setDetail] = useState<AssignmentUserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await fetchAssignmentUserDetail(userId);
      setDetail(data);
    } catch {
      setDetail(null);
      toast.current?.show({
        severity: "error",
        summary: t("assignments.loadError"),
        life: 4000,
      });
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setHeaderRowCount(null);
    return () => setHeaderRowCount(null);
  }, [setHeaderRowCount]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        <li>
          <button
            type="button"
            className="app-header-action-nav-item inline-flex items-center gap-1.5"
            onClick={() => navigate("/zuweisungen")}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t("assignments.backToHub")}
          </button>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [navigate, setHeaderActions, t]);

  return (
    <div className="app-assignments-user-page flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
      <Toast ref={toast} position="top-right" />
      {loading ? (
        <p className="m-0 px-4 pt-4 text-sm text-on-surface-variant">…</p>
      ) : !detail ? (
        <p className="m-0 px-4 pt-4 text-sm text-on-surface-variant">
          {t("assignments.loadError")}
        </p>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <h2 className="m-0 text-lg font-medium text-on-surface">
            {t("assignments.userDetailTitle", { login: detail.loginName })}
          </h2>
          <p className="m-0 text-sm text-on-surface-variant">{detail.name}</p>

          <section className="rounded-sm bg-surface-container-low p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="m-0 text-xs font-medium uppercase tracking-wider text-on-surface-variant">
                {t("assignments.userDetailMenu")}
              </h3>
              {detail.menu ? (
                <Button
                  type="button"
                  className="p-button-text p-button-sm"
                  label={t("assignments.userDetailChange")}
                  onClick={() =>
                    navigate(`/zuweisungen/menu/${detail.menu!.id}`)
                  }
                />
              ) : (
                <Button
                  type="button"
                  className="p-button-text p-button-sm"
                  label={t("assignments.assign")}
                  onClick={() => navigate("/zuweisungen/menu")}
                />
              )}
            </div>
            <p className="m-0 text-sm text-on-surface">
              {detail.menu
                ? `${detail.menu.key ?? ""} — ${detail.menu.name ?? ""}`
                : t("assignments.userDetailNone")}
            </p>
          </section>

          <section className="rounded-sm bg-surface-container-low p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="m-0 text-xs font-medium uppercase tracking-wider text-on-surface-variant">
                {t("assignments.userDetailTemplate")}
              </h3>
              {detail.permissionTemplate ? (
                <Button
                  type="button"
                  className="p-button-text p-button-sm"
                  label={t("assignments.userDetailChange")}
                  onClick={() =>
                    navigate(
                      `/zuweisungen/permission-template/${detail.permissionTemplate!.id}`,
                    )
                  }
                />
              ) : (
                <Button
                  type="button"
                  className="p-button-text p-button-sm"
                  label={t("assignments.assign")}
                  onClick={() => navigate("/zuweisungen/permission-template")}
                />
              )}
            </div>
            <p className="m-0 text-sm text-on-surface">
              {detail.permissionTemplate
                ? `${detail.permissionTemplate.key ?? ""} — ${detail.permissionTemplate.name ?? ""}`
                : t("assignments.userDetailNone")}
            </p>
          </section>

          <section className="rounded-sm bg-surface-container-low p-4">
            <h3 className="mb-3 m-0 text-xs font-medium uppercase tracking-wider text-on-surface-variant">
              {t("assignments.userDetailPresets")}
            </h3>
            {detail.searchPresets.length === 0 ? (
              <p className="m-0 text-sm text-on-surface-variant">
                {t("assignments.userDetailNone")}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {detail.searchPresets.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="text-sm text-on-surface">
                      {p.name}
                      <span className="ml-2 text-on-surface-variant">
                        ({p.ownerLoginName})
                      </span>
                    </span>
                    <Button
                      type="button"
                      className="p-button-text p-button-sm"
                      label={t("assignments.userDetailChange")}
                      onClick={() =>
                        navigate(`/zuweisungen/search-preset/${p.id}`)
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            <Button
              type="button"
              className="p-button-outlined p-button-sm mt-3"
              label={t("assignments.assign")}
              onClick={() => navigate("/zuweisungen/search-preset")}
            />
          </section>
        </div>
      )}
    </div>
  );
}
