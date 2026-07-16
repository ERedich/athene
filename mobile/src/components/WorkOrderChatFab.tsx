import { MessageCircle } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticPressable } from "./HapticPressable";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_STRONG,
  surfaceRippleColor,
} from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

type Props = {
  onPress: () => void;
  accessibilityLabel: string;
  /** Extra bottom offset above the editor footer. */
  bottomOffset?: number;
};

export function WorkOrderChatFab({ onPress, accessibilityLabel, bottomOffset = 88 }: Props) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const ripple = surfaceRippleColor(isDark);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        fab: {
          position: "absolute",
          right: 16,
          bottom: bottomOffset + Math.max(insets.bottom, 0),
          width: 56,
          height: 56,
          borderRadius: 28,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primary,
          elevation: 4,
          shadowColor: "#000",
          shadowOpacity: 0.22,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
        },
      }),
    [bottomOffset, colors.primary, insets.bottom],
  );

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} collapsable={false}>
      <HapticPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        {...androidRippleProps(ripple)}
        style={({ pressed }) => [styles.fab, pressedOpacity(pressed, PRESSED_OPACITY_STRONG)]}
        onPress={onPress}
      >
        <MessageCircle size={24} color="#ffffff" />
      </HapticPressable>
    </View>
  );
}
