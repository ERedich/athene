import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_ROW, surfaceRippleColor } from "../styles/pressableFeedback";
import type { ClassificationRow } from "../types/api";
import { useAppTheme } from "../theme/AppThemeContext";

import { SelectModal, type SelectItem } from "./SelectModal";

type Scope = "asset" | "work_order";

type Props = {
  classifications: ClassificationRow[];
  siteId: string;
  scope: Scope;
  value: string | null;
  onChange: (classificationId: string | null) => void;
  label: string;
  noneLabel: string;
};

export function ClassificationPicker({
  classifications,
  siteId,
  scope,
  value,
  onChange,
  label,
  noneLabel,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const [open, setOpen] = useState(false);
  const filtered = useMemo(
    () =>
      classifications.filter(
        (c) =>
          c.siteId === siteId && (scope === "asset" ? c.appliesToAsset : c.appliesToWorkOrder),
      ),
    [classifications, siteId, scope],
  );
  const items: SelectItem[] = useMemo(() => {
    const rows: SelectItem[] = [{ id: "__none__", label: noneLabel }];
    for (const c of filtered) {
      rows.push({ id: c.id, label: `${c.key} — ${c.name}` });
    }
    return rows;
  }, [filtered, noneLabel]);

  const selected = value ? filtered.find((c) => c.id === value) : null;
  const summary = selected ? `${selected.key} — ${selected.name}` : noneLabel;

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
        onSelect={(id) => onChange(id === "__none__" ? null : id)}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
