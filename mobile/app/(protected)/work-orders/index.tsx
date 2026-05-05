import { MaterialIcons } from "@expo/vector-icons";
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

import { ShellHeaderActions } from "../../../src/components/ShellHeaderActions";
import { WorkOrderActionsSheet } from "../../../src/components/WorkOrderActionsSheet";
import { WorkOrderFeedbackModal } from "../../../src/components/WorkOrderFeedbackModal";
import {
  WorkOrderActionError,
  postWorkOrderFeedback,
  postWorkOrderPause,
  postWorkOrderStart,
  useWorkOrdersQuery,
} from "../../../src/hooks/queries";
import { canFeedbackWorkOrder, canPauseWorkOrder, canStartWorkOrder } from "../../../src/lib/workOrderLifecycle";
import { workOrderStatusBackground, workOrderStatusForeground } from "../../../src/lib/workOrderStatusColors";
import type { WorkOrderRow } from "../../../src/types/api";
import { useAppTheme } from "../../../src/theme/AppThemeContext";

export default function WorkOrdersListScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const [q, setQ] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<WorkOrderRow | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const { data = [], isLoading, isError, isFetching, refetch } = useWorkOrdersQuery();

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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ShellHeaderActions
          extra={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => void refetch()}
                style={styles.rowActionBtn}
                accessibilityRole="button"
                accessibilityLabel="Refresh"
              >
                {isFetching ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons name="refresh" size={20} color={colors.primary} />
                )}
              </Pressable>
              <Pressable onPress={() => router.push("/work-orders/new")} style={styles.newBtn}>
                <MaterialIcons name="add" size={22} color={colors.primary} />
                <Text style={styles.newBtnText}>{t("workOrders.new")}</Text>
              </Pressable>
            </View>
          }
        />
      ),
    });
  }, [colors.primary, isFetching, navigation, refetch, router, styles.newBtn, styles.newBtnText, styles.rowActionBtn, t]);

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
    await refetch();
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const startOrder = useCallback(async (row: WorkOrderRow) => {
    try {
      await postWorkOrderStart(row.id);
      await load();
    } catch (err) {
      const code = err instanceof WorkOrderActionError ? err.code : "unknown";
      const msg = code === "cannot_start_from_status" ? t("workOrders.cannotStartFromStatus") : t("workOrders.startError");
      Alert.alert("", msg);
    }
  }, [load, t]);

  const pauseOrder = useCallback(async (row: WorkOrderRow) => {
    try {
      await postWorkOrderPause(row.id);
      await load();
    } catch (err) {
      const code = err instanceof WorkOrderActionError ? err.code : "unknown";
      const msg = code === "cannot_pause_from_status" ? t("workOrders.cannotPauseFromStatus") : t("workOrders.pauseError");
      Alert.alert("", msg);
    }
  }, [load, t]);

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

  if (isLoading) {
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
        <Pressable onPress={() => void refetch()} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
              style={({ pressed }) => [styles.rowMainPressable, pressed && { opacity: 0.9 }]}
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
              <Pressable style={({ pressed }) => [styles.rowActionBtn, pressed && { opacity: 0.85 }]} onPress={() => openActions(item)}>
                <MaterialIcons name="more-vert" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.rowChevron, pressed && { opacity: 0.85 }]}
                onPress={() => router.push({ pathname: "/work-orders/[id]", params: { id: item.id } })}
              >
                <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
              </Pressable>
            </View>
          </View>
        )}
      />
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
