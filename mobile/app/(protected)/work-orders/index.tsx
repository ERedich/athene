import {
  CheckSquare,
  ChevronRight,
  FileText,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ShellHeaderActions } from "../../../src/components/ShellHeaderActions";
import PagerView from "../../../src/components/PagerView";
import { HapticPressable } from "../../../src/components/HapticPressable";
import { WorkOrderActionsSheet } from "../../../src/components/WorkOrderActionsSheet";
import { WorkOrderFeedbackModal } from "../../../src/components/WorkOrderFeedbackModal";
import { WorkOrderFilterPills } from "../../../src/components/WorkOrderFilterPills";
import { WorkOrderPresetDetailsSheet } from "../../../src/components/WorkOrderPresetDetailsSheet";
import { useAtheneAssistant } from "../../../src/assistant/AtheneAssistantContext";
import { useAuth } from "../../../src/auth/AuthContext";
import {
  WorkOrderActionError,
  postWorkOrderFeedback,
  postWorkOrderStart,
  type WorkOrderFeedbackBody,
  queryKeys,
  useWorkOrderSearchPresetsBootstrapQuery,
  useWorkOrdersByAssetQuery,
  useWorkOrdersByPresetQuery,
  useWorkOrdersQuery,
} from "../../../src/hooks/queries";
import { isSamePresetId } from "../../../src/lib/workOrderSearchPresetsApi";
import { canFeedbackWorkOrder, canPauseWorkOrder, canStartWorkOrder } from "../../../src/lib/workOrderLifecycle";
import { workOrderStatusBackground, workOrderStatusForeground } from "../../../src/lib/workOrderStatusColors";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  PRESSED_OPACITY_ROW,
  surfaceRippleColor,
} from "../../../src/styles/pressableFeedback";
import { useAppTheme } from "../../../src/theme/AppThemeContext";
import type { WorkOrderRow } from "../../../src/types/api";
import type { WorkOrderSearchPresetListItem } from "../../../src/lib/workOrderSearchPresetsApi";

function filterWorkOrders(rows: WorkOrderRow[], q: string, t: ReturnType<typeof useTranslation>["t"]) {
  const s = q.trim().toLowerCase();
  if (!s) return rows;
  return rows.filter((row) =>
    [
      row.orderNumber,
      row.name,
      row.description ?? "",
      row.assetKey,
      row.assetName,
      row.costCenterKey,
      row.costCenterName,
      row.siteKey,
      row.siteName,
      row.orderType,
      row.status,
      t(`workOrders.statusValues.${row.status}`),
      row.createdBy,
      row.updatedBy,
    ]
      .join(" ")
      .toLowerCase()
      .includes(s),
  );
}

type TempAssetFilter = { id: string; key: string };

type ListPageProps = {
  pageIndex: number;
  active: boolean;
  presets: WorkOrderSearchPresetListItem[];
  bootstrapReady: boolean;
  searchQ: string;
  tempAssetId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles: any;
  renderItem: ({ item }: { item: WorkOrderRow }) => React.JSX.Element;
  t: ReturnType<typeof useTranslation>["t"];
  onFilteredCountChange?: (count: number) => void;
};

