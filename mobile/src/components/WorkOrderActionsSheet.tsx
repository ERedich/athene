import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Sparkles } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { BottomSheetModal } from "./BottomSheetModal";
import { HapticPressable } from "./HapticPressable";

import type { WorkOrderStatus } from "../types/api";
import { canFeedbackWorkOrder, canPauseWorkOrder, canStartWorkOrder } from "../lib/workOrderLifecycle";
import { workOrderPlaybackBtnStyles } from "../lib/workOrderPlaybackUi";
import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_CONTROL, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

const PLAYBACK_ICON_SIZE = 28;

type Props = {
  visible: boolean;
  status: WorkOrderStatus | null;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  onFeedback: () => void;
  onAskAthene: () => void;
  onClose: () => void;
  atheneBusy?: boolean;
};

export function WorkOrderActionsSheet({
  visible,
  status,
  onStart,
  onPause,
  onStop,
  onFeedback,
  onAskAthene,
  onClose,
  atheneBusy = false,
}: Props) {
  const { t } = useTranslation();
  const { colors, radii, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radii.md,
          borderTopRightRadius: radii.md,
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
        playbackRow: {
          flexDirection: "row",
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        rowText: { fontSize: 15, color: colors.onSurface, fontWeight: "600" },
        rowDisabled: { opacity: 0.5 },
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

  const canStart = status ? canStartWorkOrder(status) : false;
  const canPause = status ? canPauseWorkOrder(status) : false;
  const canFeedback = status ? canFeedbackWorkOrder(status) : false;

  const startStyles = workOrderPlaybackBtnStyles("start", canStart, colors, isDark, radii);
  const pauseStyles = workOrderPlaybackBtnStyles("pause", canPause, colors, isDark, radii);
  const stopStyles = workOrderPlaybackBtnStyles("stop", canFeedback, colors, isDark, radii);

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      sheetStyle={styles.sheet}
      backdropAccessibilityLabel={t("workOrders.cancel")}
    >
      <Text style={styles.title}>{t("workOrders.actionsTitle")}</Text>
      <View style={styles.playbackRow}>
        <HapticPressable
          disabled={!canStart}
          accessibilityLabel={t("workOrders.start")}
          accessibilityState={{ disabled: !canStart }}
          {...androidRippleProps(ripple)}
          style={({ pressed }) => [
            startStyles.button,
            canStart && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
          ]}
          onPress={() => run(onStart)}
        >
          <MaterialIcons name="play-arrow" size={PLAYBACK_ICON_SIZE} color={startStyles.iconColor} />
        </HapticPressable>
        <HapticPressable
          disabled={!canPause}
          accessibilityLabel={t("workOrders.feedbackStatusAction.pause")}
          accessibilityState={{ disabled: !canPause }}
          {...androidRippleProps(ripple)}
          style={({ pressed }) => [
            pauseStyles.button,
            canPause && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
          ]}
          onPress={() => run(onPause)}
        >
          <MaterialIcons name="pause" size={PLAYBACK_ICON_SIZE} color={pauseStyles.iconColor} />
        </HapticPressable>
        <HapticPressable
          disabled={!canFeedback}
          accessibilityLabel={t("workOrders.stop")}
          accessibilityState={{ disabled: !canFeedback }}
          {...androidRippleProps(ripple)}
          style={({ pressed }) => [
            stopStyles.button,
            canFeedback && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
          ]}
          onPress={() => run(onStop)}
        >
          <MaterialIcons name="stop" size={PLAYBACK_ICON_SIZE} color={stopStyles.iconColor} />
        </HapticPressable>
      </View>
      <HapticPressable
        disabled={atheneBusy}
        {...androidRippleProps(ripple)}
        style={({ pressed }) => [
          styles.row,
          atheneBusy && styles.rowDisabled,
          !atheneBusy && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
        ]}
        onPress={() => run(onAskAthene)}
      >
        {atheneBusy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Sparkles size={20} color={colors.primary} />
        )}
        <Text style={styles.rowText}>{t("assistant.askAthene")}</Text>
      </HapticPressable>
      <HapticPressable
        disabled={!canFeedback}
        {...androidRippleProps(ripple)}
        style={({ pressed }) => [
          styles.row,
          !canFeedback && styles.rowDisabled,
          canFeedback && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
        ]}
        onPress={() => run(onFeedback)}
      >
        <Text style={styles.rowText}>{t("workOrders.contextMenuCreateFeedback")}</Text>
      </HapticPressable>
      <HapticPressable
        {...androidRippleProps(ripple)}
        style={({ pressed }) => [styles.cancel, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
        onPress={onClose}
      >
        <Text style={styles.cancelText}>{t("workOrders.cancel")}</Text>
      </HapticPressable>
    </BottomSheetModal>
  );
}
