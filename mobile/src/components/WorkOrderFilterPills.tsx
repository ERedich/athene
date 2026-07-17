import { X } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { HapticPressable } from "./HapticPressable";
import type { WorkOrderSearchPresetListItem } from "../lib/workOrderSearchPresetsApi";
import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_CONTROL, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

type TempAssetFilter = { id: string; key: string };

type Props = {
  presets: WorkOrderSearchPresetListItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onShowDetails: (presetId: string) => void;
  tempAssetFilter?: TempAssetFilter | null;
  onClearTempFilter?: () => void;
  /** Filtered list length for the currently active filter (after quick search). */
  activeCount?: number | null;
};

type PillLayout = { x: number; width: number };

const TEMP_PILL_LAYOUT_KEY = -1;
const PILL_MIN_HEIGHT = 32;

export function WorkOrderFilterPills({
  presets,
  activeIndex,
  onSelect,
  onShowDetails,
  tempAssetFilter = null,
  onClearTempFilter,
  activeCount = null,
}: Props) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const scrollRef = useRef<ScrollView>(null);
  const pillLayouts = useRef<Record<number, PillLayout>>({});
  const tempFilterActive = Boolean(tempAssetFilter);
  const showCount = activeCount != null && Number.isFinite(activeCount);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        scrollContent: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
        },
        pill: {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minHeight: PILL_MIN_HEIGHT,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        pillActive: {
          borderColor: colors.primary,
          backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(25,28,30,0.06)",
        },
        pillLabel: {
          flexShrink: 1,
          fontSize: 12,
          fontWeight: "600",
          color: colors.onSurfaceVariant,
          maxWidth: 160,
          lineHeight: 16,
        },
        pillLabelActive: { color: colors.primary, fontWeight: "700" },
        countBadge: {
          fontSize: 12,
          fontWeight: "700",
          color: colors.primary,
          lineHeight: 16,
          minWidth: 14,
          textAlign: "center",
        },
        clearBtn: {
          minWidth: 22,
          minHeight: 22,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 11,
        },
      }),
    [colors.background, colors.border, colors.onSurfaceVariant, colors.primary, colors.surface, isDark],
  );

  useEffect(() => {
    const key = tempFilterActive ? TEMP_PILL_LAYOUT_KEY : activeIndex;
    const layout = pillLayouts.current[key];
    if (!layout || !scrollRef.current) return;
    scrollRef.current.scrollTo({ x: Math.max(0, layout.x - 12), animated: true });
  }, [activeIndex, tempFilterActive]);

  const onPillLayout = (index: number) => (e: LayoutChangeEvent) => {
    pillLayouts.current[index] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
  };

  const allActive = activeIndex === 0 && !tempFilterActive;

  const countNode =
    showCount ? (
      <Text
        style={styles.countBadge}
        accessibilityLabel={t("workOrders.filterActiveCount", { count: activeCount })}
      >
        {activeCount}
      </Text>
    ) : null;

  return (
    <View style={styles.row}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {tempAssetFilter ? (
          <View onLayout={onPillLayout(TEMP_PILL_LAYOUT_KEY)} style={[styles.pill, styles.pillActive]}>
            <Text style={[styles.pillLabel, styles.pillLabelActive]} numberOfLines={1}>
              {t("workOrders.tempFilterAsset", { key: tempAssetFilter.key || tempAssetFilter.id })}
            </Text>
            {countNode}
            <HapticPressable
              onPress={() => onClearTempFilter?.()}
              {...androidRippleProps(ripple, true)}
              style={({ pressed }) => [styles.clearBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              accessibilityRole="button"
              accessibilityLabel={t("workOrders.tempFilterClear")}
              hitSlop={6}
            >
              <X size={14} color={colors.primary} strokeWidth={2.5} />
            </HapticPressable>
          </View>
        ) : null}

        <View onLayout={onPillLayout(0)}>
          <HapticPressable
            onPress={() => onSelect(0)}
            {...androidRippleProps(ripple, true)}
            style={({ pressed }) => [
              styles.pill,
              allActive ? styles.pillActive : null,
              pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: allActive }}
            accessibilityLabel={t("workOrders.filterAll")}
          >
            <Text style={[styles.pillLabel, allActive ? styles.pillLabelActive : null]} numberOfLines={1}>
              {t("workOrders.filterAll")}
            </Text>
            {allActive ? countNode : null}
          </HapticPressable>
        </View>

        {presets.map((preset, i) => {
          const index = i + 1;
          const active = activeIndex === index && !tempFilterActive;
          return (
            <View key={preset.id} onLayout={onPillLayout(index)}>
              <HapticPressable
                onPress={() => onSelect(index)}
                onLongPress={() => onShowDetails(preset.id)}
                delayLongPress={280}
                {...androidRippleProps(ripple, true)}
                style={({ pressed }) => [
                  styles.pill,
                  active ? styles.pillActive : null,
                  pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={preset.name}
              >
                <Text style={[styles.pillLabel, active ? styles.pillLabelActive : null]} numberOfLines={1}>
                  {preset.name}
                </Text>
                {active ? countNode : null}
              </HapticPressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
