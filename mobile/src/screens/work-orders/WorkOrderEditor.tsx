import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ClipboardCheck, Sparkles } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SceneRendererProps, TabBar, TabView } from "react-native-tab-view";

import { useAuth } from "../../auth/AuthContext";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../lib/appParameterKeys";
import { resolveAssetDocumentUri, resolveWorkOrderDocumentUri } from "../../lib/documentLocalUri";
import { isImageMime, openNativeLocalDocument } from "../../lib/openNativeDocument";
import { AssetPicker } from "../../components/AssetPicker";
import { ClassificationPicker } from "../../components/ClassificationPicker";
import { CostCenterPicker } from "../../components/CostCenterPicker";
import { DateTimeField } from "../../components/DateTimeField";
import { useAtheneAssistant } from "../../assistant/AtheneAssistantContext";
import { FeedbackRemarkInput } from "../../components/FeedbackRemarkInput";
import { HapticPressable } from "../../components/HapticPressable";
import { MultiSelectModal } from "../../components/MultiSelectModal";
import { PcrOptionPicker } from "../../components/PcrOptionPicker";
import { SelectModal, type SelectItem } from "../../components/SelectModal";
import { WorkOrderChatFab } from "../../components/WorkOrderChatFab";
import { WorkOrderChatSheet } from "../../components/WorkOrderChatSheet";
import {
  WorkOrderActionError,
  deleteWorkOrderDocument,
  postWorkOrderFeedback,
  postWorkOrderStart,
  type WorkOrderFeedbackBody,
  patchAssetDocument,
  patchWorkOrderDocument,
  postWorkOrder,
  putWorkOrder,
  fetchWorkOrderById,
  queryKeys,
  uploadWorkOrderDocument,
  useAssetsQuery,
  useClassificationsQuery,
  useCostCentersQuery,
  useWorkOrderTypesQuery,
  useWorkOrderDocumentsQuery,
  useWorkOrderAssignmentsQuery,
  useWorkOrderFeedbackQuery,
  useWorkgroupsQuery,
  useEmployeesQuery,
  useWorkOrdersQuery,
  type WorkOrderSaveBody,
} from "../../hooks/queries";
import type { TransactionRow, WorkOrderAssignmentRow, WorkOrderDocumentCategory, WorkOrderDocumentRow, WorkOrderType } from "../../types/api";
import { canFeedbackWorkOrder, canPauseWorkOrder, canStartWorkOrder } from "../../lib/workOrderLifecycle";
import { workOrderPlaybackIconColor } from "../../lib/workOrderPlaybackUi";
import {
  computeSegmentHours,
  feedbackStatusActionForEntryMode,
  type FeedbackEntryMode,
  type FeedbackStatusAction,
} from "../../lib/workOrderFeedback";
import {
  fetchPcrCauses,
  fetchPcrProblems,
  fetchPcrRemedies,
  fetchSitePcrOrderTypeKeys,
  isPcrEnabledForOrderType,
  type PcrSelectOption,
} from "../../lib/workOrderPcr";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  PRESSED_OPACITY_ROW,
  PRESSED_OPACITY_STRONG,
  surfaceRippleColor,
} from "../../styles/pressableFeedback";
import { useAppTheme } from "../../theme/AppThemeContext";

type Props = {
  orderId?: string;
};

type TabId = "general" | "documents" | "assignments" | "feedback";
type TabRoute = { key: TabId; title: string };
type PendingDoc = {
  localId: string;
  uri: string;
  name: string;
  mimeType: string;
  displayName: string;
  category: WorkOrderDocumentCategory;
  size?: number;
  addedAt: number;
};
type TodoFormItem = { localId: string; text: string };
type DescriptionViewMode = "text" | "instructions";

function newTodoFormItem(text = ""): TodoFormItem {
  return {
    localId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    text,
  };
}

function todosFromRecords(records: WorkOrderRow["todos"]): TodoFormItem[] {
  return (records ?? []).map((record) => ({ localId: record.id, text: record.text }));
}

