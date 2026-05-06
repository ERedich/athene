import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { pressedOpacity, PRESSED_OPACITY_CONTROL } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

type Props = {
  visible: boolean;
  saving: boolean;
  onSubmit: (body: { hours: number; remark: string | null; completeOrder: boolean }) => Promise<boolean> | boolean;
  onClose: () => void;
};

export function WorkOrderFeedbackModal({ visible, saving, onSubmit, onClose }: Props) {
  const { t } = useTranslation();
  const { colors, radii } = useAppTheme();
  const [hours, setHours] = useState("");
  const [remark, setRemark] = useState("");
  const [completeOrder, setCompleteOrder] = useState(false);

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
        },
        title: { fontSize: 16, fontWeight: "700", color: colors.onSurface },
        label: {
          fontSize: 11,
          color: colors.onSurfaceVariant,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginTop: 6,
        },
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
          minHeight: 90,
          textAlignVertical: "top",
        },
        counter: {
          marginTop: 4,
          alignSelf: "flex-end",
          color: colors.onSurfaceVariant,
          fontSize: 12,
        },
        switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
        switchLabel: { color: colors.onSurface, flex: 1, marginRight: 12 },
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
    [
      colors.background,
      colors.border,
      colors.onSurface,
      colors.onSurfaceVariant,
      colors.primary,
      colors.surface,
      radii.md,
      radii.sm,
    ],
  );

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
    const ok = await onSubmit({
      hours: value,
      remark: remark.trim() ? remark.trim() : null,
      completeOrder,
    });
    if (!ok) return;
    setHours("");
    setRemark("");
    setCompleteOrder(false);
    onClose();
  };

  const close = () => {
    if (saving) return;
    setHours("");
    setRemark("");
    setCompleteOrder(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t("workOrders.tabFeedback")}</Text>

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

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t("workOrders.feedbackCompleteOrder")}</Text>
            <Switch value={completeOrder} onValueChange={setCompleteOrder} disabled={saving} />
          </View>

          <View style={styles.actions}>
            <Pressable disabled={saving} onPress={close} style={({ pressed }) => [styles.btnSecondary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}>
              <Text style={styles.btnSecondaryText}>{t("workOrders.cancel")}</Text>
            </Pressable>
            <Pressable disabled={saving} onPress={() => void submit()} style={({ pressed }) => [styles.btnPrimary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}>
              {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>{t("workOrders.save")}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
