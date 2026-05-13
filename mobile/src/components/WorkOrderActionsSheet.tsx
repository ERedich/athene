import { Sparkles } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";

import { HapticPressable } from "./HapticPressable";

import type { WorkOrderStatus } from "../types/api";
import { canFeedbackWorkOrder, canPauseWorkOrder, canStartWorkOrder } from "../lib/workOrderLifecycle";
import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_CONTROL, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

type Props = {
  visible: boolean;
  status: WorkOrderStatus | null;
  onStart: () => void;
  onPause: () => void;
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
        backdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "flex-end",
        },
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

  const run = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t("workOrders.actionsTitle")}</Text>
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
            disabled={!canStart}
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [
              styles.row,
              !canStart && styles.rowDisabled,
              canStart && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
            ]}
            onPress={() => run(onStart)}
          >
            <Text style={styles.rowText}>{t("workOrders.start")}</Text>
          </HapticPressable>
          <HapticPressable
            disabled={!canPause}
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [
              styles.row,
              !canPause && styles.rowDisabled,
              canPause && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
            ]}
            onPress={() => run(onPause)}
          >
            <Text style={styles.rowText}>{t("workOrders.stop")}</Text>
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
        </View>
      </View>
    </Modal>
  );
}
