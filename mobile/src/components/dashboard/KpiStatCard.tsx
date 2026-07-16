import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { HapticPressable } from "../HapticPressable";
import { androidRippleProps, PRESSED_OPACITY_ROW, pressedOpacity, surfaceRippleColor } from "../../styles/pressableFeedback";
import { useAppTheme } from "../../theme/AppThemeContext";

type Props = {
  title: string;
  value: string | number | null;
  loading?: boolean;
  footer?: string | null;
  onPress?: () => void;
};

export function KpiStatCard({ title, value, loading, footer, onPress }: Props) {
  const { colors, isDark, radii, space } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flex: 1,
          minWidth: 0,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: radii.md,
          padding: space.md,
          gap: space.sm,
        },
        title: {
          fontSize: 13,
          fontWeight: "600",
          color: colors.onSurfaceVariant,
        },
        value: {
          fontSize: 28,
          fontWeight: "700",
          color: colors.onSurface,
          letterSpacing: -0.5,
        },
        valuePlaceholder: {
          fontSize: 28,
          fontWeight: "700",
          color: colors.onSurfaceVariant,
          opacity: 0.35,
        },
        footer: {
          fontSize: 11,
          lineHeight: 15,
          color: colors.onSurfaceVariant,
        },
      }),
    [colors.border, colors.onSurface, colors.onSurfaceVariant, colors.surface, radii.md, space.md, space.sm],
  );

  const content = (
    <View style={styles.card}>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {loading ? (
        <Text style={styles.valuePlaceholder}>—</Text>
      ) : (
        <Text style={styles.value}>{value ?? "—"}</Text>
      )}
      {footer ? (
        <Text style={styles.footer} numberOfLines={3}>
          {footer}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;

  return (
    <HapticPressable
      onPress={onPress}
      style={({ pressed }) => [pressedOpacity(pressed, PRESSED_OPACITY_ROW), { flex: 1, minWidth: 0 }]}
      {...androidRippleProps(surfaceRippleColor(isDark))}
    >
      {content}
    </HapticPressable>
  );
}
