import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../lib/appParameterKeys";
import { apiFetch } from "../lib/api";
import type {
  WorkOrderReferenceAsset,
  WorkOrderReferenceClassification,
  WorkOrderReferenceCostCenter,
  WorkOrderReferenceEmployee,
  WorkOrderReferenceMaintenancePlan,
  WorkOrderReferenceOrderType,
  WorkOrderReferenceWorkgroup,
  WorkOrderSiteOption,
  WorkOrderUserDirectoryRow,
} from "../lib/workOrderTypes";

export type WorkOrderSearchReferenceSelectOption = { label: string; value: string };

type Options = {
  /** When false, call `reload()` manually (e.g. lazy load for dialog). Default true. */
  autoLoad?: boolean;
  /** When false, skip `GET /api/assets` (edit dialog uses SelItem lookup/picker). Default true. */
  includeAssets?: boolean;
};

/** Loads sites, assets, … for WorkOrderSearchPanel and the global edit dialog. */
export function useWorkOrderSearchReferenceData(options: Options = {}) {
  const { autoLoad = true, includeAssets = true } = options;
  const { t, i18n } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];

  const [loading, setLoading] = useState(autoLoad);
  const [loaded, setLoaded] = useState(false);
  const [sites, setSites] = useState<WorkOrderSiteOption[]>([]);
  const [assets, setAssets] = useState<WorkOrderReferenceAsset[]>([]);
  const [costCenters, setCostCenters] = useState<WorkOrderReferenceCostCenter[]>([]);
  const [classifications, setClassifications] = useState<WorkOrderReferenceClassification[]>([]);
  const [employees, setEmployees] = useState<WorkOrderReferenceEmployee[]>([]);
  const [workgroups, setWorkgroups] = useState<WorkOrderReferenceWorkgroup[]>([]);
  const [maintenancePlans, setMaintenancePlans] = useState<WorkOrderReferenceMaintenancePlan[]>([]);
  const [workOrderTypes, setWorkOrderTypes] = useState<WorkOrderReferenceOrderType[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<WorkOrderUserDirectoryRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        assetsRes,
        costCentersRes,
        classificationsRes,
        employeesRes,
        workgroupsRes,
        sitesRes,
        usersRes,
        maintenancePlansRes,
        workOrderTypesRes,
      ] = await Promise.all([
        includeAssets ? apiFetch("/api/assets") : Promise.resolve(null),
        apiFetch("/api/cost-centers"),
        apiFetch("/api/classifications"),
        apiFetch("/api/employees"),
        apiFetch("/api/workgroups"),
        apiFetch("/api/sites"),
        apiFetch("/api/users"),
        apiFetch("/api/maintenance-plans"),
        apiFetch("/api/work-order-types"),
      ]);
      if (
        (includeAssets && !assetsRes?.ok) ||
        !costCentersRes.ok ||
        !classificationsRes.ok ||
        !employeesRes.ok ||
        !workgroupsRes.ok ||
        !sitesRes.ok ||
        !usersRes.ok ||
        !maintenancePlansRes.ok ||
        !workOrderTypesRes.ok
      ) {
        throw new Error("load_ref");
      }
      const [
        assetsData,
        costCentersData,
        classificationsData,
        employeesData,
        workgroupsRaw,
        sitesData,
        usersData,
        maintenancePlansData,
        workOrderTypesData,
      ] = (await Promise.all([
        includeAssets && assetsRes ? assetsRes.json() : Promise.resolve([]),
        costCentersRes.json(),
        classificationsRes.json(),
        employeesRes.json(),
        workgroupsRes.json(),
        sitesRes.json(),
        usersRes.json(),
        maintenancePlansRes.json(),
        workOrderTypesRes.json(),
      ])) as [
        WorkOrderReferenceAsset[],
        WorkOrderReferenceCostCenter[],
        WorkOrderReferenceClassification[],
        WorkOrderReferenceEmployee[],
        WorkOrderReferenceWorkgroup[],
        WorkOrderSiteOption[],
        WorkOrderUserDirectoryRow[],
        WorkOrderReferenceMaintenancePlan[],
        WorkOrderReferenceOrderType[],
      ];

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
              leaderEmployeeIds: Array.isArray(wg.leaderEmployeeIds) ? wg.leaderEmployeeIds : [],
            }))
          : [],
      );
      setMaintenancePlans(
        Array.isArray(maintenancePlansData)
          ? maintenancePlansData.map((mp) => ({
              id: mp.id,
              key: mp.key,
              name: mp.name,
              siteId: mp.siteId,
            }))
          : [],
      );
      setWorkOrderTypes(
        Array.isArray(workOrderTypesData)
          ? workOrderTypesData.map((row) => ({
              id: row.id,
              key: row.key,
              name: row.name,
              siteId: row.siteId,
              isActive: Boolean(row.isActive),
              sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
            }))
          : [],
      );
      setLoaded(true);
    } catch {
      setAssets([]);
      setCostCenters([]);
      setClassifications([]);
      setEmployees([]);
      setWorkgroups([]);
      setMaintenancePlans([]);
      setWorkOrderTypes([]);
      setSites([]);
      setDirectoryUsers([]);
    } finally {
      setLoading(false);
    }
  }, [includeAssets]);

  useEffect(() => {
    if (autoLoad) void load();
  }, [autoLoad, load]);

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

  const searchMaintenancePlanOptions = useMemo(
    () =>
      maintenancePlans
        .filter((mp) => !siteFieldLocked || mp.siteId === user.workingSiteId)
        .map((mp) => ({ label: `${mp.key} - ${mp.name}`, value: mp.id })),
    [maintenancePlans, siteFieldLocked, user.workingSiteId],
  );

  const searchUserOptions = useMemo<WorkOrderSearchReferenceSelectOption[]>(
    () => directoryUsers.map((u) => ({ label: `${u.loginName} — ${u.name}`, value: u.id })),
    [directoryUsers],
  );

  const calendarDateFormat = i18n.language?.toLowerCase().startsWith("de") ? "dd.mm.yy" : "mm/dd/yy";

  const typeOrder = useMemo(() => {
    const byKey = new Map<string, WorkOrderReferenceOrderType>();
    for (const row of workOrderTypes) {
      if (!row.isActive) continue;
      if (siteFieldLocked && row.siteId !== user.workingSiteId) continue;
      const prev = byKey.get(row.key);
      if (!prev || row.sortOrder < prev.sortOrder) byKey.set(row.key, row);
    }
    return [...byKey.values()]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
      .map((row) => row.key);
  }, [siteFieldLocked, user.workingSiteId, workOrderTypes]);

  const typeLabel = useCallback(
    (code: string) => {
      const preferredSite = user.workingSiteId;
      const match =
        workOrderTypes.find((row) => row.key === code && row.siteId === preferredSite) ??
        workOrderTypes.find((row) => row.key === code);
      if (match) return match.name;
      const key = `workOrders.typeValues.${code}`;
      const translated = t(key);
      return translated === key ? code : translated;
    },
    [t, user.workingSiteId, workOrderTypes],
  );

  const statusLabel = useCallback((code: string) => t(`workOrders.statusValues.${code}`), [t]);

  return {
    loading,
    loaded,
    reload: load,
    assets,
    accessibleAssets,
    costCenters,
    classifications,
    employees,
    workgroups,
    maintenancePlans,
    workOrderTypes,
    sites,
    directoryUsers,
    searchSiteOptions,
    searchAssetOptions,
    searchCostCenterOptions,
    searchClassificationOptions,
    searchWorkgroupOptions,
    searchEmployeeOptions,
    searchMaintenancePlanOptions,
    searchUserOptions,
    calendarDateFormat,
    typeOrder,
    typeLabel,
    statusLabel,
  };
}