function WorkOrdersListPage({
  pageIndex,
  active,
  presets,
  bootstrapReady,
  searchQ,
  tempAssetId,
  styles,
  renderItem,
  t,
  onFilteredCountChange,
}: ListPageProps) {
  const { colors, isDark } = useAppTheme();
  const rowRipple = surfaceRippleColor(isDark);
  const isAll = pageIndex === 0;
  const presetId = !isAll ? presets[pageIndex - 1]?.id : undefined;
  const useAssetFilter = isAll && Boolean(tempAssetId);

  const allOrdersQuery = useWorkOrdersQuery({
    enabled: bootstrapReady && active && isAll && !useAssetFilter,
  });
  const assetOrdersQuery = useWorkOrdersByAssetQuery(
    tempAssetId,
    bootstrapReady && active && useAssetFilter,
  );
  const presetQuery = useWorkOrdersByPresetQuery(presetId, bootstrapReady && active && !isAll);

  const listData = useAssetFilter
    ? (assetOrdersQuery.data ?? [])
    : isAll
      ? (allOrdersQuery.data ?? [])
      : (presetQuery.data ?? []);
  const listLoading = useAssetFilter
    ? assetOrdersQuery.isLoading
    : isAll
      ? allOrdersQuery.isLoading
      : presetQuery.isLoading;
  const listError = useAssetFilter
    ? assetOrdersQuery.isError
    : isAll
      ? allOrdersQuery.isError
      : presetQuery.isError;
  const listFetching = useAssetFilter
    ? assetOrdersQuery.isFetching
    : isAll
      ? allOrdersQuery.isFetching
      : presetQuery.isFetching;
  const refetchList = useAssetFilter
    ? assetOrdersQuery.refetch
    : isAll
      ? allOrdersQuery.refetch
      : presetQuery.refetch;

  const filtered = useMemo(() => filterWorkOrders(listData, searchQ, t), [listData, searchQ, t]);

  useEffect(() => {
    if (!active || !onFilteredCountChange) return;
    onFilteredCountChange(filtered.length);
  }, [active, filtered.length, onFilteredCountChange]);

  const listEmpty = listLoading ? (
    <View style={[styles.center, { flex: undefined, paddingVertical: 48 }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  ) : listError ? (
    <View style={[styles.center, { flex: undefined, paddingVertical: 32 }]}>
      <Text style={styles.err}>{t("workOrders.loadError")}</Text>
      <HapticPressable
        onPress={() => void refetchList()}
        {...androidRippleProps(rowRipple, true)}
        style={({ pressed }) => [styles.retry, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
      >
        <Text style={styles.retryText}>Retry</Text>
      </HapticPressable>
    </View>
  ) : (
    <Text style={styles.empty}>{t("workOrders.empty")}</Text>
  );

  return (
    <FlatList
      style={styles.list}
      data={filtered}
      keyExtractor={(item) => item.id}
      extraData={listFetching}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={listEmpty}
      contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
      renderItem={renderItem}
    />
  );
}

export default function WorkOrdersListScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ filterAssetId?: string | string[]; filterAssetKey?: string | string[] }>();
  const qc = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const athene = useAtheneAssistant();
  const { user } = useAuth();
  const rowRipple = surfaceRippleColor(isDark);
  const [searchByIndex, setSearchByIndex] = useState<Record<number, string>>({});
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [tempAssetFilter, setTempAssetFilter] = useState<TempAssetFilter | null>(null);
  const [activeFilteredCount, setActiveFilteredCount] = useState<number | null>(null);
  const [detailsPresetId, setDetailsPresetId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrderRow | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackEntryMode, setFeedbackEntryMode] = useState<"create" | "pause" | "stop">("create");
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [headerRefreshPending, setHeaderRefreshPending] = useState(false);
  const pagerRef = useRef<PagerView>(null);
  const appliedInitialPresetRef = useRef(false);
  const consumedFilterAssetIdRef = useRef<string | null>(null);

  const bootstrap = useWorkOrderSearchPresetsBootstrapQuery();
  const presets = bootstrap.data?.presets ?? [];
  const hasPresets = Boolean(bootstrap.isSuccess && presets.length > 0);

  const initialActiveIndex = useMemo(() => {
    const mob = bootstrap.data?.defaults.mobilePresetId;
    if (!mob || !hasPresets) return 0;
    const idx = presets.findIndex((p) => isSamePresetId(p.id, mob));
    return idx >= 0 ? idx + 1 : 0;
  }, [bootstrap.data?.defaults.mobilePresetId, hasPresets, presets]);

  const filterAssetIdParam = useMemo(() => {
    const raw = params.filterAssetId;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) return raw[0].trim();
    return null;
  }, [params.filterAssetId]);

  const filterAssetKeyParam = useMemo(() => {
    const raw = params.filterAssetKey;
    if (typeof raw === "string") return raw.trim();
    if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
    return "";
  }, [params.filterAssetKey]);

  useEffect(() => {
    if (!filterAssetIdParam) {
      consumedFilterAssetIdRef.current = null;
      return;
    }
    if (consumedFilterAssetIdRef.current === filterAssetIdParam) return;
    consumedFilterAssetIdRef.current = filterAssetIdParam;
    appliedInitialPresetRef.current = true;
    setTempAssetFilter({ id: filterAssetIdParam, key: filterAssetKeyParam });
    setActivePresetIndex(0);
    pagerRef.current?.setPage(0);
    router.setParams({ filterAssetId: undefined, filterAssetKey: undefined });
  }, [filterAssetIdParam, filterAssetKeyParam, router]);

  useEffect(() => {
    if (appliedInitialPresetRef.current || filterAssetIdParam) return;
    if (!bootstrap.isSuccess) return;
    appliedInitialPresetRef.current = true;
    if (hasPresets) {
      setActivePresetIndex(initialActiveIndex);
      pagerRef.current?.setPage(initialActiveIndex);
    }
  }, [bootstrap.isSuccess, filterAssetIdParam, hasPresets, initialActiveIndex]);

  const q = searchByIndex[activePresetIndex] ?? "";
  const setQ = useCallback(
    (value: string) => {
      setSearchByIndex((prev) => ({ ...prev, [activePresetIndex]: value }));
    },
    [activePresetIndex],
  );

  const selectPresetIndex = useCallback((index: number) => {
    setTempAssetFilter(null);
    setActivePresetIndex(index);
    pagerRef.current?.setPage(index);
  }, []);

  const onPagerPageSelected = useCallback((position: number) => {
    if (position !== 0) setTempAssetFilter(null);
    setActivePresetIndex(position);
  }, []);

  const clearTempAssetFilter = useCallback(() => {
    setTempAssetFilter(null);
  }, []);

  const onFilteredCountChange = useCallback((count: number) => {
    setActiveFilteredCount(count);
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        stickyHeader: {
          backgroundColor: colors.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        list: { flex: 1 },
        center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
        err: { color: colors.primary, marginBottom: 12 },
        retry: { padding: 12 },
        retryText: { color: colors.primary, fontWeight: "600" },
        searchWrap: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 16,
          marginTop: 4,
          marginBottom: 12,
          paddingHorizontal: 12,
          height: 40,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        search: { flex: 1, fontSize: 15, color: colors.onSurface },
        row: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
          flexDirection: "row",
          alignItems: "stretch",
        },
        rowMainPressable: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          paddingLeft: 16,
          paddingRight: 8,
        },
        rowActionSide: {
          flexDirection: "row",
          alignItems: "center",
          paddingRight: 8,
          gap: 4,
        },
        rowActionBtn: {
          minWidth: 34,
          minHeight: 34,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
        },
        rowMain: { flex: 1 },
        rowChevron: {
          minWidth: 26,
          minHeight: 34,
          alignItems: "center",
          justifyContent: "center",
        },
        keyRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
        key: { fontSize: 13, fontWeight: "700", color: colors.primary },
        statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
        statusPillText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
        name: { fontSize: 16, fontWeight: "600", color: colors.onSurface, marginTop: 2 },
        type: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
        empty: { textAlign: "center", color: colors.onSurfaceVariant, marginTop: 32 },
        emptyList: { flexGrow: 1 },
        newBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
        newBtnText: { fontSize: 14, fontWeight: "700", color: colors.primary },
        docChip: {
          flexDirection: "row",
          alignItems: "center",
          gap: 3,
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 5,
        },
        docChipBlue: { backgroundColor: "rgb(103,232,249)" },
        docChipGreen: { backgroundColor: "rgb(134,239,172)" },
        inspectionChip: { backgroundColor: "rgb(252,211,77)" },
        docChipText: { color: "rgb(15,23,42)", fontWeight: "700", fontSize: 11 },
      }),
    [
      colors.background,
      colors.border,
      colors.onSurface,
      colors.onSurfaceVariant,
      colors.primary,
      colors.surface,
    ],
  );

  const bootstrapReady = bootstrap.isSuccess;

  const refetchLists = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: [...queryKeys.workOrders] });
    await bootstrap.refetch();
  }, [bootstrap, qc]);

  const refreshFromHeader = useCallback(async () => {
    setHeaderRefreshPending(true);
    try {
      await refetchLists();
    } finally {
      setHeaderRefreshPending(false);
    }
  }, [refetchLists]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("workOrders.appName"),
      headerRight: () => (
        <ShellHeaderActions
          extra={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <HapticPressable
                onPress={() => void refreshFromHeader()}
                {...androidRippleProps(rowRipple, true)}
                style={({ pressed }) => [styles.rowActionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                accessibilityRole="button"
                accessibilityLabel="Refresh"
              >
                {headerRefreshPending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <RefreshCw size={20} color={colors.primary} />
                )}
              </HapticPressable>
              <HapticPressable
                onPress={() => router.push("/work-orders/new")}
                {...androidRippleProps(rowRipple, true)}
                style={({ pressed }) => [styles.newBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              >
                <Plus size={22} color={colors.primary} />
                <Text style={styles.newBtnText}>{t("workOrders.new")}</Text>
              </HapticPressable>
            </View>
          }
        />
      ),
    });
  }, [
    colors.primary,
    headerRefreshPending,
    navigation,
    refreshFromHeader,
    router,
    rowRipple,
    styles.newBtn,
    styles.newBtnText,
    styles.rowActionBtn,
    t,
  ]);

  const load = useCallback(async () => {
    await refetchLists();
  }, [refetchLists]);

  useFocusEffect(
    useCallback(() => {
      void refetchLists();
    }, [refetchLists]),
  );

  const startOrder = useCallback(
    async (row: WorkOrderRow) => {
      try {
        await postWorkOrderStart(row.id);
        await load();
      } catch (err) {
        const code = err instanceof WorkOrderActionError ? err.code : "unknown";
        const msg = code === "cannot_start_from_status" ? t("workOrders.cannotStartFromStatus") : t("workOrders.startError");
        Alert.alert("", msg);
      }
    },
    [load, t],
  );

  const submitFeedback = useCallback(
    async (body: WorkOrderFeedbackBody) => {
      if (!selectedOrder) return false;
      setFeedbackSaving(true);
      try {
        await postWorkOrderFeedback(selectedOrder.id, body);
        await load();
        Alert.alert("", t("workOrders.feedbackSaved"));
        return true;
      } catch (err) {
        const code = err instanceof WorkOrderActionError ? err.code : "unknown";
        const msg =
          code === "cannot_feedback_from_status"
            ? t("workOrders.cannotFeedbackFromStatus")
            : code === "pause_remark_required"
              ? t("workOrders.pauseRemarkRequired")
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
    [load, selectedOrder, t],
  );

  const openActions = useCallback((row: WorkOrderRow) => {
    setSelectedOrder(row);
    setActionsOpen(true);
  }, []);

  const openPresetDetails = useCallback((presetId: string) => {
    setDetailsPresetId(presetId);
    setDetailsOpen(true);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: WorkOrderRow }) => (
      <View style={styles.row}>
        <HapticPressable
          {...androidRippleProps(rowRipple)}
          style={({ pressed }) => [styles.rowMainPressable, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
          onLongPress={() => openActions(item)}
          delayLongPress={180}
          onPress={() => router.push({ pathname: "/work-orders/[id]", params: { id: item.id } })}
        >
          <View style={styles.rowMain}>
            <View style={styles.keyRow}>
              <Text style={styles.key}>{item.orderNumber}</Text>
              <View style={[styles.statusPill, { backgroundColor: workOrderStatusBackground(item.status) }]}>
                <Text style={[styles.statusPillText, { color: workOrderStatusForeground(item.status) }]}>
                  {t(`workOrders.statusValues.${item.status}`)}
                </Text>
              </View>
              {(() => {
                const own = item.documentCount;
                const asset = item.assetDocumentCount;
                const total = own + asset;
                if (total === 0) return null;
                const isAssetOnly = own === 0 && asset > 0;
                return (
                  <View style={[styles.docChip, isAssetOnly ? styles.docChipGreen : styles.docChipBlue]}>
                    <FileText size={13} color="rgb(15,23,42)" />
                    <Text style={styles.docChipText}>{total}</Text>
                  </View>
                );
              })()}
              {(() => {
                const inspectionPointCount = item.inspectionPointCount ?? 0;
                const checkedInspectionPointCount = item.checkedInspectionPointCount ?? 0;
                const hasInspectionRound = Boolean(item.inspectionRoundId);
                if (!hasInspectionRound && inspectionPointCount === 0) return null;
                const badge =
                  inspectionPointCount > 0
                    ? `${checkedInspectionPointCount}/${inspectionPointCount}`
                    : "0";
                return (
                  <View style={[styles.docChip, styles.inspectionChip]}>
                    <CheckSquare size={13} color="rgb(15,23,42)" />
                    <Text style={styles.docChipText}>{badge}</Text>
                  </View>
                );
              })()}
            </View>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.type}>
              {item.assetKey} — {item.assetName}
            </Text>
            {item.inspectionRoundName || item.inspectionRoundKey ? (
              <Text style={styles.type}>
                {t("workOrders.inspectionRoundSubtitle", {
                  name: item.inspectionRoundName || item.inspectionRoundKey,
                })}
              </Text>
            ) : null}
            <Text style={styles.type}>
              {t(`workOrders.typeValues.${item.orderType}`)} ·{" "}
              {new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
                new Date(item.plannedStart),
              )}
            </Text>
          </View>
        </HapticPressable>
        <View style={styles.rowActionSide}>
          <HapticPressable
            {...androidRippleProps(rowRipple, true)}
            style={({ pressed }) => [styles.rowActionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            onPress={() => openActions(item)}
          >
            <MoreVertical size={20} color={colors.onSurfaceVariant} />
          </HapticPressable>
          <HapticPressable
            {...androidRippleProps(rowRipple, true)}
            style={({ pressed }) => [styles.rowChevron, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            onPress={() => router.push({ pathname: "/work-orders/[id]", params: { id: item.id } })}
          >
            <ChevronRight size={22} color={colors.onSurfaceVariant} />
          </HapticPressable>
        </View>
      </View>
    ),
    [
      colors.onSurfaceVariant,
      i18n.language,
      openActions,
      router,
      rowRipple,
      styles,
      t,
    ],
  );

  if (bootstrap.isPending || bootstrap.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (bootstrap.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{t("workOrders.presetsLoadError")}</Text>
        <HapticPressable
          onPress={() => void bootstrap.refetch()}
          {...androidRippleProps(rowRipple, true)}
          style={({ pressed }) => [styles.retry, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </HapticPressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.stickyHeader}>
        {hasPresets || tempAssetFilter ? (
          <WorkOrderFilterPills
            presets={presets}
            activeIndex={activePresetIndex}
            onSelect={selectPresetIndex}
            onShowDetails={openPresetDetails}
            tempAssetFilter={tempAssetFilter}
            onClearTempFilter={clearTempAssetFilter}
            activeCount={activeFilteredCount}
          />
        ) : null}
        <View style={styles.searchWrap}>
          <Search size={20} color={colors.onSurfaceVariant} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("workOrders.searchPlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            style={styles.search}
          />
        </View>
      </View>
      {hasPresets ? (
        <PagerView
          ref={pagerRef}
          style={styles.list}
          initialPage={initialActiveIndex}
          onPageSelected={(e) => onPagerPageSelected(e.nativeEvent.position)}
        >
          <View key="__all_work_orders__" collapsable={false} style={styles.list}>
            <WorkOrdersListPage
              pageIndex={0}
              active={activePresetIndex === 0}
              presets={presets}
              bootstrapReady={bootstrapReady}
              searchQ={searchByIndex[0] ?? ""}
              tempAssetId={tempAssetFilter?.id ?? null}
              styles={styles}
              renderItem={renderItem}
              t={t}
              onFilteredCountChange={onFilteredCountChange}
            />
          </View>
          {presets.map((preset, i) => {
            const pageIndex = i + 1;
            return (
              <View key={preset.id} collapsable={false} style={styles.list}>
                <WorkOrdersListPage
                  pageIndex={pageIndex}
                  active={activePresetIndex === pageIndex}
                  presets={presets}
                  bootstrapReady={bootstrapReady}
                  searchQ={searchByIndex[pageIndex] ?? ""}
                  tempAssetId={null}
                  styles={styles}
                  renderItem={renderItem}
                  t={t}
                  onFilteredCountChange={onFilteredCountChange}
                />
              </View>
            );
          })}
        </PagerView>
      ) : (
        <WorkOrdersListPage
          pageIndex={0}
          active
          presets={presets}
          bootstrapReady={bootstrapReady}
          searchQ={searchByIndex[0] ?? ""}
          tempAssetId={tempAssetFilter?.id ?? null}
          styles={styles}
          renderItem={renderItem}
          t={t}
          onFilteredCountChange={onFilteredCountChange}
        />
      )}
      <WorkOrderPresetDetailsSheet
        visible={detailsOpen}
        presetId={detailsPresetId}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsPresetId(null);
        }}
      />
      <WorkOrderActionsSheet
        visible={actionsOpen}
        status={selectedOrder?.status ?? null}
        showInspectionPoints={
          Boolean(selectedOrder?.inspectionRoundId) || (selectedOrder?.inspectionPointCount ?? 0) > 0
        }
        onClose={() => setActionsOpen(false)}
        atheneBusy={athene.busy}
        onOpenInspectionPoints={() => {
          if (!selectedOrder) return;
          router.push({
            pathname: "/work-orders/inspection-points/[id]",
            params: { id: selectedOrder.id },
          });
        }}
        onAskAthene={() => {
          if (!selectedOrder) return;
          athene.openWithContext({
            type: "workOrder",
            id: selectedOrder.id,
            label: `#${selectedOrder.orderNumber} - ${selectedOrder.name}`,
            data: {
              orderNumber: selectedOrder.orderNumber,
              name: selectedOrder.name,
              status: selectedOrder.status,
              siteId: selectedOrder.siteId,
              siteKey: selectedOrder.siteKey,
              assetId: selectedOrder.assetId,
              assetKey: selectedOrder.assetKey,
            },
          });
        }}
        onStart={() => {
          if (!selectedOrder || !canStartWorkOrder(selectedOrder.status)) return;
          void startOrder(selectedOrder);
        }}
        onPause={() => {
          if (!selectedOrder || !canPauseWorkOrder(selectedOrder.status)) return;
          setActionsOpen(false);
          setFeedbackEntryMode("pause");
          setFeedbackOpen(true);
        }}
        onStop={() => {
          if (!selectedOrder || !canFeedbackWorkOrder(selectedOrder.status)) return;
          setActionsOpen(false);
          setFeedbackEntryMode("stop");
          setFeedbackOpen(true);
        }}
        onFeedback={() => {
          if (!selectedOrder || !canFeedbackWorkOrder(selectedOrder.status)) return;
          setActionsOpen(false);
          setFeedbackEntryMode("create");
          setFeedbackOpen(true);
        }}
      />
      <WorkOrderFeedbackModal
        visible={feedbackOpen}
        saving={feedbackSaving}
        entryMode={feedbackEntryMode}
        segmentStartedAt={selectedOrder?.currentSegmentStartedAt ?? null}
        reportingEmployeeLabel={
          [user?.employeeKey, user?.employeeName]
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean)
            .join(" — ") || t("workOrders.feedbackReportingEmployeeEmpty")
        }
        order={
          selectedOrder
            ? {
                id: selectedOrder.id,
                orderNumber: selectedOrder.orderNumber,
                name: selectedOrder.name,
                status: selectedOrder.status,
                siteId: selectedOrder.siteId,
                siteKey: selectedOrder.siteKey,
                assetId: selectedOrder.assetId,
                assetKey: selectedOrder.assetKey,
                assetName: selectedOrder.assetName,
                assetClassificationId: selectedOrder.assetClassificationId ?? null,
                orderType: selectedOrder.orderType,
                problemId: selectedOrder.problemId ?? null,
                causeId: selectedOrder.causeId ?? null,
                remedyId: selectedOrder.remedyId ?? null,
              }
            : null
        }
        onClose={() => setFeedbackOpen(false)}
        onSubmit={submitFeedback}
      />
    </View>
  );
}
