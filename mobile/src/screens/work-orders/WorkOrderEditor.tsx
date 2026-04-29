import * as DocumentPicker from "expo-document-picker";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../auth/AuthContext";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../lib/appParameterKeys";
import { API_BASE_URL } from "../../lib/api";
import { AssetPicker } from "../../components/AssetPicker";
import { ClassificationPicker } from "../../components/ClassificationPicker";
import { CostCenterPicker } from "../../components/CostCenterPicker";
import { DateTimeField } from "../../components/DateTimeField";
import { SelectModal, type SelectItem } from "../../components/SelectModal";
import {
  deleteWorkOrderDocument,
  fetchAssetDocumentBlob,
  fetchWorkOrderDocumentBlob,
  patchAssetDocument,
  patchWorkOrderDocument,
  postWorkOrder,
  putWorkOrder,
  queryKeys,
  uploadWorkOrderDocument,
  useAssetsQuery,
  useClassificationsQuery,
  useCostCentersQuery,
  useDeleteWorkOrderMutation,
  useWorkOrderDocumentsQuery,
  useWorkgroupsQuery,
  useWorkOrdersQuery,
  type WorkOrderSaveBody,
} from "../../hooks/queries";
import type { WorkOrderDocumentCategory, WorkOrderDocumentRow, WorkOrderType } from "../../types/api";
import { useAppTheme } from "../../theme/AppThemeContext";

type Props = {
  orderId?: string;
};

type TabId = "general" | "documents";
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
type FormState = {
  orderNumber: number | null;
  name: string;
  description: string;
  assetId: string;
  costCenterId: string;
  classificationId: string;
  workgroupId: string;
  plannedStart: Date;
  plannedEnd: Date | null;
  plannedDurationHours: string;
  orderType: WorkOrderType;
};

