import { useMemo } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { HapticPressable } from "./HapticPressable";

import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_CONTROL, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

export type SelectItem = { id: string; label: string };

type Props = {
  visible: boolean;
  title: string;
  items: SelectItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function SelectModal({ visible, title, items, onSelect, onClose }: Props) {
  const { colors, radii, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "flex-end",
        },
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
        },
        rowText: { fontSize: 15, color: colors.onSurface },
        cancel: {
          marginTop: 8,
          marginHorizontal: 16,
          padding: 14,
          alignItems: "center",
          backgroundColor: colors.background,
          borderRadius: radii.sm,
        },
        cancelText: { fontSize: 15, fontWeight: "600", color: colors.primary },
      }),
    [colors.background, colors.border, colors.onSurface, colors.primary, colors.surface, radii.md, radii.sm],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <HapticPressable
                {...androidRippleProps(ripple)}
                style={({ pressed }) => [styles.row, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
              >
                <Text style={styles.rowText}>{item.label}</Text>
              </HapticPressable>
            )}
          />
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [styles.cancel, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>OK</Text>
          </HapticPressable>
        </View>
      </View>
    </Modal>
  );
}
