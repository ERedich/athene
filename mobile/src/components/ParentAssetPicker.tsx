import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { allowedParentTypesFor } from "../types/assetRules";
import type { AssetRow, AssetType } from "../types/api";
import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_ROW, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

import { SelectModal, type SelectItem } from "./SelectModal";

type Props = {
  assets: AssetRow[];
  siteId: string;
  childType: AssetType;
  value: string | null;
  onChange: (parentAssetId: string | null) => void;
  label: string;
  noneLabel: string;
  /** When editing, exclude self and descendants are not filtered client-side (backend validates cycles). */
  excludeAssetId?: string;
};

export function ParentAssetPicker({
  assets,
  siteId,
  childType,
  value,
  onChange,
  label,
  noneLabel,
  excludeAssetId,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const [open, setOpen] = useState(false);
  const allowedTypes = allowedParentTypesFor(childType);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (a.siteId !== siteId) return false;
      if (!allowedTypes.includes(a.type)) return false;
      if (excludeAssetId && a.id === excludeAssetId) return false;
      return true;
    });
  }, [assets, siteId, allowedTypes, excludeAssetId]);

  const items: SelectItem[] = useMemo(() => {
    const rows: SelectItem[] = [{ id: "__none__", label: noneLabel }];
    for (const a of filtered) {
      rows.push({
        id: a.id,
        label: `${a.key} — ${a.name} (${a.type})`,
      });
    }
    return rows;
  }, [filtered, noneLabel]);

  const selected = value ? assets.find((a) => a.id === value) : null;
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
        btnText: { fontSize: 14, color: colors.onSurface },
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
        <Text style={styles.btnText} numberOfLines={2}>
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
