import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { Sparkles, X } from "lucide-react-native";

import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { FeedbackRemarkInput } from "./FeedbackRemarkInput";
import { HapticPressable } from "./HapticPressable";

import type { WorkOrderFeedbackBody } from "../hooks/queries";
import {
  computeSegmentHours,
  feedbackStatusActionForEntryMode,
  type FeedbackEntryMode,
  type FeedbackStatusAction,
} from "../lib/workOrderFeedback";
import { pressedOpacity, PRESSED_OPACITY_CONTROL } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

export type WorkOrderFeedbackModalOrder = {
  id: string;
  orderNumber: number;
  name: string;
  status: string;
  siteId: string;
  siteKey: string;
  assetId: string;
  assetKey: string;
  assetName: string;
};

type Props = {
  visible: boolean;
  saving: boolean;
  entryMode: FeedbackEntryMode;
  segmentStartedAt: string | null;
  reportingEmployeeLabel: string;
  order: WorkOrderFeedbackModalOrder | null;
  onSubmit: (body: WorkOrderFeedbackBody) => Promise<boolean> | boolean;
  onClose: () => void;
};

export function WorkOrderFeedbackModal({
  visible,
  saving,
  entryMode,
  segmentStartedAt,
  reportingEmployeeLabel,
  order,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { colors, radii } = useAppTheme();
  const athene = useAtheneAssistant();
  const [hours, setHours] = useState("");
  const [remark, setRemark] = useState("");
  const [pauseRemark, setPauseRemark] = useState("");
  const [statusAction, setStatusAction] = useState<FeedbackStatusAction>("none");

  useEffect(() => {
    if (!visible) return;
    setStatusAction(feedbackStatusActionForEntryMode(entryMode));
    setPauseRemark("");
    setRemark("");
    setHours(computeSegmentHours(segmentStartedAt));
  }, [visible, entryMode, segmentStartedAt]);

  const showPauseRemark = entryMode === "pause" || statusAction === "pause";

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
          padding: 16,
          gap: 10,
          maxHeight: "90%",
        },
        titleRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        },
        title: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.onSurface },
        headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
        headerIconBtn: { padding: 8 },
        label: {
          fontSize: 11,
          color: colors.onSurfaceVariant,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginTop: 6,
        },
        readOnly: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.sm,
          backgroundColor: colors.background,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        readOnlyText: { color: colors.onSurfaceVariant, fontSize: 15 },
        input: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.sm,
          backgroundColor: colors.background,
          color: colors.onSurface,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
        },
        radioRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
        radioOuter: {
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        },
        radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
        radioLabel: { color: colors.onSurface, fontSize: 15, flex: 1 },
        actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 6 },
        btnSecondary: {
          minHeight: 40,
          minWidth: 96,
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
        },
        btnPrimary: {
          minHeight: 40,
          minWidth: 120,
          borderRadius: radii.sm,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
        },
        btnSecondaryText: { color: colors.onSurface, fontWeight: "600" },
        btnPrimaryText: { color: "#fff", fontWeight: "700" },
        disabled: { opacity: 0.45 },
      }),
    [colors, radii],
  );

  const resetAndClose = () => {
    setHours("");
    setRemark("");
    setPauseRemark("");
    setStatusAction("none");
    onClose();
  };

  const submit = async () => {
    const normalized = hours.trim().replace(",", ".");
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert("", t("workOrders.feedbackHoursInvalid"));
      return;
    }
    if (remark.length > 2000) {
      Alert.alert("", t("workOrders.feedbackRemarkTooLong"));
      return;
    }
    if (statusAction === "pause" && !pauseRemark.trim()) {
      Alert.alert("", t("workOrders.feedbackPauseRemarkRequired"));
      return;
    }
    const ok = await onSubmit({
      hours: value,
      remark: remark.trim() ? remark.trim() : null,
      statusAction,
      pauseRemark: statusAction === "pause" ? pauseRemark.trim() : null,
    });
    if (!ok) return;
    resetAndClose();
  };

  const close = () => {
    if (saving) return;
    resetAndClose();
  };

  const statusOptions: FeedbackStatusAction[] = ["none", "pause", "end"];

  const openAthene = () => {
    if (!order) return;
    athene.openForFeedback({
      workOrderId: order.id,
      label: `#${order.orderNumber} - ${order.name}`,
      data: {
        orderNumber: order.orderNumber,
        name: order.name,
        status: order.status,
        siteId: order.siteId,
        siteKey: order.siteKey,
        assetId: order.assetId,
        assetKey: order.assetKey,
        assetName: order.assetName,
      },
      draftRemark: remark,
      draftPauseRemark: pauseRemark,
      onApplyText: (field, text) => {
        if (field === "pauseRemark") setPauseRemark(text);
        else setRemark(text);
      },
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t("workOrders.tabFeedback")}</Text>
            <View style={styles.headerActions}>
              <HapticPressable
                disabled={!order || athene.busy}
                style={({ pressed }) => [
                  styles.headerIconBtn,
                  (!order || athene.busy) && styles.disabled,
                  pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
                ]}
                onPress={openAthene}
                accessibilityLabel={t("workOrders.feedbackAskAthene")}
              >
                <Sparkles size={22} color={colors.primary} />
              </HapticPressable>
              <HapticPressable
                disabled={saving}
                style={({ pressed }) => [styles.headerIconBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                onPress={close}
                accessibilityLabel={t("workOrders.cancel")}
              >
                <X size={22} color={colors.onSurfaceVariant} />
              </HapticPressable>
            </View>
          </View>

          <Text style={styles.label}>{t("workOrders.feedbackReportingEmployee")}</Text>
          <View style={styles.readOnly}>
            <Text style={styles.readOnlyText}>{reportingEmployeeLabel}</Text>
          </View>

          <Text style={styles.label}>{t("workOrders.feedbackHours")}</Text>
          <TextInput
            value={hours}
            onChangeText={setHours}
            placeholder={t("workOrders.feedbackHoursPlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            style={styles.input}
            keyboardType="decimal-pad"
            editable={!saving}
          />

          {showPauseRemark ? (
            <FeedbackRemarkInput
              label={t("workOrders.feedbackPauseRemark")}
              value={pauseRemark}
              onChange={setPauseRemark}
              disabled={saving}
              placeholder={t("workOrders.feedbackPauseRemark")}
            />
          ) : null}

          <FeedbackRemarkInput
            label={t("workOrders.feedbackRemark")}
            value={remark}
            onChange={setRemark}
            disabled={saving}
            placeholder={t("workOrders.feedbackRemark")}
          />

          <Text style={styles.label}>{t("workOrders.feedbackStatusActionLegend")}</Text>
          {statusOptions.map((value) => (
            <HapticPressable
              key={value}
              disabled={saving}
              onPress={() => setStatusAction(value)}
              style={({ pressed }) => [styles.radioRow, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            >
              <View style={styles.radioOuter}>{statusAction === value ? <View style={styles.radioInner} /> : null}</View>
              <Text style={styles.radioLabel}>{t(`workOrders.feedbackStatusAction.${value}`)}</Text>
            </HapticPressable>
          ))}

          <View style={styles.actions}>
            <HapticPressable
              disabled={saving}
              onPress={close}
              style={({ pressed }) => [styles.btnSecondary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            >
              <Text style={styles.btnSecondaryText}>{t("workOrders.cancel")}</Text>
            </HapticPressable>
            <HapticPressable
              disabled={saving}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.btnPrimary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>{t("workOrders.save")}</Text>
              )}
            </HapticPressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
