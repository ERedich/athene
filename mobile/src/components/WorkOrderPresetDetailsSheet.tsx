import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { BottomSheetModal } from "./BottomSheetModal";
import { useWorkOrderSearchPresetDetailQuery } from "../hooks/queries";
import { buildWorkOrderPresetFilterLines } from "../lib/workOrderPresetFilterSummary";
import { useAppTheme } from "../theme/AppThemeContext";

type Props = {
  visible: boolean;
  presetId: string | null;
  onClose: () => void;
};

export function WorkOrderPresetDetailsSheet({ visible, presetId, onClose }: Props) {
  const { t } = useTranslation();
  const { colors, radii } = useAppTheme();
  const { data, isLoading, isError } = useWorkOrderSearchPresetDetailQuery(presetId ?? undefined, visible && Boolean(presetId));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radii.md,
          borderTopRightRadius: radii.md,
          maxHeight: "70%",
        },
        title: {
          padding: 16,
          fontSize: 16,
          fontWeight: "700",
          color: colors.onSurface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        content: { padding: 16, gap: 12 },
        center: { padding: 24, alignItems: "center" },
        err: { color: colors.primary, textAlign: "center" },
        sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceVariant, textTransform: "uppercase" },
        line: {
          paddingVertical: 8,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        lineLabel: { fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 2 },
        lineValue: { fontSize: 14, color: colors.onSurface, fontWeight: "600" },
        empty: { fontSize: 14, color: colors.onSurfaceVariant, textAlign: "center", paddingVertical: 8 },
      }),
    [colors.border, colors.onSurface, colors.onSurfaceVariant, colors.primary, colors.surface, radii.md],
  );

  const filterLines = useMemo(() => {
    if (!data?.payload) return [];
    return buildWorkOrderPresetFilterLines(data.payload, t);
  }, [data?.payload, t]);

  const quickSearch = data?.payload.quickSearch?.trim() ?? "";
  const hasQuickSearch = quickSearch.length > 0;
  const hasAdvanced = filterLines.length > 0;

  return (
    <BottomSheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <Text style={styles.title}>{data?.name ?? t("workOrders.filterDetailsTitle")}</Text>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.err}>{t("workOrders.filterDetailsLoadError")}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {hasQuickSearch ? (
            <View>
              <Text style={styles.sectionLabel}>{t("workOrders.filterDetailsQuickSearch")}</Text>
              <View style={styles.line}>
                <Text style={styles.lineValue}>{quickSearch}</Text>
              </View>
            </View>
          ) : null}
          {hasAdvanced ? (
            <View>
              <Text style={styles.sectionLabel}>{t("workOrders.filterDetailsTitle")}</Text>
              {filterLines.map((line) => (
                <View key={`${line.label}-${line.value}`} style={styles.line}>
                  <Text style={styles.lineLabel}>{line.label}</Text>
                  <Text style={styles.lineValue}>{line.value}</Text>
                </View>
              ))}
            </View>
          ) : !hasQuickSearch ? (
            <Text style={styles.empty}>{t("workOrders.filterDetailsEmpty")}</Text>
          ) : (
            <Text style={styles.empty}>{t("workOrders.filterDetailsEmpty")}</Text>
          )}
        </ScrollView>
      )}
    </BottomSheetModal>
  );
}
