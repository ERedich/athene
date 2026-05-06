import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_ROW, surfaceRippleColor } from "../styles/pressableFeedback";
import type { AssetRow } from "../types/api";
import { useAppTheme } from "../theme/AppThemeContext";

import { SelectModal, type SelectItem } from "./SelectModal";

type Props = {
  assets: AssetRow[];
  value: string;
  onChange: (assetId: string) => void;
  label: string;
  placeholder: string;
};

export function AssetPicker({ assets, value, onChange, label, placeholder }: Props) {
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const [open, setOpen] = useState(false);

  const items: SelectItem[] = useMemo(
    () => assets.map((a) => ({ id: a.id, label: `${a.key} — ${a.name}` })),
    [assets],
  );

  const selected = useMemo(() => assets.find((a) => a.id === value) ?? null, [assets, value]);
  const summary = selected ? `${selected.key} — ${selected.name}` : placeholder;

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
        btnText: { fontSize: 15, color: colors.onSurface },
      }),
    [colors.border, colors.inputBackground, colors.onSurface, colors.outline],
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        {...androidRippleProps(ripple)}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.btn, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
      >
        <Text style={styles.btnText} numberOfLines={1}>
          {summary}
        </Text>
      </Pressable>
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
