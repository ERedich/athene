import { Info } from "lucide-react-native";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { HapticPressable } from "./HapticPressable";
import type { WorkOrderSearchPresetListItem } from "../lib/workOrderSearchPresetsApi";
import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_CONTROL, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

type Props = {
  presets: WorkOrderSearchPresetListItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onShowDetails: (presetId: string) => void;
};

type PillLayout = { x: number; width: number };

export function WorkOrderFilterPills({ presets, activeIndex, onSelect, onShowDetails }: Props) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const scrollRef = useRef<ScrollView>(null);
  const pillLayouts = useRef<Record<number, PillLayout>>({});

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
          gap: 4,
          paddingLeft: 10,
          paddingRight: 6,
          paddingVertical: 5,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        pillActive: {
          borderColor: colors.primary,
          backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(25,28,30,0.06)",
        },
        pillMain: {
          flexShrink: 1,
          paddingVertical: 2,
          paddingRight: 2,
        },
        pillText: { fontSize: 12, fontWeight: "600", color: colors.onSurfaceVariant, maxWidth: 160 },
        pillTextActive: { color: colors.primary, fontWeight: "700" },
        infoBtn: {
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
    const layout = pillLayouts.current[activeIndex];
    if (!layout || !scrollRef.current) return;
    scrollRef.current.scrollTo({ x: Math.max(0, layout.x - 12), animated: true });
  }, [activeIndex]);

  const onPillLayout = (index: number) => (e: LayoutChangeEvent) => {
    pillLayouts.current[index] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
  };

  return (
    <View style={styles.row}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View onLayout={onPillLayout(0)}>
          <HapticPressable
            onPress={() => onSelect(0)}
            {...androidRippleProps(ripple, true)}
            style={({ pressed }) => [
              styles.pill,
              activeIndex === 0 ? styles.pillActive : null,
              pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: activeIndex === 0 }}
            accessibilityLabel={t("workOrders.filterAll")}
          >
            <Text style={[styles.pillText, activeIndex === 0 ? styles.pillTextActive : null]} numberOfLines={1}>
              {t("workOrders.filterAll")}
            </Text>
          </HapticPressable>
        </View>
        {presets.map((preset, i) => {
          const index = i + 1;
          const active = activeIndex === index;
          return (
            <View
              key={preset.id}
              onLayout={onPillLayout(index)}
              style={[styles.pill, active ? styles.pillActive : null]}
            >
              <HapticPressable
                onPress={() => onSelect(index)}
                onLongPress={() => onShowDetails(preset.id)}
                delayLongPress={280}
                {...androidRippleProps(ripple, true)}
                style={({ pressed }) => [styles.pillMain, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={preset.name}
              >
                <Text style={[styles.pillText, active ? styles.pillTextActive : null]} numberOfLines={1}>
                  {preset.name}
                </Text>
              </HapticPressable>
              <HapticPressable
                onPress={() => onShowDetails(preset.id)}
                {...androidRippleProps(ripple, true)}
                style={({ pressed }) => [styles.infoBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                accessibilityRole="button"
                accessibilityLabel={t("workOrders.filterDetailsInfo")}
                hitSlop={6}
              >
                <Info size={14} color={active ? colors.primary : colors.onSurfaceVariant} />
              </HapticPressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
