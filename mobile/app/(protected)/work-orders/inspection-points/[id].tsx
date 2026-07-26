import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { HapticPressable } from "../../../../src/components/HapticPressable";
import {
  usePatchWorkOrderInspectionPointMutation,
  useWorkOrderInspectionPointsQuery,
} from "../../../../src/hooks/queries";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_ROW,
  surfaceRippleColor,
} from "../../../../src/styles/pressableFeedback";
import { useAppTheme } from "../../../../src/theme/AppThemeContext";
import type { WorkOrderInspectionPointRow } from "../../../../src/types/api";

function formatPos(pos: number): string {
  return String(pos).padStart(4, "0");
}

export default function WorkOrderInspectionPointsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";
  const { t, i18n } = useTranslation();
  const { colors, isDark, radii } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const pointsQuery = useWorkOrderInspectionPointsQuery(orderId || null);
  const patchMutation = usePatchWorkOrderInspectionPointMutation(orderId || null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        center: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: colors.background,
        },
        centerText: { color: colors.onSurfaceVariant, textAlign: "center", marginTop: 12 },
        errText: { color: colors.onSurface, textAlign: "center" },
        list: { padding: 12, paddingBottom: 32 },
        row: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          marginBottom: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: radii.sm,
          backgroundColor: colors.surface,
        },
        rowDisabled: { opacity: 0.55 },
        switchWrap: { paddingTop: 2 },
        body: { flex: 1, minWidth: 0 },
        titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 8 },
        pos: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceVariant, fontVariant: ["tabular-nums"] },
        name: { fontSize: 15, fontWeight: "600", color: colors.onSurface, flexShrink: 1 },
        meta: { marginTop: 4, fontSize: 12, color: colors.onSurfaceVariant },
        checkedMeta: { marginTop: 4, fontSize: 11, color: colors.onSurfaceVariant },
      }),
    [colors.background, colors.border, colors.onSurface, colors.onSurfaceVariant, colors.surface, radii.sm],
  );

  const onToggle = useCallback(
    async (row: WorkOrderInspectionPointRow, checked: boolean) => {
      if (!orderId || togglingId) return;
      setTogglingId(row.id);
      try {
        await patchMutation.mutateAsync({ pointId: row.id, checked });
      } catch {
        Alert.alert(t("workOrders.inspectionPointsSaveError"));
      } finally {
        setTogglingId(null);
      }
    },
    [orderId, patchMutation, t, togglingId],
  );

  const renderItem = useCallback(
    ({ item }: { item: WorkOrderInspectionPointRow }) => {
      const busy = togglingId === item.id;
      const assetLabelText =
        item.assetKey && item.assetName
          ? `${item.assetKey} – ${item.assetName}`
          : item.assetKey || item.assetName || null;
      const pointLabelText =
        item.inspectionPointKey && item.inspectionPointName
          ? `${item.inspectionPointKey} – ${item.inspectionPointName}`
          : item.inspectionPointKey || item.inspectionPointName || null;
      const checkedAtText =
        item.checked && item.checkedAt
          ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
              new Date(item.checkedAt),
            )
          : null;

      return (
        <HapticPressable
          disabled={Boolean(togglingId)}
          {...androidRippleProps(ripple)}
          style={({ pressed }) => [
            styles.row,
            busy && styles.rowDisabled,
            !togglingId && pressedOpacity(pressed, PRESSED_OPACITY_ROW),
          ]}
          onPress={() => void onToggle(item, !item.checked)}
        >
          <View style={styles.switchWrap} pointerEvents="none">
            <Switch value={item.checked} disabled={Boolean(togglingId)} />
          </View>
          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text style={styles.pos}>
                {t("workOrders.inspectionPointPos")} {formatPos(item.pos)}
              </Text>
              <Text style={styles.name}>{item.name}</Text>
            </View>
            {assetLabelText ? (
              <Text style={styles.meta}>
                {t("workOrders.inspectionPointAsset")}: {assetLabelText}
              </Text>
            ) : null}
            {pointLabelText ? (
              <Text style={styles.meta}>
                {t("workOrders.inspectionPointMaster")}: {pointLabelText}
              </Text>
            ) : null}
            {item.checked && item.checkedByLoginName ? (
              <Text style={styles.checkedMeta}>
                {item.checkedByLoginName}
                {checkedAtText ? ` · ${checkedAtText}` : ""}
              </Text>
            ) : null}
          </View>
        </HapticPressable>
      );
    },
    [i18n.language, onToggle, ripple, styles, t, togglingId],
  );

  if (!orderId) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{t("workOrders.inspectionPointsLoadError")}</Text>
      </View>
    );
  }

  if (pointsQuery.isPending || pointsQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.centerText}>{t("workOrders.inspectionPointsLoading")}</Text>
      </View>
    );
  }

  if (pointsQuery.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{t("workOrders.inspectionPointsLoadError")}</Text>
      </View>
    );
  }

  const rows = pointsQuery.data ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, rows.length === 0 ? { flexGrow: 1 } : null]}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.centerText}>{t("workOrders.inspectionPointsEmpty")}</Text>
          </View>
        }
      />
    </View>
  );
}
