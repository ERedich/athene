import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import type { DashboardOrderTypeCount } from "../../types/api";
import { chartColorForWorkOrderType } from "../../lib/dashboardOrderTypeColors";
import { HapticPressable } from "../HapticPressable";
import { androidRippleProps, PRESSED_OPACITY_ROW, pressedOpacity, surfaceRippleColor } from "../../styles/pressableFeedback";
import { useAppTheme } from "../../theme/AppThemeContext";

type Props = {
  total: number | null;
  byType: DashboardOrderTypeCount[];
  loading?: boolean;
  onPress?: () => void;
};

export function OrdersByTypeCard({ total, byType, loading, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, isDark, radii, space } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: radii.md,
          padding: space.md,
          gap: space.md,
        },
        header: {
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: space.sm,
        },
        title: {
          flex: 1,
          fontSize: 13,
          fontWeight: "600",
          color: colors.onSurfaceVariant,
        },
        total: {
          fontSize: 22,
          fontWeight: "700",
          color: colors.onSurface,
        },
        totalPlaceholder: {
          fontSize: 22,
          fontWeight: "700",
          color: colors.onSurfaceVariant,
          opacity: 0.35,
        },
        rows: { gap: space.sm },
        row: { gap: 6 },
        rowMeta: {
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: space.sm,
        },
        label: {
          flex: 1,
          fontSize: 13,
          fontWeight: "500",
          color: colors.onSurface,
        },
        count: {
          fontSize: 13,
          fontWeight: "600",
          color: colors.onSurfaceVariant,
        },
        track: {
          height: 8,
          borderRadius: 4,
          backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
          overflow: "hidden",
        },
        fill: {
          height: "100%",
          borderRadius: 4,
        },
        empty: {
          fontSize: 13,
          color: colors.onSurfaceVariant,
        },
      }),
    [
      colors.border,
      colors.onSurface,
      colors.onSurfaceVariant,
      colors.surface,
      isDark,
      radii.md,
      space.md,
      space.sm,
    ],
  );

  const maxCount = Math.max(1, ...byType.map((r) => r.count));

  const content = (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("dashboard.kpiOrdersByType")}</Text>
        {loading ? (
          <Text style={styles.totalPlaceholder}>—</Text>
        ) : (
          <Text style={styles.total}>{total ?? "—"}</Text>
        )}
      </View>

      {loading || byType.length === 0 ? (
        <Text style={styles.empty}>{loading ? "…" : t("dashboard.chartNoData")}</Text>
      ) : (
        <View style={styles.rows}>
          {byType.map((row) => {
            const key = `workOrders.typeValues.${row.orderType}`;
            const translated = t(key);
            const label = translated === key ? row.orderType : translated;
            const widthPct = Math.max(4, Math.round((row.count / maxCount) * 100));
            return (
              <View key={row.orderType} style={styles.row}>
                <View style={styles.rowMeta}>
                  <Text style={styles.label} numberOfLines={1}>
                    {label}
                  </Text>
                  <Text style={styles.count}>{row.count}</Text>
                </View>
                <View style={styles.track}>
                  <View
                    style={[
                      styles.fill,
                      {
                        width: `${widthPct}%`,
                        backgroundColor: chartColorForWorkOrderType(row.orderType),
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  if (!onPress) return content;

  return (
    <HapticPressable
      onPress={onPress}
      style={({ pressed }) => pressedOpacity(pressed, PRESSED_OPACITY_ROW)}
      {...androidRippleProps(surfaceRippleColor(isDark))}
    >
      {content}
    </HapticPressable>
  );
}
