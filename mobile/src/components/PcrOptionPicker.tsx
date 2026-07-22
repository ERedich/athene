import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { HapticPressable } from "./HapticPressable";
import { SelectModal, type SelectItem } from "./SelectModal";

import type { PcrSelectOption } from "../lib/workOrderPcr";
import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_ROW, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

type Props = {
  label: string;
  placeholder: string;
  value: string | null;
  options: PcrSelectOption[];
  onChange: (id: string | null) => void;
  disabled?: boolean;
};

export function PcrOptionPicker({ label, placeholder, value, options, onChange, disabled }: Props) {
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const [open, setOpen] = useState(false);

  const items: SelectItem[] = useMemo(() => {
    const rows: SelectItem[] = [{ id: "__none__", label: placeholder }];
    for (const o of options) rows.push({ id: o.id, label: o.label });
    return rows;
  }, [options, placeholder]);

  const selected = value ? options.find((o) => o.id === value) : null;
  const summary = selected?.label ?? placeholder;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginBottom: 8 },
        label: {
          fontSize: 11,
          color: colors.onSurfaceVariant,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginTop: 6,
          marginBottom: 6,
        },
        btn: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 12,
          backgroundColor: colors.inputBackground,
          opacity: disabled ? 0.45 : 1,
        },
        btnText: { fontSize: 15, color: colors.onSurface },
      }),
    [colors.border, colors.inputBackground, colors.onSurface, colors.onSurfaceVariant, disabled],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <HapticPressable
        disabled={disabled}
        {...androidRippleProps(ripple)}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.btn, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
      >
        <Text style={styles.btnText} numberOfLines={1}>
          {summary}
        </Text>
      </HapticPressable>
      <SelectModal
        visible={open}
        title={label}
        items={items}
        onSelect={(id) => onChange(id === "__none__" ? null : id)}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
