import * as Haptics from "expo-haptics";
import { forwardRef } from "react";
import { Pressable, type GestureResponderEvent, type PressableProps, type View } from "react-native";

export type HapticPressableProps = PressableProps & {
  /** Set false to skip tap feedback (e.g. nested or custom cases). Default true. */
  hapticFeedback?: boolean;
};

/** Same as RN `Pressable`, with brief light-impact haptics on tap (excluding `disabled`). */
export const HapticPressable = forwardRef<View, HapticPressableProps>(
  function HapticPressable({ onPressIn, disabled, hapticFeedback = true, ...rest }, ref) {
    const handlePressIn = (e: GestureResponderEvent) => {
      if (hapticFeedback && !disabled) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      onPressIn?.(e);
    };

    return <Pressable ref={ref} {...rest} disabled={disabled} onPressIn={handlePressIn} />;
  },
);
