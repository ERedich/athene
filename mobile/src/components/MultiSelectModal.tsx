import { useMemo } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { BottomSheetModal } from "./BottomSheetModal";
import { HapticPressable } from "./HapticPressable";

import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_CONTROL, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

export type SelectItem = { id: string; label: string };

type Props = {
  visible: boolean;
  title: string;
  items: SelectItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
  doneLabel?: string;
};

export function MultiSelectModal({
  visible,
  title,
  items,
  selectedIds,
  onChange,
  onClose,
  doneLabel = "OK",
}: Props) {
  const { colors, radii, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radii.md,
          borderTopRightRadius: radii.md,
          maxHeight: "70%",
          paddingBottom: 16,
        },
        title: {
          padding: 16,
          fontSize: 16,
          fontWeight: "700",
          color: colors.onSurface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        row: {
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        },
        rowSelected: {
          backgroundColor: colors.background,
        },
        rowText: { flex: 1, fontSize: 15, color: colors.onSurface },
        check: { fontSize: 16, fontWeight: "700", color: colors.primary },
        done: {
          marginTop: 8,
          marginHorizontal: 16,
          padding: 14,
          alignItems: "center",
          backgroundColor: colors.background,
          borderRadius: radii.sm,
        },
        doneText: { fontSize: 15, fontWeight: "600", color: colors.primary },
      }),
    [colors.background, colors.border, colors.onSurface, colors.primary, colors.surface, radii.md, radii.sm],
  );

  const toggle = (id: string) => {
    const next = selectedSet.has(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id];
    onChange(next);
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} sheetStyle={styles.sheet}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const selected = selectedSet.has(item.id);
          return (
            <HapticPressable
              {...androidRippleProps(ripple)}
              style={({ pressed }) => [
                styles.row,
                selected ? styles.rowSelected : null,
                pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
              ]}
              onPress={() => toggle(item.id)}
            >
              <Text style={styles.rowText}>{item.label}</Text>
              {selected ? <Text style={styles.check}>✓</Text> : null}
            </HapticPressable>
          );
        }}
      />
      <HapticPressable
        {...androidRippleProps(ripple)}
        style={({ pressed }) => [styles.done, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
        onPress={onClose}
      >
        <Text style={styles.doneText}>{doneLabel}</Text>
      </HapticPressable>
    </BottomSheetModal>
  );
}
