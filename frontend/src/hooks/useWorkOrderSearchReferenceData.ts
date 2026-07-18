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
  WorkOrderReferenceWorkgroup,
  WorkOrderSiteOption,
  WorkOrderUserDirectoryRow,
} from "../lib/workOrderTypes";

export type WorkOrderSearchReferenceSelectOption = { label: string; value: string };

type Options = {
  /** When false, call `reload()` manually (e.g. lazy load for dialog). Default true. */
  autoLoad?: boolean;
};

/** Loads sites, assets, … for WorkOrderSearchPanel and the global edit dialog. */
export function useWorkOrderSearchReferenceData(options: Options = {}) {
  const { autoLoad = true } = options;
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
      ] = await Promise.all([
        apiFetch("/api/assets"),
        apiFetch("/api/cost-centers"),
        apiFetch("/api/classifications"),
        apiFetch("/api/employees"),
        apiFetch("/api/workgroups"),
        apiFetch("/api/sites"),
        apiFetch("/api/users"),
        apiFetch("/api/maintenance-plans"),
      ]);
      if (
        !assetsRes.ok ||
        !costCentersRes.ok ||
        !classificationsRes.ok ||
        !employeesRes.ok ||
        !workgroupsRes.ok ||
        !sitesRes.ok ||
        !usersRes.ok ||
        !maintenancePlansRes.ok
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
      ] = (await Promise.all([
        assetsRes.json(),
        costCentersRes.json(),
        classificationsRes.json(),
        employeesRes.json(),
        workgroupsRes.json(),
        sitesRes.json(),
        usersRes.json(),
        maintenancePlansRes.json(),
      ])) as [
        WorkOrderReferenceAsset[],
        WorkOrderReferenceCostCenter[],
        WorkOrderReferenceClassification[],
        WorkOrderReferenceEmployee[],
        WorkOrderReferenceWorkgroup[],
        WorkOrderSiteOption[],
        WorkOrderUserDirectoryRow[],
        WorkOrderReferenceMaintenancePlan[],
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
      setLoaded(true);
    } catch {
      setAssets([]);
      setCostCenters([]);
      setClassifications([]);
      setEmployees([]);
      setWorkgroups([]);
      setMaintenancePlans([]);
      setSites([]);
      setDirectoryUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const typeOrder = useMemo(() => ["maintenance", "repair", "breakdown"] as const, []);
  const typeLabel = useCallback((code: string) => t(`workOrders.typeValues.${code}`), [t]);
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
