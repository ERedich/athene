import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, TextInput, View } from "react-native";

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

type Props = {
  visible: boolean;
  saving: boolean;
  entryMode: FeedbackEntryMode;
  segmentStartedAt: string | null;
  reportingEmployeeLabel: string;
  onSubmit: (body: WorkOrderFeedbackBody) => Promise<boolean> | boolean;
  onClose: () => void;
};

export function WorkOrderFeedbackModal({
  visible,
  saving,
  entryMode,
  segmentStartedAt,
  reportingEmployeeLabel,
  onSubmit,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { colors, radii } = useAppTheme();
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
        title: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
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
        area: {
          minHeight: 72,
          textAlignVertical: "top",
        },
        counter: {
          marginTop: 4,
          alignSelf: "flex-end",
          color: colors.onSurfaceVariant,
          fontSize: 12,
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t("workOrders.tabFeedback")}</Text>

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
            <>
              <Text style={styles.label}>{t("workOrders.feedbackPauseRemark")}</Text>
              <TextInput
                value={pauseRemark}
                onChangeText={setPauseRemark}
                placeholder={t("workOrders.feedbackPauseRemark")}
                placeholderTextColor={colors.onSurfaceVariant}
                style={[styles.input, styles.area]}
                multiline
                editable={!saving}
              />
              <Text style={styles.counter}>{t("workOrders.descriptionCounter", { count: pauseRemark.length, max: 2000 })}</Text>
            </>
          ) : null}

          <Text style={styles.label}>{t("workOrders.feedbackRemark")}</Text>
          <TextInput
            value={remark}
            onChangeText={setRemark}
            placeholder={t("workOrders.feedbackRemark")}
            placeholderTextColor={colors.onSurfaceVariant}
            style={[styles.input, styles.area]}
            multiline
            editable={!saving}
          />
          <Text style={styles.counter}>{t("workOrders.descriptionCounter", { count: remark.length, max: 2000 })}</Text>

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
