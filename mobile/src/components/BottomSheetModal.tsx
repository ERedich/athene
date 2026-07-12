import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import {
  BOTTOM_SHEET_SLIDE_DURATION_MS,
  BOTTOM_SHEET_SLIDE_OFFSET,
  bottomSheetBackdropStyle,
} from "../styles/bottomSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
  /** Default true — tap dimmed area calls `onClose`. */
  dismissOnBackdropPress?: boolean;
  backdropAccessibilityLabel?: string;
};

export function BottomSheetModal({
  visible,
  onClose,
  children,
  sheetStyle,
  dismissOnBackdropPress = true,
  backdropAccessibilityLabel,
}: Props) {
  const sheetY = useRef(new Animated.Value(BOTTOM_SHEET_SLIDE_OFFSET)).current;

  useEffect(() => {
    if (!visible) return;
    sheetY.setValue(BOTTOM_SHEET_SLIDE_OFFSET);
    Animated.timing(sheetY, {
      toValue: 0,
      duration: BOTTOM_SHEET_SLIDE_DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [sheetY, visible]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={bottomSheetBackdropStyle()}>
        {dismissOnBackdropPress ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityLabel={backdropAccessibilityLabel}
            accessibilityRole="button"
          />
        ) : null}
        <Animated.View style={[sheetStyle, { transform: [{ translateY: sheetY }] }]}>{children}</Animated.View>
      </View>
    </Modal>
  );
}
