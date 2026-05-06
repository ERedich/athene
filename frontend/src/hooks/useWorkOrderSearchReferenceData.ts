import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";

type Asset = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  costCenterId: string | null;
};

type CostCenter = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

type ClassificationListRow = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  appliesToAsset: boolean;
  appliesToWorkOrder: boolean;
};

type Employee = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
};

type Workgroup = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  employeeIds: string[];
};

type SiteOption = { id: string; key: string; name: string };

type UserDirectoryRow = { id: string; loginName: string; name: string };

export type WorkOrderSearchReferenceSelectOption = { label: string; value: string };

/** Loads sites, assets, … for WorkOrderSearchPanel (Suchkonfig / shared filters). */
export function useWorkOrderSearchReferenceData() {
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];

  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [classifications, setClassifications] = useState<ClassificationListRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [workgroups, setWorkgroups] = useState<Workgroup[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<UserDirectoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, costCentersRes, classificationsRes, employeesRes, workgroupsRes, sitesRes, usersRes] = await Promise.all([
        apiFetch("/api/assets"),
        apiFetch("/api/cost-centers"),
        apiFetch("/api/classifications"),
        apiFetch("/api/employees"),
        apiFetch("/api/workgroups"),
        apiFetch("/api/sites"),
        apiFetch("/api/users"),
      ]);
      if (
        !assetsRes.ok ||
        !costCentersRes.ok ||
        !classificationsRes.ok ||
        !employeesRes.ok ||
        !workgroupsRes.ok ||
        !sitesRes.ok ||
        !usersRes.ok
      ) {
        throw new Error("load_ref");
      }
      const [assetsData, costCentersData, classificationsData, employeesData, workgroupsRaw, sitesData, usersData] =
        (await Promise.all([
          assetsRes.json(),
          costCentersRes.json(),
          classificationsRes.json(),
          employeesRes.json(),
          workgroupsRes.json(),
          sitesRes.json(),
          usersRes.json(),
        ])) as [Asset[], CostCenter[], ClassificationListRow[], Employee[], Workgroup[], SiteOption[], UserDirectoryRow[]];

      setAssets(Array.isArray(assetsData) ? assetsData : []);
      setCostCenters(Array.isArray(costCentersData) ? costCentersData : []);
      setClassifications(Array.isArray(classificationsData) ? classificationsData : []);
      setEmployees(Array.isArray(employeesData) ? employeesData : []);
      setSites(Array.isArray(sitesData) ? sitesData : []);
      setDirectoryUsers(
        Array.isArray(usersData)
          ? usersData.map((u) => ({ id: u.id, loginName: u.loginName, name: u.name }))
          : [],
      );
      setWorkgroups(
        Array.isArray(workgroupsRaw)
          ? workgroupsRaw.map((wg) => ({
              ...wg,
              employeeIds: Array.isArray(wg.employeeIds) ? wg.employeeIds : [],
            }))
          : [],
      );
    } catch {
      setAssets([]);
      setCostCenters([]);
      setClassifications([]);
      setEmployees([]);
      setWorkgroups([]);
      setSites([]);
      setDirectoryUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const accessibleAssets = useMemo(
    () => assets.filter((asset) => !siteFieldLocked || asset.siteId === user.workingSiteId),
    [assets, siteFieldLocked, user.workingSiteId],
  );

  const searchSiteOptions = useMemo(
    () =>
      sites
        .filter((s) => !siteFieldLocked || s.id === user.workingSiteId)
        .map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites, siteFieldLocked, user.workingSiteId],
  );

  const searchAssetOptions = useMemo(
    () => accessibleAssets.map((asset) => ({ label: `${asset.key} - ${asset.name}`, value: asset.id })),
    [accessibleAssets],
  );

  const searchCostCenterOptions = useMemo(
    () =>
      costCenters
        .filter((cc) => (!siteFieldLocked || cc.siteId === user.workingSiteId) && cc.isActive)
        .map((cc) => ({ label: `${cc.key} - ${cc.name}`, value: cc.id })),
    [costCenters, siteFieldLocked, user.workingSiteId],
  );

  const searchClassificationOptions = useMemo(
    () =>
      classifications
        .filter((cl) => (!siteFieldLocked || cl.siteId === user.workingSiteId) && cl.appliesToWorkOrder)
        .map((cl) => ({ label: `${cl.key} - ${cl.name}`, value: cl.id })),
    [classifications, siteFieldLocked, user.workingSiteId],
  );

  const searchWorkgroupOptions = useMemo(
    () =>
      workgroups
        .filter((w) => w.isActive && (!siteFieldLocked || w.siteId === user.workingSiteId))
        .map((w) => ({ label: `${w.key} - ${w.name}`, value: w.id })),
    [workgroups, siteFieldLocked, user.workingSiteId],
  );

  const searchEmployeeOptions = useMemo(
    () =>
      employees
        .filter((e) => e.isActive && (!siteFieldLocked || e.siteId === user.workingSiteId))
        .map((e) => ({ label: `${e.key} - ${e.name}`, value: e.id })),
    [employees, siteFieldLocked, user.workingSiteId],
  );

  const searchUserOptions = useMemo<WorkOrderSearchReferenceSelectOption[]>(
    () => directoryUsers.map((u) => ({ label: `${u.loginName} — ${u.name}`, value: u.id })),
    [directoryUsers],
  );

  const calendarDateFormat = i18n.language?.toLowerCase().startsWith("de") ? "dd.mm.yy" : "mm/dd/yy";

  const typeOrder = useMemo(() => ["maintenance", "repair", "breakdown"] as const, []);
  const typeLabel = useCallback((code: string) => t(`workOrders.typeValues.${code}`), [t]);
  const statusLabel = useCallback((code: string) => t(`workOrders.statusValues.${code}`), [t]);

  return {
    loading,
    reload: load,
    searchSiteOptions,
    searchAssetOptions,
    searchCostCenterOptions,
    searchClassificationOptions,
    searchWorkgroupOptions,
    searchEmployeeOptions,
    searchUserOptions,
    calendarDateFormat,
    typeOrder,
    typeLabel,
    statusLabel,
  };
}
