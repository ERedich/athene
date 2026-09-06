import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type SyntheticEvent,
} from "react";
import {
  ArrowLeft,
  ExternalLink,
  Save,
  UserPlus,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Navigate,
  useNavigate,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { ConfirmDialog, confirmDialog } from "primereact/confirmdialog";
import { ContextMenu } from "primereact/contextmenu";
import { DataTable } from "primereact/datatable";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { Toast } from "primereact/toast";
import type { MenuItem } from "primereact/menuitem";

import { AppDialog } from "../components/AppDialog";
import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import { useNavLayout } from "../layout/NavLayoutContext";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import { apiFetch } from "../lib/api";
import {
  fetchAssignmentDirectory,
  fetchAssignmentRecordUsers,
  fetchAssignmentRecords,
  putAssignment,
} from "../lib/assignmentsApi";
import {
  isEnabledAssignmentType,
  isExclusiveAssignmentType,
  type AssignmentConflict,
  type AssignmentDirectoryUser,
  type AssignmentRecord,
} from "../lib/assignmentTypes";
import { overlayAppendTo } from "../lib/overlayAppendTo";
import { usePermission } from "../lib/usePermission";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../lib/siteColor";

type WorkspaceView = "record" | "user";
type WizardTargetMode = "users" | "site" | "workgroup" | "all";

type SiteOption = { id: string; key: string; name: string; colorHex: string };
type WorkgroupOption = { id: string; key: string; name: string };

export function AssignmentsTypePage() {
  const { t } = useTranslation();
  const { type, recordId: routeRecordId } = useParams();
  const navigate = useNavigate();
  const { refresh: refreshNav } = useNavLayout();
  const canManagePermissions = usePermission("permissions.manage");
  const { setHeaderActions, setHeaderRowCount } =
    useOutletContext<AppShellOutletContext>();
  const toast = useRef<Toast>(null);
  const cm = useRef<ContextMenu>(null);
  const selectedRecordRef = useRef<AssignmentRecord | null>(null);
  const assignCheckedRef = useRef<(mode: "set" | "add" | "remove") => void>(
    () => undefined,
  );

  const [view, setView] = useState<WorkspaceView>("record");
  const [search, setSearch] = useState("");
  const [records, setRecords] = useState<AssignmentRecord[]>([]);
  const [users, setUsers] = useState<AssignmentDirectoryUser[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [workgroups, setWorkgroups] = useState<WorkgroupOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<AssignmentRecord | null>(
    null,
  );
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [conflicts, setConflicts] = useState<AssignmentConflict[]>([]);
  const [checkedUserIds, setCheckedUserIds] = useState<string[]>([]);
  /** Bumps so DataTable remounts; avoids stale checkbox bodies after controlled updates. */
  const [userTableEpoch, setUserTableEpoch] = useState(0);
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [workgroupFilter, setWorkgroupFilter] = useState<string | null>(null);
  const [workgroupMemberIds, setWorkgroupMemberIds] = useState<Set<string>>(
    new Set(),
  );
  const [saving, setSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardRecordId, setWizardRecordId] = useState<string | null>(null);
  const [wizardTargetMode, setWizardTargetMode] =
    useState<WizardTargetMode>("users");
  const [wizardUserIds, setWizardUserIds] = useState<string[]>([]);
  const [wizardSiteId, setWizardSiteId] = useState<string | null>(null);
  const [wizardWorkgroupId, setWizardWorkgroupId] = useState<string | null>(
    null,
  );

  const typeOk = isEnabledAssignmentType(type);
  const assignmentType = typeOk ? type : "menu";
  const canMutateAssignments =
    assignmentType !== "permission-template" || canManagePermissions;
  const exclusiveType = isExclusiveAssignmentType(assignmentType);

  const loadBase = useCallback(async () => {
    if (!typeOk) return;
    setLoading(true);
    try {
      const [recs, dirs, sitesRes, wgRes] = await Promise.all([
        fetchAssignmentRecords(assignmentType),
        fetchAssignmentDirectory(),
        apiFetch("/api/sites"),
        apiFetch("/api/workgroups"),
      ]);
      setRecords(recs);
      setUsers(dirs);
      if (sitesRes.ok) {
        const data = (await sitesRes.json()) as SiteOption[];
        setSites(Array.isArray(data) ? data : []);
      }
      if (wgRes.ok) {
        const data = (await wgRes.json()) as Array<{
          id: string;
          key: string;
          name: string;
          employeeIds?: string[];
        }>;
        setWorkgroups(
          Array.isArray(data)
            ? data.map((w) => ({ id: w.id, key: w.key, name: w.name }))
            : [],
        );
      }
    } catch {
      toast.current?.show({
        severity: "error",
        summary: t("assignments.loadError"),
        life: 4000,
      });
      setRecords([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [assignmentType, t, typeOk]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!routeRecordId || records.length === 0) return;
    const found = records.find((r) => r.id === routeRecordId) ?? null;
    setSelectedRecord(found);
  }, [routeRecordId, records]);

  const loadRecordUsers = useCallback(
    async (record: AssignmentRecord | null) => {
      if (!record) {
        setAssignedIds(new Set());
        setConflicts([]);
        setCheckedUserIds([]);
        setUserTableEpoch((e) => e + 1);
        return;
      }
      try {
        const data = await fetchAssignmentRecordUsers(assignmentType, record.id);
        setAssignedIds(new Set(data.assignedUserIds));
        setConflicts(data.conflicts);
        setCheckedUserIds(data.assignedUserIds);
        setUserTableEpoch((e) => e + 1);
      } catch {
        setAssignedIds(new Set());
        setConflicts([]);
        setCheckedUserIds([]);
        setUserTableEpoch((e) => e + 1);
      }
    },
    [assignmentType],
  );

  useEffect(() => {
    void loadRecordUsers(selectedRecord);
  }, [loadRecordUsers, selectedRecord]);

  useEffect(() => {
    if (!workgroupFilter) {
      setWorkgroupMemberIds(new Set());
      return;
    }
    void apiFetch("/api/workgroups")
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as Array<{
          id: string;
          employeeIds?: string[];
        }>;
        const wg = data.find((w) => w.id === workgroupFilter);
        setWorkgroupMemberIds(new Set(wg?.employeeIds ?? []));
      })
      .catch(() => setWorkgroupMemberIds(new Set()));
  }, [workgroupFilter]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || view !== "record") return records;
    return records.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        (r.ownerLoginName ?? "").toLowerCase().includes(q),
    );
  }, [records, search, view]);

  const conflictByUser = useMemo(() => {
    const m = new Map<string, AssignmentConflict>();
    for (const c of conflicts) m.set(c.userId, c);
    return m;
  }, [conflicts]);

  const filteredUsers = useMemo(() => {
    let list = users;
    if (siteFilter) {
      list = list.filter((u) => u.workingSiteId === siteFilter);
    }
    if (workgroupFilter) {
      list = list.filter(
        (u) => u.employeeId != null && workgroupMemberIds.has(u.employeeId),
      );
    }
    const q = search.trim().toLowerCase();
    if (q && view === "user") {
      list = list.filter(
        (u) =>
          u.loginName.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q),
      );
    } else if (q && view === "record") {
      list = list.filter(
        (u) =>
          u.loginName.toLowerCase().includes(q) ||
          u.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [users, siteFilter, workgroupFilter, workgroupMemberIds, search, view]);

  useEffect(() => {
    setHeaderRowCount(
      view === "record" ? filteredRecords.length : filteredUsers.length,
    );
    return () => setHeaderRowCount(null);
  }, [filteredRecords.length, filteredUsers.length, setHeaderRowCount, view]);

  const runAssign = useCallback(
    async (
      record: AssignmentRecord,
      mode: "set" | "add" | "remove",
      payload:
        | { userIds: string[] }
        | { siteId: string }
        | { workgroupId: string }
        | { all: true },
    ) => {
      setSaving(true);
      try {
        const result = await putAssignment(assignmentType, record.id, {
          mode,
          ...payload,
        });
        toast.current?.show({
          severity: "success",
          summary:
            mode === "remove"
              ? t("assignments.removeSuccess")
              : t("assignments.assignSuccess"),
          life: 3000,
        });
        if (result.skippedWithoutEmployee > 0) {
          toast.current?.show({
            severity: "warn",
            summary: t("assignments.skippedWithoutEmployee", {
              count: result.skippedWithoutEmployee,
            }),
            life: 5000,
          });
        }
        if (result.selfAffected) {
          await refreshNav();
        }
        await loadBase();
        await loadRecordUsers(record);
      } catch {
        toast.current?.show({
          severity: "error",
          summary: t("assignments.assignError"),
          life: 5000,
        });
      } finally {
        setSaving(false);
      }
    },
    [assignmentType, loadBase, loadRecordUsers, refreshNav, t],
  );

  const assignChecked = useCallback(
    (mode: "set" | "add" | "remove") => {
      if (!selectedRecord || checkedUserIds.length === 0) return;
      if (!canMutateAssignments) {
        toast.current?.show({
          severity: "warn",
          summary: t("assignments.needPermissionsManage"),
          life: 4000,
        });
        return;
      }

      const doRun = () => {
        void runAssign(selectedRecord, mode, { userIds: checkedUserIds });
      };

      if (
        isExclusiveAssignmentType(assignmentType) &&
        mode !== "remove" &&
        checkedUserIds.some((id) => conflictByUser.has(id) && !assignedIds.has(id))
      ) {
        const count = checkedUserIds.filter(
          (id) => conflictByUser.has(id) && !assignedIds.has(id),
        ).length;
        confirmDialog({
          header: t("assignments.replaceConfirmTitle"),
          message: t(
            assignmentType === "permission-template"
              ? "assignments.replaceConfirmTemplate"
              : "assignments.replaceConfirm",
            { count },
          ),
          acceptLabel: t("assignments.assign"),
          rejectLabel: t("assignments.wizardCancel"),
          accept: doRun,
        });
        return;
      }
      doRun();
    },
    [
      assignedIds,
      assignmentType,
      canMutateAssignments,
      checkedUserIds,
      conflictByUser,
      runAssign,
      selectedRecord,
      t,
    ],
  );

  selectedRecordRef.current = selectedRecord;
  assignCheckedRef.current = assignChecked;

  const openSource = useCallback(
    (record: AssignmentRecord) => {
      if (assignmentType === "menu") {
        navigate(`/customize-menu/${record.id}`);
      } else if (assignmentType === "permission-template") {
        navigate("/berechtigungswesen");
      } else {
        navigate("/suchkonfig");
      }
    },
    [assignmentType, navigate],
  );

  const contextItems = useMemo((): MenuItem[] => {
    if (!selectedRecord) return [];
    return [
      {
        label: t("assignments.assign"),
        icon: <UserPlus className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !canMutateAssignments,
        command: () => {
          if (!canMutateAssignments) return;
          setWizardRecordId(selectedRecord.id);
          setWizardOpen(true);
        },
      },
      {
        label: t("assignments.openSource"),
        icon: <ExternalLink className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        command: () => openSource(selectedRecord),
      },
    ];
  }, [canMutateAssignments, openSource, selectedRecord, t]);

  const siteOptions = useMemo(
    () =>
      sites.map((s) => ({
        label: `${s.key} — ${s.name}`,
        value: s.id,
      })),
    [sites],
  );

  const workgroupOptions = useMemo(
    () =>
      workgroups.map((w) => ({
        label: `${w.key} — ${w.name}`,
        value: w.id,
      })),
    [workgroups],
  );

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
        <li>
          <button
            type="button"
            className="app-header-action-nav-item inline-flex items-center gap-1.5 hover:bg-green-500/10 hover:text-green-500"
            disabled={!canMutateAssignments}
            title={
              !canMutateAssignments
                ? t("assignments.needPermissionsManage")
                : undefined
            }
            onClick={() =>
              assignCheckedRef.current(exclusiveType ? "set" : "add")
            }
          >
            <Save className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t("assignments.save")}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={`app-header-action-nav-item${view === "record" ? " app-header-action-nav-item--active" : ""}`}
            onClick={() => setView("record")}
          >
            {t("assignments.viewByRecord")}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={`app-header-action-nav-item${view === "user" ? " app-header-action-nav-item--active" : ""}`}
            onClick={() => setView("user")}
          >
            {t("assignments.viewByUser")}
          </button>
        </li>
        <li>
          <button
            type="button"
            className="app-header-action-nav-item inline-flex items-center gap-1.5"
            disabled={!canMutateAssignments}
            title={
              !canMutateAssignments
                ? t("assignments.needPermissionsManage")
                : undefined
            }
            onClick={() => {
              setWizardRecordId(selectedRecordRef.current?.id ?? null);
              setWizardOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {t("assignments.assign")}
          </button>
        </li>
        {view === "record" ? (
          <li className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
            <Dropdown
              aria-label={t("assignments.filterSite")}
              value={siteFilter}
              options={siteOptions}
              optionLabel="label"
              optionValue="value"
              placeholder={t("assignments.filterSite")}
              showClear
              onChange={(e) => setSiteFilter((e.value as string | null) ?? null)}
              className="app-header-preset-dropdown app-inline-icon-dropdown h-9 w-44 shrink-0 text-sm"
              panelClassName="app-header-preset-dropdown-panel"
              appendTo={overlayAppendTo}
            />
            <Dropdown
              aria-label={t("assignments.filterWorkgroup")}
              value={workgroupFilter}
              options={workgroupOptions}
              optionLabel="label"
              optionValue="value"
              placeholder={t("assignments.filterWorkgroup")}
              showClear
              onChange={(e) =>
                setWorkgroupFilter((e.value as string | null) ?? null)
              }
              className="app-header-preset-dropdown app-inline-icon-dropdown h-9 w-44 shrink-0 text-sm"
              panelClassName="app-header-preset-dropdown-panel"
              appendTo={overlayAppendTo}
            />
            <button
              type="button"
              className="app-header-action-nav-item"
              disabled={!canMutateAssignments}
              title={
                !canMutateAssignments
                  ? t("assignments.needPermissionsManage")
                  : undefined
              }
              onClick={() => assignCheckedRef.current("remove")}
            >
              {t("assignments.removeSelection")}
            </button>
            <IconField iconPosition="left">
              <LucideInputSearchIcon />
              <InputText
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("assignments.searchRecords")}
                className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
                aria-label={t("assignments.searchRecords")}
              />
            </IconField>
          </li>
        ) : (
          <li className="ml-auto">
            <IconField iconPosition="left">
              <LucideInputSearchIcon />
              <InputText
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("assignments.searchUsers")}
                className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
                aria-label={t("assignments.searchUsers")}
              />
            </IconField>
          </li>
        )}
      </ul>,
    );
  }, [
    assignmentType,
    canMutateAssignments,
    exclusiveType,
    navigate,
    search,
    setHeaderActions,
    siteFilter,
    siteOptions,
    t,
    view,
    workgroupFilter,
    workgroupOptions,
  ]);

  useEffect(() => {
    return () => {
      setHeaderActions(null);
    };
  }, [setHeaderActions]);

  const userSelectOptions = useMemo(
    () =>
      users.map((u) => ({
        label: `${u.loginName} — ${u.name}`,
        value: u.id,
      })),
    [users],
  );

  const submitWizard = async (e: FormEvent) => {
    e.preventDefault();
    if (!canMutateAssignments) {
      toast.current?.show({
        severity: "warn",
        summary: t("assignments.needPermissionsManage"),
        life: 4000,
      });
      return;
    }
    const record =
      records.find((r) => r.id === wizardRecordId) ?? selectedRecord;
    if (!record) return;

    const mode = exclusiveType ? "set" : "add";
    let payload:
      | { userIds: string[] }
      | { siteId: string }
      | { workgroupId: string }
      | { all: true }
      | null = null;

    if (wizardTargetMode === "users") {
      if (wizardUserIds.length === 0) return;
      payload = { userIds: wizardUserIds };
    } else if (wizardTargetMode === "site" && wizardSiteId) {
      payload = { siteId: wizardSiteId };
    } else if (wizardTargetMode === "workgroup" && wizardWorkgroupId) {
      payload = { workgroupId: wizardWorkgroupId };
    } else if (wizardTargetMode === "all") {
      payload = { all: true };
    }
    if (!payload) return;

    const finish = async () => {
      await runAssign(record, mode, payload!);
      setWizardOpen(false);
      setSelectedRecord(record);
      navigate(`/zuweisungen/${assignmentType}/${record.id}`, { replace: true });
    };

    if (exclusiveType && wizardTargetMode === "users") {
      const conflictCount = wizardUserIds.filter((id) => {
        const c = conflictByUser.get(id);
        return c && c.currentRecordId !== record.id;
      }).length;
      if (conflictCount > 0) {
        confirmDialog({
          header: t("assignments.replaceConfirmTitle"),
          message: t(
            assignmentType === "permission-template"
              ? "assignments.replaceConfirmTemplate"
              : "assignments.replaceConfirm",
            { count: conflictCount },
          ),
          acceptLabel: t("assignments.assign"),
          rejectLabel: t("assignments.wizardCancel"),
          accept: () => void finish(),
        });
        return;
      }
    }
    await finish();
  };

  const siteBody = (row: AssignmentDirectoryUser) => (
    <span
      style={{
        color: readableSiteColor(row.workingSiteColorHex || DEFAULT_SITE_COLOR_HEX),
      }}
      title={`${row.workingSiteKey} - ${row.workingSiteName}`}
    >
      {row.workingSiteKey} — {row.workingSiteName}
    </span>
  );

  const stopCheckboxCellBubble = (e: SyntheticEvent) => {
    e.stopPropagation();
  };

  const filteredUserIdSet = useMemo(
    () => new Set(filteredUsers.map((u) => u.id)),
    [filteredUsers],
  );

  const headerCheckState = useMemo((): boolean | null => {
    if (filteredUsers.length === 0) return false;
    let checkedCount = 0;
    for (const u of filteredUsers) {
      if (checkedUserIds.includes(u.id)) checkedCount += 1;
    }
    if (checkedCount === 0) return false;
    if (checkedCount === filteredUsers.length) return true;
    return null;
  }, [checkedUserIds, filteredUsers]);

  const onHeaderCheckChange = (checked: boolean) => {
    setCheckedUserIds((prev) => {
      if (checked) {
        const next = new Set(prev);
        for (const id of filteredUserIdSet) next.add(id);
        return [...next];
      }
      return prev.filter((id) => !filteredUserIdSet.has(id));
    });
    setUserTableEpoch((epoch) => epoch + 1);
  };

  const userCheckHeader = (
    <div
      className="flex items-center"
      role="presentation"
      onClick={stopCheckboxCellBubble}
      onMouseDown={stopCheckboxCellBubble}
    >
      <Checkbox
        inputId="asg-user-check-all"
        checked={headerCheckState === true}
        className="rounded-none"
        onChange={(e) => onHeaderCheckChange(Boolean(e.checked))}
        disabled={!selectedRecord || filteredUsers.length === 0}
        aria-label={t("assignments.checkAllUsers")}
      />
    </div>
  );

  const userCheckBody = (row: AssignmentDirectoryUser) => {
    const checked = checkedUserIds.includes(row.id);
    const conflict = conflictByUser.get(row.id);
    const showConflict =
      assignmentType === "menu" &&
      conflict &&
      !assignedIds.has(row.id);
    return (
      <div
        className="flex flex-col gap-0.5"
        role="presentation"
        onClick={stopCheckboxCellBubble}
        onMouseDown={stopCheckboxCellBubble}
      >
        <Checkbox
          inputId={`asg-user-${row.id}`}
          checked={checked}
          className="rounded-none"
          onChange={(e) => {
            const on = Boolean(e.checked);
            setCheckedUserIds((prev) =>
              on ? [...new Set([...prev, row.id])] : prev.filter((id) => id !== row.id),
            );
            setUserTableEpoch((epoch) => epoch + 1);
          }}
          disabled={!selectedRecord}
        />
        {showConflict ? (
          <span className="text-on-surface-variant">
            {t("assignments.conflictHint", { name: conflict.currentName })}
          </span>
        ) : null}
      </div>
    );
  };

  if (!typeOk) {
    return <Navigate to="/zuweisungen" replace />;
  }

  return (
    <div className="app-assignments-workspace flex min-h-0 flex-1 flex-col gap-3">
      <Toast ref={toast} position="top-right" />
      <ConfirmDialog />
      <ContextMenu model={contextItems} ref={cm} appendTo={overlayAppendTo} />

      {view === "record" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:gap-0">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <DataTable
              className="app-data-table w-full"
              value={filteredRecords}
              loading={loading}
              dataKey="id"
              selectionMode="single"
              selection={selectedRecord}
              onSelectionChange={(e) => {
                setSelectedRecord(e.value as AssignmentRecord | null);
              }}
              onContextMenuSelectionChange={(e) => {
                const row = e.value as AssignmentRecord | null;
                if (row) setSelectedRecord(row);
              }}
              onContextMenu={(e) => cm.current?.show(e.originalEvent)}
              onRowDoubleClick={(e) => {
                const row = e.data as AssignmentRecord;
                setSelectedRecord(row);
                if (!canMutateAssignments) {
                  toast.current?.show({
                    severity: "warn",
                    summary: t("assignments.needPermissionsManage"),
                    life: 4000,
                  });
                  return;
                }
                setWizardRecordId(row.id);
                setWizardOpen(true);
              }}
              emptyMessage={t("assignments.emptyRecords")}
              scrollable
              scrollHeight="flex"
            >
              {exclusiveType ? (
                <Column field="key" header={t("assignments.columnKey")} sortable />
              ) : null}
              <Column field="name" header={t("assignments.columnName")} sortable />
              {assignmentType === "search-preset" ? (
                <Column
                  field="ownerLoginName"
                  header={t("assignments.columnOwner")}
                  sortable
                />
              ) : null}
              <Column
                field="assignedUserCount"
                header={t("assignments.columnUsers")}
                sortable
              />
            </DataTable>
          </div>

          <div className="app-assignments-workspace-divider" aria-hidden />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            <DataTable
              key={userTableEpoch}
              className="app-data-table w-full"
              value={filteredUsers}
              loading={loading}
              dataKey="id"
              emptyMessage={t("assignments.emptyUsers")}
              scrollable
              scrollHeight="flex"
            >
              <Column
                header={userCheckHeader}
                body={userCheckBody}
                style={{ width: "6rem" }}
              />
              <Column
                field="loginName"
                header={t("assignments.columnLogin")}
                sortable
              />
              <Column
                field="name"
                header={t("assignments.columnUserName")}
                sortable
              />
              <Column header={t("assignments.columnSite")} body={siteBody} />
            </DataTable>
          </div>
        </div>
      ) : (
        <DataTable
          className="app-data-table w-full"
          value={filteredUsers}
          loading={loading}
          dataKey="id"
          emptyMessage={t("assignments.emptyUsers")}
          scrollable
          scrollHeight="flex"
          onRowDoubleClick={(e) => {
            const row = e.data as AssignmentDirectoryUser;
            navigate(`/zuweisungen/user/${row.id}`);
          }}
        >
          <Column field="loginName" header={t("assignments.columnLogin")} sortable />
          <Column field="name" header={t("assignments.columnUserName")} sortable />
          <Column header={t("assignments.columnSite")} body={siteBody} />
          <Column
            header={t("assignments.columnCurrentMenu")}
            body={(row: AssignmentDirectoryUser) => row.menuConfigName ?? "—"}
          />
          <Column
            header={t("assignments.columnCurrentTemplate")}
            body={(row: AssignmentDirectoryUser) =>
              row.permissionTemplateName ?? "—"
            }
          />
          <Column
            field="searchPresetShareCount"
            header={t("assignments.columnPresetShares")}
            sortable
          />
          <Column
            header=""
            body={(row: AssignmentDirectoryUser) => (
              <Button
                type="button"
                className="p-button-text p-button-sm"
                icon={<Users className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                label={t("assignments.userDetailChange")}
                onClick={() => navigate(`/zuweisungen/user/${row.id}`)}
              />
            )}
          />
        </DataTable>
      )}

      <AppDialog
        visible={wizardOpen}
        onHide={() => !saving && setWizardOpen(false)}
        header={t("assignments.wizardTitle")}
        style={{ width: "min(32rem, 95vw)" }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label={t("assignments.wizardCancel")}
              className="p-button-text"
              disabled={saving}
              onClick={() => setWizardOpen(false)}
            />
            <Button
              type="submit"
              form="assignments-wizard-form"
              label={t("assignments.wizardApply")}
              loading={saving}
              disabled={!canMutateAssignments}
              title={
                !canMutateAssignments
                  ? t("assignments.needPermissionsManage")
                  : undefined
              }
            />
          </div>
        }
      >
        <form
          id="assignments-wizard-form"
          className="flex flex-col gap-3"
          onSubmit={(e) => void submitWizard(e)}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
              {t("assignments.wizardRecord")}
            </span>
            <Dropdown
              value={wizardRecordId}
              options={records.map((r) => ({
                label: exclusiveType ? `${r.key} — ${r.name}` : r.name,
                value: r.id,
              }))}
              onChange={(e) => setWizardRecordId(e.value as string)}
              className="w-full"
              appendTo={overlayAppendTo}
              placeholder={t("assignments.selectRecord")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
              {t("assignments.wizardTargets")}
            </span>
            <Dropdown
              value={wizardTargetMode}
              options={[
                { label: t("assignments.wizardTargetUsers"), value: "users" },
                { label: t("assignments.wizardTargetSite"), value: "site" },
                {
                  label: t("assignments.wizardTargetWorkgroup"),
                  value: "workgroup",
                },
                { label: t("assignments.wizardTargetAll"), value: "all" },
              ]}
              onChange={(e) =>
                setWizardTargetMode(e.value as WizardTargetMode)
              }
              className="w-full"
              appendTo={overlayAppendTo}
            />
          </div>
          {wizardTargetMode === "users" ? (
            <MultiSelect
              value={wizardUserIds}
              options={userSelectOptions}
              onChange={(e) => setWizardUserIds((e.value as string[]) ?? [])}
              optionLabel="label"
              optionValue="value"
              display="comma"
              filter
              className="w-full"
              appendTo={overlayAppendTo}
              placeholder={t("assignments.wizardTargetUsers")}
            />
          ) : null}
          {wizardTargetMode === "site" ? (
            <Dropdown
              value={wizardSiteId}
              options={sites.map((s) => ({
                label: `${s.key} — ${s.name}`,
                value: s.id,
              }))}
              onChange={(e) => setWizardSiteId(e.value as string)}
              className="w-full"
              appendTo={overlayAppendTo}
              placeholder={t("assignments.wizardTargetSite")}
            />
          ) : null}
          {wizardTargetMode === "workgroup" ? (
            <Dropdown
              value={wizardWorkgroupId}
              options={workgroups.map((w) => ({
                label: `${w.key} — ${w.name}`,
                value: w.id,
              }))}
              onChange={(e) => setWizardWorkgroupId(e.value as string)}
              className="w-full"
              appendTo={overlayAppendTo}
              placeholder={t("assignments.wizardTargetWorkgroup")}
            />
          ) : null}
        </form>
      </AppDialog>
    </div>
  );
}
