import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import type { WorkOrderStatus } from "../types/api";
import { useAppTheme } from "../theme/AppThemeContext";
import { canFeedbackWorkOrder, canPauseWorkOrder, canStartWorkOrder } from "../lib/workOrderLifecycle";

type Props = {
  visible: boolean;
  status: WorkOrderStatus | null;
  onStart: () => void;
  onPause: () => void;
  onFeedback: () => void;
  onClose: () => void;
};

export function WorkOrderActionsSheet({ visible, status, onStart, onPause, onFeedback, onClose }: Props) {
  const { t } = useTranslation();
  const { colors, radii } = useAppTheme();

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
          <Pressable
            disabled={!canStart}
            style={({ pressed }) => [styles.row, !canStart && styles.rowDisabled, pressed && canStart && { opacity: 0.85 }]}
            onPress={() => run(onStart)}
          >
            <Text style={styles.rowText}>{t("workOrders.start")}</Text>
          </Pressable>
          <Pressable
            disabled={!canPause}
            style={({ pressed }) => [styles.row, !canPause && styles.rowDisabled, pressed && canPause && { opacity: 0.85 }]}
            onPress={() => run(onPause)}
          >
            <Text style={styles.rowText}>{t("workOrders.stop")}</Text>
          </Pressable>
          <Pressable
            disabled={!canFeedback}
            style={({ pressed }) => [styles.row, !canFeedback && styles.rowDisabled, pressed && canFeedback && { opacity: 0.85 }]}
            onPress={() => run(onFeedback)}
          >
            <Text style={styles.rowText}>{t("workOrders.contextMenuCreateFeedback")}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.85 }]} onPress={onClose}>
            <Text style={styles.cancelText}>{t("workOrders.cancel")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
