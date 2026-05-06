import { MaterialIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import PagerView from "react-native-pager-view";

import { ShellHeaderActions } from "../../../src/components/ShellHeaderActions";
import { WorkOrderActionsSheet } from "../../../src/components/WorkOrderActionsSheet";
import { WorkOrderFeedbackModal } from "../../../src/components/WorkOrderFeedbackModal";
import {
  WorkOrderActionError,
  postWorkOrderFeedback,
  postWorkOrderPause,
  postWorkOrderStart,
  queryKeys,
  useWorkOrderSearchPresetsBootstrapQuery,
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
import type {
  WorkOrderSearchPresetDefaults,
  WorkOrderSearchPresetListItem,
} from "../../../src/lib/workOrderSearchPresetsApi";
import type { WorkOrderRow } from "../../../src/types/api";

type AllTabPageProps = {
  filtered: WorkOrderRow[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  q: string;
  setQ: (v: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles: any;
  colors: { onSurfaceVariant: string; primary: string };
  rowRipple: string;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslation>["t"];
  i18n: ReturnType<typeof useTranslation>["i18n"];
  openActions: (row: WorkOrderRow) => void;
};

/** Unfiltered work orders (same data as web default list). */
function WorkOrdersAllTabPage({
  filtered,
  isLoading,
  isError,
  refetch,
  q,
  setQ,
  styles,
  colors,
  rowRipple,
  router,
  t,
  i18n,
  openActions,
}: AllTabPageProps) {
  if (isLoading && filtered.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{t("workOrders.loadError")}</Text>
        <Pressable
          onPress={() => void refetch()}
          {...androidRippleProps(rowRipple, true)}
          style={({ pressed }) => [styles.retry, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.searchWrap}>
          <MaterialIcons name="search" size={20} color={colors.onSurfaceVariant} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("workOrders.searchPlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            style={styles.search}
          />
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>{t("workOrders.empty")}</Text>}
      contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Pressable
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
                  const isAssetOnly = own === 0 && asset > 0;
                  return (
                    <View
                      style={[
                        styles.docChip,
                        total === 0 ? styles.docChipMuted : isAssetOnly ? styles.docChipGreen : styles.docChipBlue,
                      ]}
                    >
                      <MaterialIcons
                        name="description"
                        size={13}
                        color={total === 0 ? "rgb(125,211,252)" : "rgb(15,23,42)"}
                      />
                      {total > 0 ? <Text style={styles.docChipText}>{total}</Text> : null}
                    </View>
                  );
                })()}
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>
                {item.assetKey} — {item.assetName}
              </Text>
              <Text style={styles.type}>
                {t(`workOrders.typeValues.${item.orderType}`)} ·{" "}
                {new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
                  new Date(item.plannedStart),
                )}
              </Text>
            </View>
          </Pressable>
          <View style={styles.rowActionSide}>
            <Pressable
              {...androidRippleProps(rowRipple, true)}
              style={({ pressed }) => [styles.rowActionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              onPress={() => openActions(item)}
            >
              <MaterialIcons name="more-vert" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
            <Pressable
              {...androidRippleProps(rowRipple, true)}
              style={({ pressed }) => [styles.rowChevron, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              onPress={() => router.push({ pathname: "/work-orders/[id]", params: { id: item.id } })}
            >
              <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}

type PresetPageProps = {
  presetId: string;
  active: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- StyleSheet.create return type is too wide for child props
  styles: any;
  colors: { onSurfaceVariant: string; primary: string };
  rowRipple: string;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslation>["t"];
  i18n: ReturnType<typeof useTranslation>["i18n"];
  openActions: (row: WorkOrderRow) => void;
};

function WorkOrdersPresetPage({
  presetId,
  active,
  styles,
  colors,
  rowRipple,
  router,
  t,
  i18n,
  openActions,
}: PresetPageProps) {
  const [q, setQ] = useState("");
  const { data = [], isLoading, isError, refetch, isFetching } = useWorkOrdersByPresetQuery(presetId, active);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((row) =>
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
  }, [data, q, t]);

  if (isLoading && data.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{t("workOrders.loadError")}</Text>
        <Pressable
          onPress={() => void refetch()}
          {...androidRippleProps(rowRipple, true)}
          style={({ pressed }) => [styles.retry, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      extraData={isFetching}
      ListHeaderComponent={
        <View style={styles.searchWrap}>
          <MaterialIcons name="search" size={20} color={colors.onSurfaceVariant} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("workOrders.searchPlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            style={styles.search}
          />
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>{t("workOrders.empty")}</Text>}
      contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Pressable
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
                  const isAssetOnly = own === 0 && asset > 0;
                  return (
                    <View
                      style={[
                        styles.docChip,
                        total === 0 ? styles.docChipMuted : isAssetOnly ? styles.docChipGreen : styles.docChipBlue,
                      ]}
                    >
                      <MaterialIcons
                        name="description"
                        size={13}
                        color={total === 0 ? "rgb(125,211,252)" : "rgb(15,23,42)"}
                      />
                      {total > 0 ? <Text style={styles.docChipText}>{total}</Text> : null}
                    </View>
                  );
                })()}
              </View>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>
                {item.assetKey} — {item.assetName}
              </Text>
              <Text style={styles.type}>
                {t(`workOrders.typeValues.${item.orderType}`)} ·{" "}
                {new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
                  new Date(item.plannedStart),
                )}
              </Text>
            </View>
          </Pressable>
          <View style={styles.rowActionSide}>
            <Pressable
              {...androidRippleProps(rowRipple, true)}
              style={({ pressed }) => [styles.rowActionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              onPress={() => openActions(item)}
            >
              <MaterialIcons name="more-vert" size={20} color={colors.onSurfaceVariant} />
            </Pressable>
            <Pressable
              {...androidRippleProps(rowRipple, true)}
              style={({ pressed }) => [styles.rowChevron, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              onPress={() => router.push({ pathname: "/work-orders/[id]", params: { id: item.id } })}
            >
              <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}

type PresetPagerProps = {
  presets: WorkOrderSearchPresetListItem[];
  defaults: WorkOrderSearchPresetDefaults;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  styles: any;
  colors: { onSurfaceVariant: string; primary: string };
  rowRipple: string;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslation>["t"];
  i18n: ReturnType<typeof useTranslation>["i18n"];
  openActions: (row: WorkOrderRow) => void;
  onActiveIndexChange: (index: number) => void;
  allTab: {
    filtered: WorkOrderRow[];
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
    q: string;
    setQ: (v: string) => void;
  };
};

function WorkOrdersPresetPager({
  presets,
  defaults,
  styles,
  colors,
  rowRipple,
  router,
  t,
  i18n,
  openActions,
  onActiveIndexChange,
  allTab,
}: PresetPagerProps) {
  /** Page 0 = unfiltered „Aufträge“; pages 1..n = presets in API order. */
  const initialPage = useMemo(() => {
    const mob = defaults.mobilePresetId;
    if (!mob) return 0;
    const idx = presets.findIndex((p) => isSamePresetId(p.id, mob));
    return idx >= 0 ? idx + 1 : 0;
  }, [presets, defaults.mobilePresetId]);

  const [activeIndex, setActiveIndex] = useState(initialPage);

  useLayoutEffect(() => {
    onActiveIndexChange(initialPage);
  }, [initialPage, onActiveIndexChange]);

  return (
    <PagerView
      style={{ flex: 1 }}
      initialPage={initialPage}
      onPageSelected={(e) => {
        const i = e.nativeEvent.position;
        setActiveIndex(i);
        onActiveIndexChange(i);
      }}
    >
      <View key="__all_work_orders__" collapsable={false} style={{ flex: 1 }}>
        <WorkOrdersAllTabPage
          filtered={allTab.filtered}
          isLoading={allTab.isLoading}
          isError={allTab.isError}
          refetch={allTab.refetch}
          q={allTab.q}
          setQ={allTab.setQ}
          styles={styles}
          colors={colors}
          rowRipple={rowRipple}
          router={router}
          t={t}
          i18n={i18n}
          openActions={openActions}
        />
      </View>
      {presets.map((p, i) => (
        <View key={p.id} collapsable={false} style={{ flex: 1 }}>
          <WorkOrdersPresetPage
            presetId={p.id}
            active={activeIndex === i + 1}
            styles={styles}
            colors={colors}
            rowRipple={rowRipple}
            router={router}
            t={t}
            i18n={i18n}
            openActions={openActions}
          />
        </View>
      ))}
    </PagerView>
  );
}

export default function WorkOrdersListScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const rowRipple = surfaceRippleColor(isDark);
  const [q, setQ] = useState("");
  const [activePresetIndex, setActivePresetIndex] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrderRow | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  /** Header refresh icon: only manual tap (not background refetchInterval / focus), avoids stuck spinner. */
  const [headerRefreshPending, setHeaderRefreshPending] = useState(false);

  const bootstrap = useWorkOrderSearchPresetsBootstrapQuery();
  const presets = bootstrap.data?.presets ?? [];
  const hasPresets = Boolean(bootstrap.isSuccess && presets.length > 0);

  const allOrdersQuery = useWorkOrdersQuery({
    enabled: bootstrap.isSuccess && (!hasPresets || activePresetIndex === 0),
  });
  const { data: allData = [], isLoading: allLoading, isError: allError, isFetching: allFetching, refetch: refetchAll } =
    allOrdersQuery;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
        err: { color: colors.primary, marginBottom: 12 },
        retry: { padding: 12 },
        retryText: { color: colors.primary, fontWeight: "600" },
        searchWrap: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 16,
          marginVertical: 12,
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
        docChipMuted: { backgroundColor: "transparent" },
        docChipText: { color: "rgb(15,23,42)", fontWeight: "700", fontSize: 11 },
        swipeHintBar: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        swipeHintText: {
          flex: 1,
          fontSize: 12,
          color: colors.onSurfaceVariant,
          fontWeight: "500",
        },
        swipeDots: { flexDirection: "row", alignItems: "center", gap: 5 },
        swipeDot: {
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.border,
        },
        swipeDotActive: {
          backgroundColor: colors.primary,
          width: 8,
          height: 8,
          borderRadius: 4,
        },
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
    const title =
      hasPresets && activePresetIndex > 0
        ? (presets[activePresetIndex - 1]?.name ?? t("workOrders.appName"))
        : t("workOrders.appName");
    navigation.setOptions({
      title,
      headerRight: () => (
        <ShellHeaderActions
          extra={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => void refreshFromHeader()}
                {...androidRippleProps(rowRipple, true)}
                style={({ pressed }) => [styles.rowActionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                accessibilityRole="button"
                accessibilityLabel="Refresh"
              >
                {headerRefreshPending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons name="refresh" size={20} color={colors.primary} />
                )}
              </Pressable>
              <Pressable
                onPress={() => router.push("/work-orders/new")}
                {...androidRippleProps(rowRipple, true)}
                style={({ pressed }) => [styles.newBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              >
                <MaterialIcons name="add" size={22} color={colors.primary} />
                <Text style={styles.newBtnText}>{t("workOrders.new")}</Text>
              </Pressable>
            </View>
          }
        />
      ),
    });
  }, [
    colors.primary,
    headerRefreshPending,
    activePresetIndex,
    hasPresets,
    navigation,
    presets,
    refreshFromHeader,
    router,
    rowRipple,
    styles.newBtn,
    styles.newBtnText,
    styles.rowActionBtn,
    t,
  ]);

  const data = allData;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((row) =>
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
  }, [data, q, t]);

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

  const pauseOrder = useCallback(
    async (row: WorkOrderRow) => {
      try {
        await postWorkOrderPause(row.id);
        await load();
      } catch (err) {
        const code = err instanceof WorkOrderActionError ? err.code : "unknown";
        const msg = code === "cannot_pause_from_status" ? t("workOrders.cannotPauseFromStatus") : t("workOrders.pauseError");
        Alert.alert("", msg);
      }
    },
    [load, t],
  );

  const submitFeedback = useCallback(
    async (body: { hours: number; remark: string | null; completeOrder: boolean }) => {
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

  const onActivePresetIndexChange = useCallback((index: number) => {
    setActivePresetIndex(index);
  }, []);

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
        <Pressable
          onPress={() => void bootstrap.refetch()}
          {...androidRippleProps(rowRipple, true)}
          style={({ pressed }) => [styles.retry, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!hasPresets) {
    if (allLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (allError) {
      return (
        <View style={styles.center}>
          <Text style={styles.err}>{t("workOrders.loadError")}</Text>
          <Pressable
            onPress={() => void refetchAll()}
            {...androidRippleProps(rowRipple, true)}
            style={({ pressed }) => [styles.retry, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
  }

  const presetPageCount = presets.length + 1;

  return (
    <View style={styles.container}>
      {hasPresets && bootstrap.data ? (
        <>
          <View
            style={styles.swipeHintBar}
            accessible
            accessibilityLabel={t("workOrders.swipeSearchConfigsHint")}
          >
            <MaterialIcons name="swipe" size={20} color={colors.primary} importantForAccessibility="no" />
            <Text style={styles.swipeHintText} importantForAccessibility="no">
              {t("workOrders.swipeSearchConfigsHint")}
            </Text>
            <View style={styles.swipeDots} importantForAccessibility="no">
              {Array.from({ length: presetPageCount }, (_, i) => (
                <View
                  key={String(i)}
                  style={[styles.swipeDot, i === activePresetIndex ? styles.swipeDotActive : null]}
                />
              ))}
            </View>
          </View>
        <WorkOrdersPresetPager
          key={["all", ...presets.map((p) => p.id)].join("-")}
          presets={presets}
          defaults={bootstrap.data.defaults}
          styles={styles}
          colors={colors}
          rowRipple={rowRipple}
          router={router}
          t={t}
          i18n={i18n}
          openActions={openActions}
          onActiveIndexChange={onActivePresetIndexChange}
          allTab={{
            filtered,
            isLoading: allLoading,
            isError: allError,
            refetch: refetchAll,
            q,
            setQ,
          }}
        />
        </>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <View style={styles.searchWrap}>
              <MaterialIcons name="search" size={20} color={colors.onSurfaceVariant} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder={t("workOrders.searchPlaceholder")}
                placeholderTextColor={colors.onSurfaceVariant}
                style={styles.search}
              />
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>{t("workOrders.empty")}</Text>}
          contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
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
                      const isAssetOnly = own === 0 && asset > 0;
                      return (
                        <View
                          style={[
                            styles.docChip,
                            total === 0 ? styles.docChipMuted : isAssetOnly ? styles.docChipGreen : styles.docChipBlue,
                          ]}
                        >
                          <MaterialIcons
                            name="description"
                            size={13}
                            color={total === 0 ? "rgb(125,211,252)" : "rgb(15,23,42)"}
                          />
                          {total > 0 ? <Text style={styles.docChipText}>{total}</Text> : null}
                        </View>
                      );
                    })()}
                  </View>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.type}>
                    {item.assetKey} — {item.assetName}
                  </Text>
                  <Text style={styles.type}>
                    {t(`workOrders.typeValues.${item.orderType}`)} ·{" "}
                    {new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
                      new Date(item.plannedStart),
                    )}
                  </Text>
                </View>
              </Pressable>
              <View style={styles.rowActionSide}>
                <Pressable
                  {...androidRippleProps(rowRipple, true)}
                  style={({ pressed }) => [styles.rowActionBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                  onPress={() => openActions(item)}
                >
                  <MaterialIcons name="more-vert" size={20} color={colors.onSurfaceVariant} />
                </Pressable>
                <Pressable
                  {...androidRippleProps(rowRipple, true)}
                  style={({ pressed }) => [styles.rowChevron, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                  onPress={() => router.push({ pathname: "/work-orders/[id]", params: { id: item.id } })}
                >
                  <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
      <WorkOrderActionsSheet
        visible={actionsOpen}
        status={selectedOrder?.status ?? null}
        onClose={() => setActionsOpen(false)}
        onStart={() => {
          if (!selectedOrder || !canStartWorkOrder(selectedOrder.status)) return;
          void startOrder(selectedOrder);
        }}
        onPause={() => {
          if (!selectedOrder || !canPauseWorkOrder(selectedOrder.status)) return;
          void pauseOrder(selectedOrder);
        }}
        onFeedback={() => {
          if (!selectedOrder || !canFeedbackWorkOrder(selectedOrder.status)) return;
          setFeedbackOpen(true);
        }}
      />
      <WorkOrderFeedbackModal
        visible={feedbackOpen}
        saving={feedbackSaving}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={submitFeedback}
      />
    </View>
  );
}