function todosToPayload(items: TodoFormItem[]): { text: string }[] {
  return items
    .map((item) => item.text.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((text) => ({ text }));
}

type FormState = {
  orderNumber: number | null;
  name: string;
  description: string;
  todos: TodoFormItem[];
  assetId: string;
  costCenterId: string;
  classificationId: string;
  workgroupId: string;
  responsibleEmployeeIds: string[];
  plannedStart: Date;
  plannedEnd: Date | null;
  plannedDurationHours: string;
  orderType: WorkOrderType;
};

const PENDING_AUTO_UPLOAD_MS = 5000;
const DOC_CATEGORIES: WorkOrderDocumentCategory[] = [
  "general",
  "protocols",
  "drawings",
  "instructions",
  "nameplates",
  "certificates",
];

function formatHoursForInput(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return "";
  const rounded = Math.round(hours * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function emptyForm(): FormState {
  const start = new Date();
  return {
    orderNumber: null as number | null,
    name: "",
    description: "",
    todos: [],
    assetId: "",
    costCenterId: "",
    classificationId: "",
    workgroupId: "",
    responsibleEmployeeIds: [],
    plannedStart: start,
    plannedEnd: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    plannedDurationHours: "24",
    orderType: "maintenance" as WorkOrderType,
  };
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function WorkOrderEditor({ orderId }: Props) {
  const isNew = !orderId;
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const insets = useSafeAreaInsets();
  const { user, permissions, appParameterBooleans, appParameterDefaultWorkgroupId } = useAuth();
  const athene = useAtheneAssistant();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const allowStart = permissions.includes("workOrder.start");
  const allowPause = permissions.includes("workOrder.pause");
  const allowFeedback = permissions.includes("workOrder.feedback");

  const { data: orders = [], isLoading: ordersLoading } = useWorkOrdersQuery();
  const { data: assets = [], isLoading: assetsLoading } = useAssetsQuery();
  const { data: costCenters = [], isLoading: ccLoading } = useCostCentersQuery();
  const { data: workOrderTypes = [] } = useWorkOrderTypesQuery();
  const { data: classifications = [], isLoading: clfLoading } = useClassificationsQuery();
  const { data: workgroups = [], isLoading: wgLoading } = useWorkgroupsQuery();
  const { data: employees = [] } = useEmployeesQuery();

  const row = useMemo(() => (orderId ? orders.find((o) => o.id === orderId) : undefined), [orderId, orders]);
  const [tabIndex, setTabIndex] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [descriptionView, setDescriptionView] = useState<DescriptionViewMode>("text");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const [workgroupModal, setWorkgroupModal] = useState(false);
  const [responsibleModal, setResponsibleModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [docSearchTerm, setDocSearchTerm] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingDoc[]>([]);
  const [uploadingById, setUploadingById] = useState<Record<string, boolean>>({});
  const timersRef = useRef(new Map<string, number>());
  const prevCreateAssetIdForDefaultWgRef = useRef<string | null>(null);
  const [docEdit, setDocEdit] = useState<WorkOrderDocumentRow | null>(null);
  const [docEditDisplayName, setDocEditDisplayName] = useState("");
  const [docEditCategory, setDocEditCategory] = useState<WorkOrderDocumentCategory>("general");
  const [docEditSaving, setDocEditSaving] = useState(false);
  const [effectiveOrderId, setEffectiveOrderId] = useState<string | null>(orderId ?? null);
  const [feedbackHours, setFeedbackHours] = useState("");
  const [feedbackRemark, setFeedbackRemark] = useState("");
  const [feedbackPauseRemark, setFeedbackPauseRemark] = useState("");
  const [feedbackStatusAction, setFeedbackStatusAction] = useState<FeedbackStatusAction>("none");
  const [feedbackEntryMode, setFeedbackEntryMode] = useState<FeedbackEntryMode>("create");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [pcrOrderTypeKeys, setPcrOrderTypeKeys] = useState<string[]>([]);
  const [pcrProblemId, setPcrProblemId] = useState<string | null>(null);
  const [pcrCauseId, setPcrCauseId] = useState<string | null>(null);
  const [pcrRemedyId, setPcrRemedyId] = useState<string | null>(null);
  const [pcrProblemOptions, setPcrProblemOptions] = useState<PcrSelectOption[]>([]);
  const [pcrCauseOptions, setPcrCauseOptions] = useState<PcrSelectOption[]>([]);
  const [pcrRemedyOptions, setPcrRemedyOptions] = useState<PcrSelectOption[]>([]);
  const [showRequiredHints, setShowRequiredHints] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);

  const { data: documents = [], isLoading: docsLoading, refetch: refetchDocs } = useWorkOrderDocumentsQuery(effectiveOrderId);
  const { data: assignments = [], isLoading: assignmentsLoading } = useWorkOrderAssignmentsQuery(effectiveOrderId);
  const { data: feedbackRows = [], isLoading: feedbackRowsLoading } = useWorkOrderFeedbackQuery(effectiveOrderId);

  const currentOrder = useMemo(
    () => (effectiveOrderId ? orders.find((o) => o.id === effectiveOrderId) ?? null : null),
    [effectiveOrderId, orders],
  );

  const pcrEnabled = currentOrder
    ? isPcrEnabledForOrderType(pcrOrderTypeKeys, currentOrder.orderType)
    : false;
  const pcrRequired = pcrEnabled && feedbackStatusAction === "end";

  useEffect(() => {
    if (!currentOrder?.siteId) {
      setPcrOrderTypeKeys([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const keys = await fetchSitePcrOrderTypeKeys(currentOrder.siteId);
        if (!cancelled) setPcrOrderTypeKeys(keys);
      } catch {
        if (!cancelled) setPcrOrderTypeKeys(["breakdown"]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentOrder?.siteId]);

  useEffect(() => {
    if (!currentOrder) return;
    setPcrProblemId(currentOrder.problemId ?? null);
    setPcrCauseId(currentOrder.causeId ?? null);
    setPcrRemedyId(currentOrder.remedyId ?? null);
  }, [currentOrder?.id, currentOrder?.problemId, currentOrder?.causeId, currentOrder?.remedyId]);

  useEffect(() => {
    if (!currentOrder?.siteId || !pcrEnabled) {
      setPcrProblemOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const opts = await fetchPcrProblems({
          siteId: currentOrder.siteId,
          classificationId: currentOrder.assetClassificationId ?? null,
        });
        if (!cancelled) setPcrProblemOptions(opts);
      } catch {
        if (!cancelled) setPcrProblemOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentOrder?.siteId, currentOrder?.assetClassificationId, pcrEnabled]);

  useEffect(() => {
    if (!pcrProblemId) {
      setPcrCauseOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const opts = await fetchPcrCauses(pcrProblemId);
        if (!cancelled) setPcrCauseOptions(opts);
      } catch {
        if (!cancelled) setPcrCauseOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pcrProblemId]);

  useEffect(() => {
    if (!pcrCauseId) {
      setPcrRemedyOptions([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const opts = await fetchPcrRemedies(pcrCauseId);
        if (!cancelled) setPcrRemedyOptions(opts);
      } catch {
        if (!cancelled) setPcrRemedyOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pcrCauseId]);

  const documentsTabCount = documents.length + pendingFiles.length;
  const assignmentsTabCount = assignments.length;
  const feedbackTabCount = Number(
    Boolean(
      feedbackHours.trim() ||
        feedbackRemark.trim() ||
        feedbackPauseRemark.trim() ||
        feedbackStatusAction !== "none",
    ),
  );
  const tabRoutes = useMemo<TabRoute[]>(
    () => [
      { key: "general", title: t("workOrders.tabGeneral") },
      { key: "documents", title: `${t("workOrders.tabDocuments")} [${documentsTabCount}]` },
      { key: "assignments", title: `${t("workOrders.tabAssignments")} [${assignmentsTabCount}]` },
      { key: "feedback", title: `${t("workOrders.tabFeedback")} [${feedbackTabCount}]` },
    ],
    [assignmentsTabCount, documentsTabCount, feedbackTabCount, t],
  );

  const startOrder = useCallback(async () => {
    if (!currentOrder || !canStartWorkOrder(currentOrder.status)) return;
    try {
      await postWorkOrderStart(currentOrder.id);
      await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
    } catch (err) {
      const code = err instanceof WorkOrderActionError ? err.code : "unknown";
      const msg = code === "cannot_start_from_status" ? t("workOrders.cannotStartFromStatus") : t("workOrders.startError");
      Alert.alert("", msg);
    }
  }, [currentOrder, qc, t]);

  const openFeedbackWithMode = useCallback(
    (mode: FeedbackEntryMode) => {
      if (!currentOrder || !canFeedbackWorkOrder(currentOrder.status)) return;
      setFeedbackEntryMode(mode);
      setFeedbackStatusAction(feedbackStatusActionForEntryMode(mode));
      setFeedbackPauseRemark("");
      setFeedbackRemark("");
      setFeedbackHours(computeSegmentHours(currentOrder.currentSegmentStartedAt));
      setTabIndex(tabRoutes.findIndex((r) => r.key === "feedback"));
    },
    [currentOrder, tabRoutes],
  );

  const submitFeedback = useCallback(
    async (body: WorkOrderFeedbackBody) => {
      const targetOrderId = effectiveOrderId ?? orderId ?? null;
      if (!targetOrderId) {
        Alert.alert("", t("workOrders.assignmentsAfterSave"));
        return false;
      }
      setFeedbackSaving(true);
      try {
        await postWorkOrderFeedback(targetOrderId, body);
        await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
        await qc.invalidateQueries({ queryKey: queryKeys.workOrderDocuments(targetOrderId) });
        await qc.invalidateQueries({ queryKey: queryKeys.workOrderAssignments(targetOrderId) });
        await qc.invalidateQueries({ queryKey: queryKeys.workOrderFeedback(targetOrderId) });
        await qc.refetchQueries({ queryKey: queryKeys.workOrders, type: "all" });
        await qc.refetchQueries({ queryKey: queryKeys.workOrderDocuments(targetOrderId), type: "all" });
        await qc.refetchQueries({ queryKey: queryKeys.workOrderAssignments(targetOrderId), type: "all" });
        await qc.refetchQueries({ queryKey: queryKeys.workOrderFeedback(targetOrderId), type: "all" });
        if (body.statusAction === "end" || body.completeOrder) {
          router.replace("/work-orders");
        }
        Alert.alert("", t("workOrders.feedbackSaved"));
        return true;
      } catch (err) {
        const code = err instanceof WorkOrderActionError ? err.code : "unknown";
        const msg =
          code === "cannot_feedback_from_status"
            ? t("workOrders.cannotFeedbackFromStatus")
            : code === "pcr_required"
              ? t("workOrders.pcrRequired")
              : code === "invalid_body"
                ? t("workOrders.feedbackInvalidBody")
                : t("workOrders.feedbackSaveError");
        Alert.alert("", msg);
        return false;
      } finally {
        setFeedbackSaving(false);
      }
    },
    [effectiveOrderId, orderId, qc, router, t],
  );

  const onFeedbackTab = tabRoutes[tabIndex]?.key === "feedback";

  const openFeedbackAthene = useCallback(() => {
    if (!currentOrder) return;
    athene.openForFeedback({
      workOrderId: currentOrder.id,
      label: `#${currentOrder.orderNumber} - ${currentOrder.name}`,
      data: {
        orderNumber: currentOrder.orderNumber,
        name: currentOrder.name,
        status: currentOrder.status,
        siteId: currentOrder.siteId,
        siteKey: currentOrder.siteKey,
        assetId: currentOrder.assetId,
        assetKey: currentOrder.assetKey,
        assetName: currentOrder.assetName,
      },
      draftRemark: feedbackRemark,
      draftPauseRemark: feedbackPauseRemark,
      onApplyText: (field, text) => {
        if (field === "pauseRemark") setFeedbackPauseRemark(text);
        else setFeedbackRemark(text);
      },
    });
  }, [athene, currentOrder, feedbackPauseRemark, feedbackRemark]);

  useLayoutEffect(() => {
    if (!currentOrder) {
      navigation.setOptions({ headerRight: undefined });
      return () => navigation.setOptions({ headerRight: undefined });
    }
    navigation.setOptions({
      headerRight: () => {
        const canStart = allowStart && canStartWorkOrder(currentOrder.status);
        const canPause = allowPause && canPauseWorkOrder(currentOrder.status);
        const canStop = allowFeedback && canFeedbackWorkOrder(currentOrder.status);

        return (
        <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 8, gap: 2 }}>
          {onFeedbackTab ? (
            <HapticPressable
              onPress={openFeedbackAthene}
              disabled={athene.busy}
              {...androidRippleProps(ripple, true)}
              style={({ pressed }) => [
                { padding: 8 },
                { opacity: athene.busy ? 0.35 : pressed ? PRESSED_OPACITY_CONTROL : 1 },
              ]}
            >
              <Sparkles size={20} color={colors.primary} />
            </HapticPressable>
          ) : null}
          <HapticPressable
            onPress={() => void startOrder()}
            disabled={!canStart}
            {...androidRippleProps(ripple, true)}
            style={({ pressed }) => [
              { padding: 8 },
              {
                opacity: !canStart ? 1 : pressed ? PRESSED_OPACITY_CONTROL : 1,
              },
            ]}
          >
            <MaterialIcons name="play-arrow" size={22} color={workOrderPlaybackIconColor("start", canStart)} />
          </HapticPressable>
          <HapticPressable
            onPress={() => openFeedbackWithMode("stop")}
            disabled={!canStop}
            {...androidRippleProps(ripple, true)}
            style={({ pressed }) => [
              { padding: 8 },
              {
                opacity: !canStop ? 1 : pressed ? PRESSED_OPACITY_CONTROL : 1,
              },
            ]}
          >
            <MaterialIcons name="stop" size={22} color={workOrderPlaybackIconColor("stop", canStop)} />
          </HapticPressable>
          <HapticPressable
            onPress={() => openFeedbackWithMode("pause")}
            disabled={!canPause}
            {...androidRippleProps(ripple, true)}
            style={({ pressed }) => [
              { padding: 8 },
              {
                opacity: !canPause ? 1 : pressed ? PRESSED_OPACITY_CONTROL : 1,
              },
            ]}
          >
            <MaterialIcons name="pause" size={22} color={workOrderPlaybackIconColor("pause", canPause)} />
          </HapticPressable>
          <HapticPressable
            onPress={() => openFeedbackWithMode("create")}
            disabled={!canStop}
            {...androidRippleProps(ripple, true)}
            style={({ pressed }) => [
              { padding: 8 },
              {
                opacity: !canStop
                  ? 0.35
                  : pressed
                    ? PRESSED_OPACITY_CONTROL
                    : 1,
              },
            ]}
          >
            <ClipboardCheck size={20} color={colors.primary} />
          </HapticPressable>
        </View>
        );
      },
    });
    return () => navigation.setOptions({ headerRight: undefined });
  }, [
    allowFeedback,
    allowPause,
    allowStart,
    athene.busy,
    colors.primary,
    currentOrder,
    navigation,
    onFeedbackTab,
    openFeedbackAthene,
    openFeedbackWithMode,
    ripple,
    startOrder,
    tabRoutes,
  ]);

  useEffect(() => {
    if (isNew || !orderId || hydrated) return;
    void (async () => {
      try {
        const full = await fetchWorkOrderById(orderId);
        setForm({
          orderNumber: full.orderNumber,
          name: full.name,
          description: full.description ?? "",
          todos: todosFromRecords(full.todos),
          assetId: full.assetId,
          costCenterId: full.costCenterId,
          classificationId: full.classificationId ?? "",
          workgroupId: full.workgroupId ?? "",
          responsibleEmployeeIds: [...(full.responsibleEmployeeIds ?? [])],
          plannedStart: parseIso(full.plannedStart) ?? new Date(),
          plannedEnd: parseIso(full.plannedEnd),
          plannedDurationHours:
            full.plannedDurationMinutes == null
              ? ""
              : Number.isInteger(full.plannedDurationMinutes / 60)
                ? String(full.plannedDurationMinutes / 60)
                : (full.plannedDurationMinutes / 60).toFixed(2),
          orderType: full.orderType,
        });
        setDescriptionView(full.todos && full.todos.length > 0 ? "instructions" : "text");
        setHydrated(true);
      } catch {
        if (!row) return;
        setForm({
          orderNumber: row.orderNumber,
          name: row.name,
          description: row.description ?? "",
          todos: [],
          assetId: row.assetId,
          costCenterId: row.costCenterId,
          classificationId: row.classificationId ?? "",
          workgroupId: row.workgroupId ?? "",
          responsibleEmployeeIds: [...(row.responsibleEmployeeIds ?? [])],
          plannedStart: parseIso(row.plannedStart) ?? new Date(),
          plannedEnd: parseIso(row.plannedEnd),
          plannedDurationHours:
            row.plannedDurationMinutes == null
              ? ""
              : Number.isInteger(row.plannedDurationMinutes / 60)
                ? String(row.plannedDurationMinutes / 60)
                : (row.plannedDurationMinutes / 60).toFixed(2),
          orderType: row.orderType,
        });
        setHydrated(true);
      }
    })();
  }, [hydrated, isNew, orderId, row]);

  const accessibleAssets = useMemo(
    () => assets.filter((a) => !siteFieldLocked || (user ? a.siteId === user.workingSiteId : true)),
    [assets, siteFieldLocked, user],
  );
  const selectedAsset = useMemo(
    () => accessibleAssets.find((a) => a.id === form.assetId) ?? null,
    [accessibleAssets, form.assetId],
  );
  const selectableCostCenters = useMemo(
    () =>
      costCenters.filter(
        (cc) => selectedAsset?.siteId && cc.siteId === selectedAsset.siteId && (cc.isActive || cc.id === form.costCenterId),
      ),
    [costCenters, form.costCenterId, selectedAsset?.siteId],
  );

  const selectableClassifications = useMemo(
    () =>
      classifications.filter(
        (c) => selectedAsset?.siteId && c.siteId === selectedAsset.siteId && c.appliesToWorkOrder,
      ),
    [classifications, selectedAsset?.siteId],
  );

  useEffect(() => {
    if (!selectedAsset) return;
    if (selectableCostCenters.some((cc) => cc.id === form.costCenterId)) return;
    if (
      selectedAsset.costCenterId &&
      selectableCostCenters.some((cc) => cc.id === selectedAsset.costCenterId)
    ) {
      setForm((cur) => ({ ...cur, costCenterId: selectedAsset.costCenterId ?? "" }));
      return;
    }
    setForm((cur) => ({ ...cur, costCenterId: "" }));
  }, [form.costCenterId, selectableCostCenters, selectedAsset]);

  useEffect(() => {
    if (!form.classificationId) return;
    if (selectableClassifications.some((c) => c.id === form.classificationId)) return;
    setForm((cur) => ({ ...cur, classificationId: "" }));
  }, [form.classificationId, selectableClassifications]);

  const selectableWorkgroups = useMemo(
    () =>
      workgroups.filter(
        (wg) =>
          selectedAsset?.siteId &&
          wg.siteId === selectedAsset.siteId &&
          (wg.isActive || wg.id === form.workgroupId),
      ),
    [form.workgroupId, selectedAsset?.siteId, workgroups],
  );

  const workgroupItems: SelectItem[] = useMemo(
    () =>
      selectableWorkgroups.map((wg) => ({
        id: wg.id,
        label: `${wg.key} - ${wg.name}${wg.isActive ? "" : ` (${t("workOrders.workgroupInactive")})`}`,
      })),
    [selectableWorkgroups, t],
  );

  const selectedWorkgroupLabel = useMemo(() => {
    if (!form.workgroupId) return t("workOrders.workgroupPlaceholder");
    const wg = workgroups.find((w) => w.id === form.workgroupId);
    return wg ? `${wg.key} - ${wg.name}` : t("workOrders.workgroupPlaceholder");
  }, [form.workgroupId, t, workgroups]);

  const selectedWorkgroup = useMemo(
    () => workgroups.find((w) => w.id === form.workgroupId) ?? null,
    [form.workgroupId, workgroups],
  );

  const responsibleEmployeeItems = useMemo<SelectItem[]>(
    () =>
      (selectedWorkgroup?.leaderEmployeeIds ?? [])
        .map((id) => employees.find((emp) => emp.id === id))
        .filter((emp): emp is (typeof employees)[number] => Boolean(emp))
        .filter((emp) => emp.isActive || form.responsibleEmployeeIds.includes(emp.id))
        .map((emp) => ({ id: emp.id, label: `${emp.key} - ${emp.name}` })),
    [employees, form.responsibleEmployeeIds, selectedWorkgroup],
  );

  const selectedResponsibleLabel = useMemo(() => {
    if (form.responsibleEmployeeIds.length === 0) return t("workOrders.responsiblePlaceholder");
    const labels = form.responsibleEmployeeIds
      .map((id) => employees.find((emp) => emp.id === id))
      .filter(Boolean)
      .map((emp) => `${emp!.key} - ${emp!.name}`);
    return labels.length
      ? labels.join(", ")
      : t("workOrders.responsibleCount", { count: form.responsibleEmployeeIds.length });
  }, [employees, form.responsibleEmployeeIds, t]);

  useEffect(() => {
    if (!form.workgroupId) return;
    const allowed = new Set(selectedWorkgroup?.leaderEmployeeIds ?? []);
    const next = form.responsibleEmployeeIds.filter((id) => allowed.has(id));
    if (next.length === form.responsibleEmployeeIds.length && next.every((id, i) => id === form.responsibleEmployeeIds[i])) {
      return;
    }
    setForm((cur) => ({ ...cur, responsibleEmployeeIds: next }));
  }, [form.responsibleEmployeeIds, form.workgroupId, selectedWorkgroup]);

  useEffect(() => {
    if (!form.workgroupId || wgLoading || assetsLoading) return;
    const wg = workgroups.find((w) => w.id === form.workgroupId);
    if (!wg) {
      setForm((cur) => ({ ...cur, workgroupId: "" }));
      return;
    }
    if (!selectedAsset?.siteId) return;
    if (wg.siteId !== selectedAsset.siteId) {
      setForm((cur) => ({ ...cur, workgroupId: "" }));
    }
  }, [assetsLoading, form.workgroupId, selectedAsset?.siteId, wgLoading, workgroups]);

  useEffect(() => {
    if (!orderId) prevCreateAssetIdForDefaultWgRef.current = null;
  }, [orderId]);

  useEffect(() => {
    if (!isNew || !form.assetId) return;
    const aid = form.assetId;
    const prev = prevCreateAssetIdForDefaultWgRef.current;
    if (prev === aid) return;
    prevCreateAssetIdForDefaultWgRef.current = aid;
    if (!appParameterDefaultWorkgroupId) return;
    const asset = accessibleAssets.find((a) => a.id === aid);
    if (!asset) return;
    const defWg = workgroups.find((w) => w.id === appParameterDefaultWorkgroupId);
    if (!defWg || defWg.siteId !== asset.siteId) return;
    setForm((cur) => ({ ...cur, workgroupId: appParameterDefaultWorkgroupId }));
  }, [
    accessibleAssets,
    appParameterDefaultWorkgroupId,
    form.assetId,
    isNew,
    workgroups,
  ]);

  useEffect(() => () => {
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const typeItems: SelectItem[] = useMemo(() => {
    // User's Hauptbuchungskreis is the default site for new records.
    const siteId = selectedAsset?.siteId ?? user?.workingSiteId;
    if (!siteId) return [];
    return workOrderTypes
      .filter((row) => row.siteId === siteId)
      .filter((row) => row.isActive || row.key === form.orderType)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.key.localeCompare(b.key))
      .map((row) => ({
        id: row.key,
        label: row.isActive ? row.name : `${row.name} (${t("costCenters.inactive")})`,
      }));
  }, [form.orderType, selectedAsset?.siteId, t, user?.workingSiteId, workOrderTypes]);

  useEffect(() => {
    if (typeItems.length === 0) return;
    if (typeItems.some((item) => item.id === form.orderType)) return;
    const preferred =
      typeItems.find((item) => item.id === "maintenance")?.id ?? typeItems[0]?.id;
    if (!preferred) return;
    setForm((cur) => ({ ...cur, orderType: preferred }));
  }, [form.orderType, typeItems]);

  const filteredDocs = useMemo(() => {
    const q = docSearchTerm.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter((doc) =>
      [
        doc.displayName,
        doc.fileName,
        doc.mimeType,
        doc.createdBy,
        t(`workOrders.documentCategories.${doc.category}`),
        t(`workOrders.documentsSource.${doc.source}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [docSearchTerm, documents, t]);

  const filteredPending = useMemo(() => {
    const q = docSearchTerm.trim().toLowerCase();
    if (!q) return pendingFiles;
    return pendingFiles.filter((doc) =>
      [doc.displayName, doc.name, doc.mimeType, t(`workOrders.documentCategories.${doc.category}`)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [docSearchTerm, pendingFiles, t]);

  const requiredMissing = useMemo(
    () => ({
      name: !form.name.trim(),
      assetId: !form.assetId,
      costCenterId: !form.costCenterId,
      workgroupId: !form.workgroupId.trim(),
      responsibleEmployeeIds: form.responsibleEmployeeIds.length === 0,
    }),
    [form.assetId, form.costCenterId, form.name, form.responsibleEmployeeIds.length, form.workgroupId],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
        editorBody: { flex: 1, paddingHorizontal: 16, paddingTop: 16, backgroundColor: colors.background },
        tabScene: { paddingTop: 14 },
        assignmentsEmpty: { color: colors.onSurfaceVariant, paddingVertical: 8 },
        feedbackRow: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 10,
          marginTop: 8,
          backgroundColor: colors.surface,
        },
        feedbackRowTitle: { color: colors.onSurface, fontWeight: "600" },
        feedbackRowMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2 },
        assignmentRow: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 10,
          marginBottom: 8,
          backgroundColor: colors.surface,
        },
        assignmentTitle: { color: colors.onSurface, fontWeight: "600" },
        assignmentMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2 },
        label: { fontSize: 12, fontWeight: "600", marginBottom: 6, color: colors.outline },
        input: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 12,
          fontSize: 16,
          marginBottom: 14,
          backgroundColor: colors.inputBackground,
          color: colors.onSurface,
        },
        requiredInput: {
          borderColor: "#ef4444",
        },
        requiredWrap: {
          borderWidth: 1,
          borderColor: "#ef4444",
          borderRadius: 10,
          paddingHorizontal: 4,
          paddingTop: 4,
          marginBottom: 10,
        },
        description: { minHeight: 96, textAlignVertical: "top" },
        descriptionHeader: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 6,
        },
        segmentRow: { flexDirection: "row", borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.outline },
        segmentBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.surface },
        segmentBtnActive: { backgroundColor: colors.primaryContainer },
        segmentBtnText: { fontSize: 12, color: colors.onSurfaceVariant },
        segmentBtnTextActive: { color: colors.onSurface, fontWeight: "700" },
        todoBox: {
          borderWidth: 1,
          borderColor: colors.outline,
          borderRadius: 8,
          padding: 10,
          gap: 8,
          marginBottom: 8,
        },
        todoRow: { flexDirection: "row", alignItems: "center", gap: 4 },
        todoAction: { padding: 6 },
        addTodoBtn: {
          alignSelf: "flex-start",
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.outline,
        },
        addTodoBtnText: { color: colors.primary, fontWeight: "600" },
        muted: { color: colors.onSurfaceVariant, fontSize: 13 },
        counter: { fontSize: 12, color: colors.outline, marginTop: -8, marginBottom: 14 },
        durationRow: { flexDirection: "row", gap: 10 },
        half: { flex: 1 },
        actions: { flexDirection: "row", gap: 12 },
        footer: {
          backgroundColor: colors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          paddingTop: 12,
          paddingHorizontal: 16,
        },
        docEditWrap: {
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          maxHeight: 280,
        },
        secondary: {
          flex: 1,
          padding: 14,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
        },
        secondaryText: { fontWeight: "600", color: colors.onSurface },
        primary: {
          flex: 1,
          padding: 14,
          borderRadius: 8,
          backgroundColor: colors.primary,
          alignItems: "center",
        },
        primaryText: { fontWeight: "700", color: "#fff" },
        search: { marginBottom: 10 },
        uploadBtn: {
          borderWidth: 1,
          borderColor: colors.primary,
          borderRadius: 8,
          padding: 12,
          alignItems: "center",
          marginBottom: 10,
          backgroundColor: isDark ? "rgba(255,140,66,0.08)" : "rgba(173,44,0,0.06)",
        },
        uploadText: { color: colors.primary, fontWeight: "700" },
        card: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 10,
          marginBottom: 8,
          backgroundColor: colors.surface,
        },
        cardTitle: { color: colors.onSurface, fontWeight: "600" },
        cardMeta: { color: colors.onSurfaceVariant, fontSize: 12, marginTop: 2 },
        sourcePill: {
          alignSelf: "flex-start",
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          fontSize: 11,
          fontWeight: "700",
          color: "rgb(15,23,42)",
          marginBottom: 4,
        },
        sourcePillOrder: { backgroundColor: "rgb(103,232,249)" },
        sourcePillAsset: { backgroundColor: "rgb(134,239,172)" },
        rowActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 10 },
        actionBtn: { paddingHorizontal: 8, paddingVertical: 4 },
        actionDanger: { color: "#ef4444", fontWeight: "700" },
        actionPrimary: { color: colors.primary, fontWeight: "700" },
      }),
    [colors, isDark],
  );

  const clearAutoTimer = useCallback((localId: string) => {
    const current = timersRef.current.get(localId);
    if (current) clearTimeout(current);
    timersRef.current.delete(localId);
  }, []);

  const ensureOrderExists = useCallback(async (): Promise<string | null> => {
    if (effectiveOrderId) return effectiveOrderId;
    const payload: WorkOrderSaveBody | null = (() => {
      const name = form.name.trim();
      const description = form.description.trim();
      const hoursRaw = form.plannedDurationHours.trim().replace(",", ".");
      const hours =
        hoursRaw === ""
          ? null
          : Number.isFinite(Number(hoursRaw)) && Number(hoursRaw) >= 0
            ? Number(hoursRaw)
            : NaN;
      if (!name || !form.assetId || !form.costCenterId || !form.plannedStart || !form.workgroupId.trim() || form.responsibleEmployeeIds.length === 0) {
        return null;
      }
      if (Number.isNaN(hours)) return null;
      return {
        name,
        description: description || null,
        assetId: form.assetId,
        costCenterId: form.costCenterId,
        classificationId: form.classificationId.trim() ? form.classificationId.trim() : null,
        plannedStart: form.plannedStart.toISOString(),
        plannedEnd: form.plannedEnd ? form.plannedEnd.toISOString() : null,
        plannedDurationMinutes: hours == null ? null : Math.round(hours * 60),
        orderType: form.orderType,
        workgroupId: form.workgroupId.trim(),
        responsibleEmployeeIds: [...form.responsibleEmployeeIds],
        todos: todosToPayload(form.todos),
      };
    })();
    if (!payload) return null;
    const created = await postWorkOrder(payload);
    setEffectiveOrderId(created.id);
    await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
    await qc.refetchQueries({ queryKey: queryKeys.workOrders, type: "all" });
    return created.id;
  }, [effectiveOrderId, form, qc]);

  const uploadPendingFile = useCallback(
    async (pending: PendingDoc): Promise<boolean> => {
      const id = await ensureOrderExists();
      if (!id) return false;
      try {
        await uploadWorkOrderDocument(id, {
          file: { uri: pending.uri, name: pending.name, type: pending.mimeType },
          displayName: pending.displayName,
          category: pending.category,
        });
        return true;
      } catch {
        return false;
      }
    },
    [ensureOrderExists],
  );

  const scheduleAutoUpload = useCallback(
    (pending: PendingDoc) => {
      clearAutoTimer(pending.localId);
      const timer = setTimeout(async () => {
        setUploadingById((cur) => ({ ...cur, [pending.localId]: true }));
        try {
          const ok = await uploadPendingFile(pending);
          if (!ok) {
            Alert.alert("", t("workOrders.documentsAutoUploadNeedsOrder"));
            return;
          }
          setPendingFiles((cur) => cur.filter((x) => x.localId !== pending.localId));
          await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
          if (effectiveOrderId) {
            await qc.invalidateQueries({ queryKey: queryKeys.workOrderDocuments(effectiveOrderId) });
            await refetchDocs();
          }
        } finally {
          setUploadingById((cur) => {
            const next = { ...cur };
            delete next[pending.localId];
            return next;
          });
        }
      }, PENDING_AUTO_UPLOAD_MS) as unknown as number;
      timersRef.current.set(pending.localId, timer);
    },
    [clearAutoTimer, effectiveOrderId, qc, refetchDocs, t, uploadPendingFile],
  );

  const onPickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const incoming = result.assets.map((asset) => ({
      localId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/octet-stream",
      size: asset.size,
      displayName: asset.name,
      category: "general" as WorkOrderDocumentCategory,
      addedAt: Date.now(),
    }));
    setPendingFiles((cur) => [...cur, ...incoming]);
    incoming.forEach(scheduleAutoUpload);
  };

  const onCapturePhoto = async () => {
    if (Platform.OS === "web") {
      Alert.alert("", t("workOrders.documentsCameraNotSupportedWeb"));
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("", t("workOrders.documentsCameraPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;
    const ts = new Date();
    const fallbackName = `photo-${ts.toISOString().replace(/[:.]/g, "-")}.jpg`;
    const incoming = result.assets.map((asset) => ({
      localId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      uri: asset.uri,
      name: asset.fileName ?? fallbackName,
      mimeType: asset.mimeType ?? "image/jpeg",
      size: asset.fileSize,
      displayName: asset.fileName ?? fallbackName,
      category: "general" as WorkOrderDocumentCategory,
      addedAt: Date.now(),
    }));
    setPendingFiles((cur) => [...cur, ...incoming]);
    incoming.forEach(scheduleAutoUpload);
  };

  const onUploadPress = () => {
    if (Platform.OS === "web") {
      void onPickFiles();
      return;
    }
    Alert.alert(t("workOrders.documentsUpload"), t("workOrders.documentsSourceChooserTitle"), [
      { text: t("workOrders.documentsSourceChooserExisting"), onPress: () => void onPickFiles() },
      { text: t("workOrders.documentsSourceChooserCamera"), onPress: () => void onCapturePhoto() },
      { text: t("workOrders.cancel"), style: "cancel" },
    ]);
  };

  const onSave = async () => {
    const name = form.name.trim();
    const description = form.description.trim();
    if (!name || !form.assetId || !form.costCenterId || !form.plannedStart || !form.workgroupId.trim() || form.responsibleEmployeeIds.length === 0) {
      setShowRequiredHints(true);
      setTabIndex(tabRoutes.findIndex((r) => r.key === "general"));
      Alert.alert("", t("workOrders.validationRequired"));
      return;
    }
    setShowRequiredHints(false);
    if (name.length > 200 || description.length > 2000) {
      Alert.alert("", t("workOrders.validationLength"));
      return;
    }
    const hoursRaw = form.plannedDurationHours.trim().replace(",", ".");
    const hours =
      hoursRaw === ""
        ? null
        : Number.isFinite(Number(hoursRaw)) && Number(hoursRaw) >= 0
          ? Number(hoursRaw)
          : NaN;
    if (Number.isNaN(hours)) {
      Alert.alert("", t("workOrders.validationDuration"));
      return;
    }
    const payload: WorkOrderSaveBody = {
      name,
      description: description || null,
      assetId: form.assetId,
      costCenterId: form.costCenterId,
      classificationId: form.classificationId.trim() ? form.classificationId.trim() : null,
      plannedStart: form.plannedStart.toISOString(),
      plannedEnd: form.plannedEnd ? form.plannedEnd.toISOString() : null,
      plannedDurationMinutes: hours == null ? null : Math.round(hours * 60),
      orderType: form.orderType,
      workgroupId: form.workgroupId.trim(),
      responsibleEmployeeIds: [...form.responsibleEmployeeIds],
      todos: todosToPayload(form.todos),
    };

    setSaving(true);
    try {
      const saved = isNew && !effectiveOrderId ? await postWorkOrder(payload) : await putWorkOrder(effectiveOrderId ?? orderId ?? "", payload);
      setEffectiveOrderId(saved.id);
      if (pendingFiles.length > 0) {
        const results = await Promise.all(pendingFiles.map(uploadPendingFile));
        if (results.some((x) => !x)) {
          Alert.alert("", t("workOrders.documentsUploadPartialError"));
        }
        setPendingFiles([]);
      }
      await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
      await qc.invalidateQueries({ queryKey: queryKeys.workOrderDocuments(saved.id) });
      await qc.invalidateQueries({ queryKey: queryKeys.workOrderAssignments(saved.id) });
      await qc.refetchQueries({ queryKey: queryKeys.workOrders, type: "all" });
      await qc.refetchQueries({ queryKey: queryKeys.workOrderDocuments(saved.id), type: "all" });
      await qc.refetchQueries({ queryKey: queryKeys.workOrderAssignments(saved.id), type: "all" });
      router.back();
    } catch {
      Alert.alert("", t("workOrders.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const openDocument = async (doc: WorkOrderDocumentRow) => {
    try {
      const uri =
        doc.source === "asset"
          ? await resolveAssetDocumentUri(doc.assetId ?? "", doc.id, doc.mimeType)
          : await resolveWorkOrderDocumentUri(doc.workOrderId ?? "", doc.id, doc.mimeType);
      if (Platform.OS === "web") {
        window.open(uri, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(uri), 60000);
        return;
      }
      if (isImageMime(doc.mimeType)) {
        setImagePreviewUri(uri);
        return;
      }
      await openNativeLocalDocument(uri, {
        mimeType: doc.mimeType,
        displayName: doc.displayName || doc.fileName,
      });
    } catch {
      Alert.alert("", t("workOrders.documentsOpenError"));
    }
  };

  const updateDurationFromEnd = (nextEnd: Date | null) => {
    setForm((cur) => {
      if (!nextEnd || !cur.plannedStart) return { ...cur, plannedEnd: nextEnd, plannedDurationHours: "" };
      const diffHours = Math.max(0, (nextEnd.getTime() - cur.plannedStart.getTime()) / (1000 * 60 * 60));
      return { ...cur, plannedEnd: nextEnd, plannedDurationHours: formatHoursForInput(diffHours) };
    });
  };

  const updateEndFromDuration = (raw: string) => {
    const rawNorm = raw.replace(",", ".").replace(/[^\d.]/g, "");
    const normalized =
      rawNorm.split(".").length > 2 ? rawNorm.replace(/\.(?=.*\.)/g, "") : rawNorm;
    setForm((cur) => {
      if (!cur.plannedStart) return { ...cur, plannedDurationHours: normalized };
      let plannedEnd = cur.plannedEnd;
      if (normalized === "") {
        /* keep plannedEnd */
      } else {
        const parsed = Number(normalized);
        if (Number.isFinite(parsed) && parsed >= 0) {
          plannedEnd = new Date(cur.plannedStart.getTime() + parsed * 60 * 60 * 1000);
        }
      }
      return { ...cur, plannedDurationHours: normalized, plannedEnd };
    });
  };

  const saveFeedbackFromTab = useCallback(async () => {
    const hoursRaw = feedbackHours.trim().replace(",", ".");
    const hours = Number(hoursRaw);
    if (!Number.isFinite(hours) || hours <= 0) {
      Alert.alert("", t("workOrders.feedbackHoursInvalid"));
      return;
    }
    if (feedbackRemark.length > 2000) {
      Alert.alert("", t("workOrders.feedbackRemarkTooLong"));
      return;
    }
    if (feedbackStatusAction === "pause" && !feedbackPauseRemark.trim()) {
      Alert.alert("", t("workOrders.feedbackPauseRemarkRequired"));
      return;
    }
    if (pcrRequired && (!pcrProblemId || !pcrCauseId || !pcrRemedyId)) {
      Alert.alert("", t("workOrders.pcrRequired"));
      return;
    }
    const ok = await submitFeedback({
      hours,
      remark: feedbackRemark.trim() ? feedbackRemark.trim() : null,
      statusAction: feedbackStatusAction,
      pauseRemark: feedbackStatusAction === "pause" ? feedbackPauseRemark.trim() : null,
      ...(pcrEnabled
        ? {
            problemId: pcrProblemId ?? null,
            causeId: pcrCauseId ?? null,
            remedyId: pcrRemedyId ?? null,
          }
        : {}),
    });
    if (!ok) return;
    setFeedbackHours("");
    setFeedbackRemark("");
    setFeedbackPauseRemark("");
    setFeedbackStatusAction("none");
  }, [
    feedbackHours,
    feedbackPauseRemark,
    feedbackRemark,
    feedbackStatusAction,
    pcrCauseId,
    pcrEnabled,
    pcrProblemId,
    pcrRemedyId,
    pcrRequired,
    submitFeedback,
    t,
  ]);

  const renderTabBar = useCallback(
    (props: SceneRendererProps & { navigationState: { index: number; routes: TabRoute[] } }) => (
      <TabBar
        {...props}
        scrollEnabled
        indicatorStyle={{ backgroundColor: colors.primary, height: 2 }}
        style={{ backgroundColor: colors.surface, borderRadius: 8 }}
        tabStyle={{ width: "auto", minHeight: 42 }}
        activeColor={colors.primary}
        inactiveColor={colors.onSurfaceVariant}
        pressColor={ripple}
        pressOpacity={PRESSED_OPACITY_ROW}
      />
    ),
    [colors.onSurfaceVariant, colors.primary, colors.surface, ripple],
  );

  if (ordersLoading || assetsLoading || ccLoading || clfLoading || wgLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!isNew && !row) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.onSurface }}>{t("workOrders.loadError")}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.editorBody}>
        <TabView
        style={{ flex: 1 }}
        navigationState={{ index: tabIndex, routes: tabRoutes }}
        onIndexChange={setTabIndex}
        renderTabBar={renderTabBar}
        lazy
        renderScene={({ route }) => {
          if (route.key === "general") {
            return (
              <ScrollView style={styles.tabScene} contentContainerStyle={{ paddingBottom: 12 }}>
                <View>
          <Text style={styles.label}>{t("workOrders.orderNumber")}</Text>
          <TextInput
            value={form.orderNumber ? String(form.orderNumber) : t("workOrders.autoNumberHint")}
            editable={false}
            style={styles.input}
          />

          <Text style={styles.label}>{t("workOrders.orderType")}</Text>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [
              styles.input,
              pressedOpacity(pressed, PRESSED_OPACITY_ROW),
            ]}
            onPress={() => setTypeModal(true)}
          >
            <Text style={{ color: colors.onSurface }}>
              {typeItems.find((item) => item.id === form.orderType)?.label ??
                t(`workOrders.typeValues.${form.orderType}`, { defaultValue: form.orderType })}
            </Text>
          </HapticPressable>
          <SelectModal
            visible={typeModal}
            title={t("workOrders.orderType")}
            items={typeItems}
            onSelect={(id) => setForm((cur) => ({ ...cur, orderType: id as WorkOrderType }))}
            onClose={() => setTypeModal(false)}
          />

          <Text style={styles.label}>{t("workOrders.name")}</Text>
          <TextInput
            value={form.name}
            onChangeText={(txt) => setForm((cur) => ({ ...cur, name: txt }))}
            style={[styles.input, showRequiredHints && requiredMissing.name && styles.requiredInput]}
          />

          <View style={styles.descriptionHeader}>
            <Text style={styles.label}>{t("workOrders.description")}</Text>
            <View style={styles.segmentRow}>
              {(["text", "instructions"] as const).map((mode) => (
                <HapticPressable
                  key={mode}
                  {...androidRippleProps(ripple)}
                  style={({ pressed }) => [
                    styles.segmentBtn,
                    descriptionView === mode && styles.segmentBtnActive,
                    pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
                  ]}
                  onPress={() => setDescriptionView(mode)}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      descriptionView === mode && styles.segmentBtnTextActive,
                    ]}
                  >
                    {t(`workOrders.descriptionMode.${mode}`)}
                  </Text>
                </HapticPressable>
              ))}
            </View>
          </View>

          {descriptionView === "text" ? (
            <>
              <TextInput
                value={form.description}
                onChangeText={(txt) => setForm((cur) => ({ ...cur, description: txt }))}
                style={[styles.input, styles.description]}
                multiline
              />
              <Text style={styles.counter}>
                {t("workOrders.descriptionCounter", { count: form.description.length, max: 2000 })}
              </Text>
            </>
          ) : (
            <View style={styles.todoBox}>
              {form.todos.length === 0 ? (
                <Text style={styles.muted}>{t("workOrders.instructionsEmpty")}</Text>
              ) : (
                form.todos.map((item, index) => (
                  <View key={item.localId} style={styles.todoRow}>
                    <TextInput
                      value={item.text}
                      onChangeText={(txt) =>
                        setForm((cur) => ({
                          ...cur,
                          todos: cur.todos.map((todo) =>
                            todo.localId === item.localId ? { ...todo, text: txt } : todo,
                          ),
                        }))
                      }
                      style={[styles.input, { flex: 1 }]}
                      placeholder={t("workOrders.instructionPlaceholder")}
                    />
                    <HapticPressable
                      {...androidRippleProps(ripple)}
                      style={({ pressed }) => [styles.todoAction, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                      disabled={index === 0}
                      onPress={() => {
                        if (index === 0) return;
                        setForm((cur) => {
                          const next = [...cur.todos];
                          const [moved] = next.splice(index, 1);
                          next.splice(index - 1, 0, moved);
                          return { ...cur, todos: next };
                        });
                      }}
                    >
                      <MaterialIcons name="arrow-upward" size={18} color={colors.onSurface} />
                    </HapticPressable>
                    <HapticPressable
                      {...androidRippleProps(ripple)}
                      style={({ pressed }) => [styles.todoAction, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                      disabled={index === form.todos.length - 1}
                      onPress={() => {
                        if (index === form.todos.length - 1) return;
                        setForm((cur) => {
                          const next = [...cur.todos];
                          const [moved] = next.splice(index, 1);
                          next.splice(index + 1, 0, moved);
                          return { ...cur, todos: next };
                        });
                      }}
                    >
                      <MaterialIcons name="arrow-downward" size={18} color={colors.onSurface} />
                    </HapticPressable>
                    <HapticPressable
                      {...androidRippleProps(ripple)}
                      style={({ pressed }) => [styles.todoAction, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                      onPress={() =>
                        setForm((cur) => ({
                          ...cur,
                          todos: cur.todos.filter((todo) => todo.localId !== item.localId),
                        }))
                      }
                    >
                      <MaterialIcons name="delete-outline" size={18} color="#ef4444" />
                    </HapticPressable>
                  </View>
                ))
              )}
              <HapticPressable
                {...androidRippleProps(ripple)}
                style={({ pressed }) => [styles.addTodoBtn, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
                onPress={() => setForm((cur) => ({ ...cur, todos: [...cur.todos, newTodoFormItem()] }))}
              >
                <Text style={styles.addTodoBtnText}>{t("workOrders.instructionAdd")}</Text>
              </HapticPressable>
            </View>
          )}

          <View style={showRequiredHints && requiredMissing.assetId ? styles.requiredWrap : undefined}>
            <AssetPicker
              assets={accessibleAssets}
              value={form.assetId}
              onChange={(assetId) => setForm((cur) => ({ ...cur, assetId }))}
              label={t("workOrders.asset")}
              placeholder={t("workOrders.assetPlaceholder")}
            />
          </View>

          <View style={showRequiredHints && requiredMissing.costCenterId ? styles.requiredWrap : undefined}>
            <CostCenterPicker
              costCenters={selectableCostCenters}
              siteId={selectedAsset?.siteId ?? ""}
              value={form.costCenterId || null}
              onChange={(costCenterId) => setForm((cur) => ({ ...cur, costCenterId: costCenterId ?? "" }))}
              label={t("workOrders.costCenter")}
              noneLabel={t("workOrders.costCenterPlaceholder")}
              markInactiveLabel={() => `(${t("costCenters.active").toLowerCase()} ✕)`}
            />
          </View>

          <ClassificationPicker
            classifications={selectableClassifications}
            siteId={selectedAsset?.siteId ?? ""}
            scope="work_order"
            value={form.classificationId || null}
            onChange={(classificationId) =>
              setForm((cur) => ({ ...cur, classificationId: classificationId ?? "" }))
            }
            label={t("workOrders.classification")}
            noneLabel={t("workOrders.classificationNone")}
          />

          <Text style={styles.label}>
            {t("workOrders.workgroup")} <Text style={{ color: colors.primary }}>*</Text>
          </Text>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [
              styles.input,
              !form.assetId && { opacity: 0.5 },
              showRequiredHints && requiredMissing.workgroupId && styles.requiredInput,
              form.assetId ? pressedOpacity(pressed, PRESSED_OPACITY_ROW) : null,
            ]}
            disabled={!form.assetId}
            onPress={() => setWorkgroupModal(true)}
          >
            <Text style={{ color: colors.onSurface }}>{selectedWorkgroupLabel}</Text>
          </HapticPressable>
          <SelectModal
            visible={workgroupModal}
            title={t("workOrders.workgroup")}
            items={workgroupItems}
            onSelect={(id) =>
              setForm((cur) => ({
                ...cur,
                workgroupId: String(id),
                responsibleEmployeeIds: [],
              }))
            }
            onClose={() => setWorkgroupModal(false)}
          />

          <Text style={styles.label}>
            {t("workOrders.responsible")} <Text style={{ color: colors.primary }}>*</Text>
          </Text>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [
              styles.input,
              (!form.workgroupId || responsibleEmployeeItems.length === 0) && { opacity: 0.5 },
              showRequiredHints && requiredMissing.responsibleEmployeeIds && styles.requiredInput,
              form.workgroupId && responsibleEmployeeItems.length > 0
                ? pressedOpacity(pressed, PRESSED_OPACITY_ROW)
                : null,
            ]}
            disabled={!form.workgroupId || responsibleEmployeeItems.length === 0}
            onPress={() => setResponsibleModal(true)}
          >
            <Text style={{ color: colors.onSurface }}>{selectedResponsibleLabel}</Text>
          </HapticPressable>
          <MultiSelectModal
            visible={responsibleModal}
            title={t("workOrders.responsible")}
            items={responsibleEmployeeItems}
            selectedIds={form.responsibleEmployeeIds}
            onChange={(ids) => setForm((cur) => ({ ...cur, responsibleEmployeeIds: ids }))}
            onClose={() => setResponsibleModal(false)}
            doneLabel={t("workOrders.done")}
          />

          <DateTimeField
            label={t("workOrders.plannedStart")}
            value={form.plannedStart}
            onChange={(next) => {
              if (!next) return;
              setForm((cur) => {
                const parsedHours = Number(cur.plannedDurationHours.trim().replace(",", "."));
                const end =
                  cur.plannedDurationHours.trim() !== "" &&
                  Number.isFinite(parsedHours) &&
                  parsedHours >= 0
                    ? new Date(next.getTime() + parsedHours * 60 * 60 * 1000)
                    : cur.plannedEnd;
                return { ...cur, plannedStart: next, plannedEnd: end };
              });
            }}
            locale={i18n.language}
          />

          <DateTimeField
            label={t("workOrders.plannedEnd")}
            value={form.plannedEnd}
            onChange={updateDurationFromEnd}
            locale={i18n.language}
          />

          <Text style={styles.label}>{t("workOrders.plannedDuration")}</Text>
          <TextInput
            value={form.plannedDurationHours}
            onChangeText={updateEndFromDuration}
            style={styles.input}
            placeholder={t("workOrders.plannedDurationPlaceholder")}
            keyboardType="decimal-pad"
          />
        </View>
              </ScrollView>
            );
          }
          if (route.key === "documents") {
            return (
              <ScrollView style={styles.tabScene} contentContainerStyle={{ paddingBottom: 12 }}>
                <View>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [styles.uploadBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            onPress={onUploadPress}
          >
            <Text style={styles.uploadText}>{t("workOrders.documentsUpload")}</Text>
          </HapticPressable>
          <TextInput
            value={docSearchTerm}
            onChangeText={setDocSearchTerm}
            placeholder={t("workOrders.documentsSearchPlaceholder")}
            style={[styles.input, styles.search]}
          />

          {filteredPending.map((doc) => (
            <View key={doc.localId} style={styles.card}>
              <Text style={styles.cardTitle}>{doc.displayName}</Text>
              <Text style={styles.cardMeta}>
                {t(`workOrders.documentCategories.${doc.category}`)} · {doc.mimeType}
              </Text>
              <Text style={styles.cardMeta}>
                {uploadingById[doc.localId]
                  ? t("workOrders.documentsUploading")
                  : `${Math.max(0, Math.ceil((PENDING_AUTO_UPLOAD_MS - (Date.now() - doc.addedAt)) / 1000))}s`}
              </Text>
              <View style={styles.rowActions}>
                <HapticPressable
                  {...androidRippleProps(ripple, true)}
                  style={({ pressed }) => [styles.actionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                  onPress={() => {
                    clearAutoTimer(doc.localId);
                    setPendingFiles((cur) => cur.filter((x) => x.localId !== doc.localId));
                  }}
                >
                  <Text style={styles.actionDanger}>{t("workOrders.documentsRemovePending")}</Text>
                </HapticPressable>
              </View>
            </View>
          ))}

          {!effectiveOrderId ? (
            <Text style={{ color: colors.onSurfaceVariant }}>{t("workOrders.documentsCreateHint")}</Text>
          ) : docsLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            filteredDocs.map((doc) => (
              <HapticPressable
                key={doc.id}
                {...androidRippleProps(ripple)}
                style={({ pressed }) => [styles.card, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
                onPress={() => void openDocument(doc)}
              >
                <Text
                  style={[
                    styles.sourcePill,
                    doc.source === "asset" ? styles.sourcePillAsset : styles.sourcePillOrder,
                  ]}
                >
                  {t(`workOrders.documentsSource.${doc.source}`)}
                </Text>
                <Text style={styles.cardTitle}>{doc.displayName || doc.fileName}</Text>
                <Text style={styles.cardMeta}>
                  {t(`workOrders.documentCategories.${doc.category}`)} · {doc.mimeType}
                </Text>
                <Text style={styles.cardMeta}>
                  {t("workOrders.documentsUploadedBy")}: {doc.createdBy} · {t("workOrders.documentsUploadedAt")}:{" "}
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
                    new Date(doc.createdAt),
                  )}
                </Text>
                <View style={styles.rowActions}>
                  <HapticPressable
                    {...androidRippleProps(ripple, true)}
                    style={({ pressed }) => [styles.actionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                    onPress={(e) => {
                      e.stopPropagation();
                      setDocEdit(doc);
                      setDocEditDisplayName(doc.displayName || doc.fileName);
                      setDocEditCategory(doc.category);
                    }}
                  >
                    <Text style={styles.actionPrimary}>{t("workOrders.edit")}</Text>
                  </HapticPressable>
                  {doc.source === "workOrder" && doc.workOrderId ? (
                    <HapticPressable
                      {...androidRippleProps(ripple, true)}
                      style={({ pressed }) => [styles.actionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                      onPress={(e) => {
                        e.stopPropagation();
                        Alert.alert(t("workOrders.delete"), t("workOrders.documentsDeleteError"), [
                          { text: t("workOrders.no"), style: "cancel" },
                          {
                            text: t("workOrders.yes"),
                            style: "destructive",
                            onPress: () => {
                              void (async () => {
                                try {
                                  await deleteWorkOrderDocument(doc.workOrderId ?? "", doc.id);
                                  await refetchDocs();
                                  await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
                                } catch {
                                  Alert.alert("", t("workOrders.documentsDeleteError"));
                                }
                              })();
                            },
                          },
                        ]);
                      }}
                    >
                      <Text style={styles.actionDanger}>{t("workOrders.delete")}</Text>
                    </HapticPressable>
                  ) : null}
                </View>
              </HapticPressable>
            ))
          )}
        </View>
              </ScrollView>
            );
          }
          if (route.key === "assignments") {
            if (!effectiveOrderId) {
              return (
                <View style={styles.tabScene}>
                  <Text style={styles.assignmentsEmpty}>{t("workOrders.assignmentsAfterSave")}</Text>
                </View>
              );
            }
            if (assignmentsLoading) {
              return (
                <View style={styles.tabScene}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              );
            }
            return (
              <ScrollView style={styles.tabScene} contentContainerStyle={{ paddingBottom: 12 }}>
                {assignments.length === 0 ? (
                  <Text style={styles.assignmentsEmpty}>{t("workOrders.assignmentsEmpty")}</Text>
                ) : (
                  assignments.map((a: WorkOrderAssignmentRow) => (
                    <View key={a.id} style={styles.assignmentRow}>
                      <Text style={styles.assignmentTitle}>
                        {a.employeeKey} — {a.employeeName}
                      </Text>
                      <Text style={styles.assignmentMeta}>
                        {t("workOrders.documentsUploadedBy")}: {a.createdBy}
                      </Text>
                    </View>
                  ))
                )}
              </ScrollView>
            );
          }
          return (
            <ScrollView style={styles.tabScene} contentContainerStyle={{ paddingBottom: 12 }}>
              {!effectiveOrderId ? (
                <Text style={styles.assignmentsEmpty}>{t("workOrders.assignmentsAfterSave")}</Text>
              ) : !canFeedbackWorkOrder(currentOrder?.status ?? "open") ? (
                <Text style={styles.assignmentsEmpty}>{t("workOrders.cannotFeedbackFromStatus")}</Text>
              ) : (
                <View>
                  <Text style={styles.label}>{t("workOrders.feedbackReportingEmployee")}</Text>
                  <View style={[styles.input, { justifyContent: "center" }]}>
                    <Text style={{ color: colors.onSurfaceVariant }}>
                      {[user?.employeeKey, user?.employeeName]
                        .map((x) => (typeof x === "string" ? x.trim() : ""))
                        .filter(Boolean)
                        .join(" — ") || t("workOrders.feedbackReportingEmployeeEmpty")}
                    </Text>
                  </View>
                  <Text style={styles.label}>{t("workOrders.feedbackHours")}</Text>
                  <TextInput
                    value={feedbackHours}
                    onChangeText={setFeedbackHours}
                    placeholder={t("workOrders.feedbackHoursPlaceholder")}
                    style={styles.input}
                    keyboardType="decimal-pad"
                    editable={!feedbackSaving}
                  />
                  {(feedbackEntryMode === "pause" || feedbackStatusAction === "pause") ? (
                    <FeedbackRemarkInput
                      label={t("workOrders.feedbackPauseRemark")}
                      value={feedbackPauseRemark}
                      onChange={setFeedbackPauseRemark}
                      disabled={feedbackSaving}
                      placeholder={t("workOrders.feedbackPauseRemark")}
                    />
                  ) : null}
                  <FeedbackRemarkInput
                    label={t("workOrders.feedbackRemark")}
                    value={feedbackRemark}
                    onChange={setFeedbackRemark}
                    disabled={feedbackSaving}
                    placeholder={t("workOrders.feedbackRemark")}
                  />
                  {pcrEnabled ? (
                    <View
                      style={{
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                        paddingTop: 10,
                        marginTop: 4,
                      }}
                    >
                      <Text style={styles.label}>{t("workOrders.pcrSection")}</Text>
                      <PcrOptionPicker
                        label={t("workOrders.pcrProblem")}
                        placeholder={t("workOrders.pcrProblemPlaceholder")}
                        value={pcrProblemId}
                        options={pcrProblemOptions}
                        disabled={feedbackSaving}
                        onChange={(id) => {
                          setPcrProblemId(id);
                          setPcrCauseId(null);
                          setPcrRemedyId(null);
                        }}
                      />
                      <PcrOptionPicker
                        label={t("workOrders.pcrCause")}
                        placeholder={t("workOrders.pcrCausePlaceholder")}
                        value={pcrCauseId}
                        options={pcrCauseOptions}
                        disabled={feedbackSaving || !pcrProblemId}
                        onChange={(id) => {
                          setPcrCauseId(id);
                          setPcrRemedyId(null);
                        }}
                      />
                      <PcrOptionPicker
                        label={t("workOrders.pcrRemedy")}
                        placeholder={t("workOrders.pcrRemedyPlaceholder")}
                        value={pcrRemedyId}
                        options={pcrRemedyOptions}
                        disabled={feedbackSaving || !pcrCauseId}
                        onChange={setPcrRemedyId}
                      />
                    </View>
                  ) : null}
                  <Text style={styles.label}>{t("workOrders.feedbackStatusActionLegend")}</Text>
                  {(["none", "pause", "end"] as const).map((value) => (
                    <HapticPressable
                      key={value}
                      disabled={feedbackSaving}
                      onPress={() => setFeedbackStatusAction(value)}
                      style={({ pressed }) => [
                        { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
                        pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
                      ]}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          borderWidth: 2,
                          borderColor: colors.primary,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {feedbackStatusAction === value ? (
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} />
                        ) : null}
                      </View>
                      <Text style={{ color: colors.onSurface }}>{t(`workOrders.feedbackStatusAction.${value}`)}</Text>
                    </HapticPressable>
                  ))}
                  <Text style={styles.label}>{t("workOrders.feedbackExisting")}</Text>
                  {feedbackRowsLoading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : feedbackRows.length === 0 ? (
                    <Text style={styles.assignmentsEmpty}>{t("workOrders.feedbackEmpty")}</Text>
                  ) : (
                    feedbackRows.map((fb: TransactionRow) => (
                      <View key={fb.id} style={styles.feedbackRow}>
                        <Text style={styles.feedbackRowTitle}>
                          {t("workOrders.feedbackHours")}: {fb.quantity}
                        </Text>
                        <Text style={styles.feedbackRowMeta}>
                          {new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
                            new Date(fb.bookedAt),
                          )}
                        </Text>
                        {fb.remark ? <Text style={styles.feedbackRowMeta}>{fb.remark}</Text> : null}
                      </View>
                    ))
                  )}
                </View>
              )}
            </ScrollView>
          );
        }}
      />
      </View>

      {docEdit ? (
        <ScrollView style={styles.docEditWrap} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          <View style={styles.card}>
            <Text style={styles.label}>{t("workOrders.documentsDisplayName")}</Text>
            <TextInput value={docEditDisplayName} onChangeText={setDocEditDisplayName} style={styles.input} />
            <Text style={styles.label}>{t("workOrders.documentsCategory")}</Text>
            <HapticPressable
              {...androidRippleProps(ripple)}
              style={({ pressed }) => [styles.input, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
              onPress={() => setSearchTerm("open-category-modal")}
            >
              <Text>{t(`workOrders.documentCategories.${docEditCategory}`)}</Text>
            </HapticPressable>
            <SelectModal
              visible={searchTerm === "open-category-modal"}
              title={t("workOrders.documentsCategory")}
              items={DOC_CATEGORIES.map((c) => ({ id: c, label: t(`workOrders.documentCategories.${c}`) }))}
              onSelect={(id) => setDocEditCategory(id as WorkOrderDocumentCategory)}
              onClose={() => setSearchTerm("")}
            />
            <View style={styles.actions}>
              <HapticPressable
                {...androidRippleProps(ripple)}
                style={({ pressed }) => [styles.secondary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                onPress={() => setDocEdit(null)}
                disabled={docEditSaving}
              >
                <Text style={styles.secondaryText}>{t("workOrders.cancel")}</Text>
              </HapticPressable>
              <HapticPressable
                {...androidRippleProps(ripple)}
                style={({ pressed }) => [styles.primary, !docEditSaving && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                onPress={() => {
                  void (async () => {
                    if (!docEdit) return;
                    const name = docEditDisplayName.trim();
                    if (!name) {
                      Alert.alert("", t("workOrders.documentsDisplayNameRequired"));
                      return;
                    }
                    setDocEditSaving(true);
                    try {
                      if (docEdit.source === "asset") {
                        await patchAssetDocument(docEdit.assetId ?? "", docEdit.id, {
                          displayName: name,
                          category: docEditCategory,
                        });
                        await qc.invalidateQueries({ queryKey: queryKeys.assets });
                      } else {
                        await patchWorkOrderDocument(docEdit.workOrderId ?? "", docEdit.id, {
                          displayName: name,
                          category: docEditCategory,
                        });
                      }
                      setDocEdit(null);
                      await refetchDocs();
                      await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
                    } catch {
                      Alert.alert("", t("workOrders.documentsUpdateError"));
                    } finally {
                      setDocEditSaving(false);
                    }
                  })();
                }}
                disabled={docEditSaving}
              >
                {docEditSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{t("workOrders.save")}</Text>
                )}
              </HapticPressable>
            </View>
          </View>
        </ScrollView>
      ) : null}

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.actions}>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [styles.secondary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            onPress={() => router.back()}
          >
            <Text style={styles.secondaryText}>{t("workOrders.cancel")}</Text>
          </HapticPressable>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [
              styles.primary,
              !(saving || feedbackSaving) && pressedOpacity(pressed, PRESSED_OPACITY_STRONG),
              !(saving || feedbackSaving) && pressed && { transform: [{ scale: 0.98 }] },
            ]}
            onPress={() => {
              if (tabRoutes[tabIndex]?.key === "feedback") {
                void saveFeedbackFromTab();
                return;
              }
              void onSave();
            }}
            disabled={saving || feedbackSaving}
          >
            {saving || feedbackSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>
                {tabRoutes[tabIndex]?.key === "feedback" ? t("workOrders.reportBackAndSave") : t("workOrders.save")}
              </Text>
            )}
          </HapticPressable>
        </View>
      </View>

      {effectiveOrderId ? (
        <>
          <WorkOrderChatFab
            accessibilityLabel={t("workOrders.messagesOpen")}
            onPress={() => setChatVisible(true)}
          />
          <WorkOrderChatSheet
            visible={chatVisible}
            onClose={() => setChatVisible(false)}
            orderId={effectiveOrderId}
            orderLabel={
              currentOrder
                ? `${currentOrder.orderNumber} · ${currentOrder.name}`
                : form.name.trim() || undefined
            }
            currentUserId={user?.id ?? null}
          />
        </>
      ) : null}

      <Modal
        visible={Boolean(imagePreviewUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewUri(null)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.92)",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onPress={() => setImagePreviewUri(null)}
        >
          {imagePreviewUri ? (
            <Image
              source={{ uri: imagePreviewUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
