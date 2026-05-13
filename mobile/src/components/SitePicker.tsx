import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { SiteRow } from "../types/api";
import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_ROW, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

import { HapticPressable } from "./HapticPressable";
import { SelectModal, type SelectItem } from "./SelectModal";

type Props = {
  sites: SiteRow[];
  value: string;
  onChange: (siteId: string) => void;
  disabled?: boolean;
  label: string;
};

export function SitePicker({ sites, value, onChange, disabled, label }: Props) {
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const [open, setOpen] = useState(false);
  const items: SelectItem[] = useMemo(
    () => sites.map((s) => ({ id: s.id, label: `${s.key} — ${s.name}` })),
    [sites],
  );
  const selected = sites.find((s) => s.id === value);
  const summary = selected ? `${selected.key} — ${selected.name}` : "—";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginBottom: 14 },
        label: { fontSize: 12, fontWeight: "600", marginBottom: 6, color: colors.outline },
        btn: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 12,
          backgroundColor: colors.inputBackground,
        },
        btnDisabled: { opacity: 0.55 },
        btnText: { fontSize: 15, color: colors.onSurface },
      }),
    [colors.border, colors.inputBackground, colors.onSurface, colors.outline],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <HapticPressable
        disabled={disabled}
        {...androidRippleProps(ripple)}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.btn,
          disabled && styles.btnDisabled,
          !disabled && pressedOpacity(pressed, PRESSED_OPACITY_ROW),
        ]}
      >
        <Text style={styles.btnText} numberOfLines={1}>
          {summary}
        </Text>
      </HapticPressable>
      <SelectModal
        visible={open}
        title={label}
        items={items}
        onSelect={onChange}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