const PENDING_AUTO_UPLOAD_MS = 5000;
const ORDER_TYPES: WorkOrderType[] = ["maintenance", "repair", "breakdown"];
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
    assetId: "",
    costCenterId: "",
    classificationId: "",
    workgroupId: "",
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
  const qc = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const { user, appParameterBooleans, appParameterDefaultWorkgroupId } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const deleteMutation = useDeleteWorkOrderMutation();

  const { data: orders = [], isLoading: ordersLoading } = useWorkOrdersQuery();
  const { data: assets = [], isLoading: assetsLoading } = useAssetsQuery();
  const { data: costCenters = [], isLoading: ccLoading } = useCostCentersQuery();
  const { data: classifications = [], isLoading: clfLoading } = useClassificationsQuery();
  const { data: workgroups = [], isLoading: wgLoading } = useWorkgroupsQuery();

  const row = useMemo(() => (orderId ? orders.find((o) => o.id === orderId) : undefined), [orderId, orders]);
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [typeModal, setTypeModal] = useState(false);
  const [workgroupModal, setWorkgroupModal] = useState(false);
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

  const { data: documents = [], isLoading: docsLoading, refetch: refetchDocs } = useWorkOrderDocumentsQuery(effectiveOrderId);

  useEffect(() => {
    if (isNew || !row || hydrated) return;
    setForm({
      orderNumber: row.orderNumber,
      name: row.name,
      description: row.description ?? "",
      assetId: row.assetId,
      costCenterId: row.costCenterId,
      classificationId: row.classificationId ?? "",
      workgroupId: row.workgroupId ?? "",
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
  }, [hydrated, isNew, row]);

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

  useEffect(() => {
    if (!form.workgroupId) return;
    const wg = workgroups.find((w) => w.id === form.workgroupId);
    if (!wg || !selectedAsset?.siteId || wg.siteId !== selectedAsset.siteId) {
      setForm((cur) => ({ ...cur, workgroupId: "" }));
    }
  }, [form.workgroupId, selectedAsset?.siteId, workgroups]);

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

  const typeItems: SelectItem[] = useMemo(
    () =>
      ORDER_TYPES.map((tp) => ({
        id: tp,
        label: t(`workOrders.typeValues.${tp}`),
      })),
    [t],
  );

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

  const styles = useMemo(
    () =>
      StyleSheet.create({
        center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
        page: { padding: 16, paddingBottom: 42, backgroundColor: colors.background },
        tabs: { flexDirection: "row", gap: 8, marginBottom: 14 },
        tabBtn: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingVertical: 10,
          alignItems: "center",
          backgroundColor: colors.surface,
        },
        tabBtnActive: { borderColor: colors.primary, backgroundColor: isDark ? "rgba(255,140,66,0.14)" : "rgba(173,44,0,0.08)" },
        tabText: { color: colors.onSurfaceVariant, fontWeight: "600" },
        tabTextActive: { color: colors.onSurface, fontWeight: "700" },
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
        description: { minHeight: 96, textAlignVertical: "top" },
        counter: { fontSize: 12, color: colors.outline, marginTop: -8, marginBottom: 14 },
        durationRow: { flexDirection: "row", gap: 10 },
        half: { flex: 1 },
        actions: { flexDirection: "row", gap: 12, marginTop: 10 },
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
        danger: {
          marginTop: 18,
          padding: 14,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isDark ? "rgba(248, 113, 113, 0.45)" : "#fecaca",
          backgroundColor: isDark ? "rgba(127, 29, 29, 0.35)" : "#fef2f2",
          alignItems: "center",
        },
        dangerText: { fontWeight: "700", color: "#f87171" },
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
      if (!name || !form.assetId || !form.costCenterId || !form.plannedStart || !form.workgroupId.trim()) {
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
      };
    })();
    if (!payload) return null;
    const created = await postWorkOrder(payload);
    setEffectiveOrderId(created.id);
    await qc.invalidateQueries({ queryKey: queryKeys.workOrders });
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

  const onSave = async () => {
    const name = form.name.trim();
    const description = form.description.trim();
      if (!name || !form.assetId || !form.costCenterId || !form.plannedStart || !form.workgroupId.trim()) {
        Alert.alert("", t("workOrders.validationRequired"));
        return;
      }
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
      router.back();
    } catch {
      Alert.alert("", t("workOrders.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!effectiveOrderId && !orderId) return;
    Alert.alert(t("workOrders.delete"), t("workOrders.confirmDelete", { name: form.name || "?" }), [
      { text: t("workOrders.no"), style: "cancel" },
      {
        text: t("workOrders.yes"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteMutation.mutateAsync(effectiveOrderId ?? orderId ?? "");
              router.back();
            } catch {
              Alert.alert("", t("workOrders.deleteError"));
            }
          })();
        },
      },
    ]);
  };

  const openDocument = async (doc: WorkOrderDocumentRow) => {
    if (Platform.OS === "web") {
      try {
        const blob =
          doc.source === "asset"
            ? await fetchAssetDocumentBlob(doc.assetId ?? "", doc.id)
            : await fetchWorkOrderDocumentBlob(doc.workOrderId ?? "", doc.id);
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch {
        Alert.alert("", t("workOrders.documentsOpenError"));
      }
      return;
    }
    const url =
      doc.source === "asset"
        ? `${API_BASE_URL}/api/assets/${doc.assetId}/documents/${doc.id}/content`
        : `${API_BASE_URL}/api/work-orders/${doc.workOrderId}/documents/${doc.id}/content`;
    await Linking.openURL(url);
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
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.tabs}>
        <Pressable style={[styles.tabBtn, activeTab === "general" && styles.tabBtnActive]} onPress={() => setActiveTab("general")}>
          <Text style={[styles.tabText, activeTab === "general" && styles.tabTextActive]}>{t("workOrders.tabGeneral")}</Text>
        </Pressable>
        <Pressable style={[styles.tabBtn, activeTab === "documents" && styles.tabBtnActive]} onPress={() => setActiveTab("documents")}>
          <Text style={[styles.tabText, activeTab === "documents" && styles.tabTextActive]}>{t("workOrders.tabDocuments")}</Text>
        </Pressable>
      </View>

      {activeTab === "general" ? (
        <View>
          <Text style={styles.label}>{t("workOrders.orderNumber")}</Text>
          <TextInput
            value={form.orderNumber ? String(form.orderNumber) : t("workOrders.autoNumberHint")}
            editable={false}
            style={styles.input}
          />

          <Text style={styles.label}>{t("workOrders.orderType")}</Text>
          <Pressable style={styles.input} onPress={() => setTypeModal(true)}>
            <Text style={{ color: colors.onSurface }}>{t(`workOrders.typeValues.${form.orderType}`)}</Text>
          </Pressable>
          <SelectModal
            visible={typeModal}
            title={t("workOrders.orderType")}
            items={typeItems}
            onSelect={(id) => setForm((cur) => ({ ...cur, orderType: id as WorkOrderType }))}
            onClose={() => setTypeModal(false)}
          />

          <Text style={styles.label}>{t("workOrders.name")}</Text>
          <TextInput value={form.name} onChangeText={(txt) => setForm((cur) => ({ ...cur, name: txt }))} style={styles.input} />

          <Text style={styles.label}>{t("workOrders.description")}</Text>
          <TextInput
            value={form.description}
            onChangeText={(txt) => setForm((cur) => ({ ...cur, description: txt }))}
            style={[styles.input, styles.description]}
            multiline
          />
          <Text style={styles.counter}>{t("workOrders.descriptionCounter", { count: form.description.length, max: 2000 })}</Text>

          <AssetPicker
            assets={accessibleAssets}
            value={form.assetId}
            onChange={(assetId) => setForm((cur) => ({ ...cur, assetId }))}
            label={t("workOrders.asset")}
            placeholder={t("workOrders.assetPlaceholder")}
          />

          <CostCenterPicker
            costCenters={selectableCostCenters}
            siteId={selectedAsset?.siteId ?? ""}
            value={form.costCenterId || null}
            onChange={(costCenterId) => setForm((cur) => ({ ...cur, costCenterId: costCenterId ?? "" }))}
            label={t("workOrders.costCenter")}
            noneLabel={t("workOrders.costCenterPlaceholder")}
            markInactiveLabel={() => `(${t("costCenters.active").toLowerCase()} ✕)`}
          />

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
          <Pressable
            style={[styles.input, !form.assetId && { opacity: 0.5 }]}
            disabled={!form.assetId}
            onPress={() => setWorkgroupModal(true)}
          >
            <Text style={{ color: colors.onSurface }}>{selectedWorkgroupLabel}</Text>
          </Pressable>
          <SelectModal
            visible={workgroupModal}
            title={t("workOrders.workgroup")}
            items={workgroupItems}
            onSelect={(id) => setForm((cur) => ({ ...cur, workgroupId: String(id) }))}
            onClose={() => setWorkgroupModal(false)}
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
      ) : (
        <View>
          <Pressable style={styles.uploadBtn} onPress={() => void onPickFiles()}>
            <Text style={styles.uploadText}>{t("workOrders.documentsUpload")}</Text>
          </Pressable>
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
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => {
                    clearAutoTimer(doc.localId);
                    setPendingFiles((cur) => cur.filter((x) => x.localId !== doc.localId));
                  }}
                >
                  <Text style={styles.actionDanger}>{t("workOrders.documentsRemovePending")}</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {!effectiveOrderId ? (
            <Text style={{ color: colors.onSurfaceVariant }}>{t("workOrders.documentsCreateHint")}</Text>
          ) : docsLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            filteredDocs.map((doc) => (
              <Pressable key={doc.id} style={styles.card} onPress={() => void openDocument(doc)}>
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
                  <Pressable
                    style={styles.actionBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      setDocEdit(doc);
                      setDocEditDisplayName(doc.displayName || doc.fileName);
                      setDocEditCategory(doc.category);
                    }}
                  >
                    <Text style={styles.actionPrimary}>{t("workOrders.edit")}</Text>
                  </Pressable>
                  {doc.source === "workOrder" && doc.workOrderId ? (
                    <Pressable
                      style={styles.actionBtn}
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
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>{t("workOrders.cancel")}</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={() => void onSave()} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t("workOrders.save")}</Text>}
        </Pressable>
      </View>

      {!isNew ? (
        <Pressable style={styles.danger} onPress={onDelete}>
          <Text style={styles.dangerText}>{t("workOrders.delete")}</Text>
        </Pressable>
      ) : null}

      {docEdit ? (
        <View style={[styles.card, { marginTop: 14 }]}>
          <Text style={styles.label}>{t("workOrders.documentsDisplayName")}</Text>
          <TextInput value={docEditDisplayName} onChangeText={setDocEditDisplayName} style={styles.input} />
          <Text style={styles.label}>{t("workOrders.documentsCategory")}</Text>
          <Pressable style={styles.input} onPress={() => setSearchTerm("open-category-modal")}>
            <Text>{t(`workOrders.documentCategories.${docEditCategory}`)}</Text>
          </Pressable>
          <SelectModal
            visible={searchTerm === "open-category-modal"}
            title={t("workOrders.documentsCategory")}
            items={DOC_CATEGORIES.map((c) => ({ id: c, label: t(`workOrders.documentCategories.${c}`) }))}
            onSelect={(id) => setDocEditCategory(id as WorkOrderDocumentCategory)}
            onClose={() => setSearchTerm("")}
          />
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={() => setDocEdit(null)} disabled={docEditSaving}>
              <Text style={styles.secondaryText}>{t("workOrders.cancel")}</Text>
            </Pressable>
            <Pressable
              style={styles.primary}
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
            </Pressable>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}
