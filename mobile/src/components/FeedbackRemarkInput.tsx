import { Mic } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, Animated, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";

import { HapticPressable } from "./HapticPressable";
import { useLocalizedSpeechInput } from "../hooks/useLocalizedSpeechInput";
import { pressedOpacity, PRESSED_OPACITY_CONTROL } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

const MAX_LEN = 2000;

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function FeedbackRemarkInput({ label, value, onChange, disabled = false, placeholder }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, radii } = useAppTheme();
  const pulseAnim = useRef(new Animated.Value(0)).current;

  const appendText = useCallback(
    (text: string) => {
      const next = value.trim() ? `${value.trimEnd()} ${text}` : text;
      onChange(next.slice(0, MAX_LEN));
    },
    [onChange, value],
  );

  const speech = useLocalizedSpeechInput({
    targetLocale: i18n.language,
    disabled,
    onAppend: appendText,
    maxLength: MAX_LEN,
  });

  useEffect(() => {
    if (!speech.listening) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, speech.listening]);

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.18],
  });
  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 0],
  });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        label: {
          marginTop: 6,
          fontSize: 11,
          color: colors.onSurfaceVariant,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        },
        inputRow: {
          flexDirection: "row",
          alignItems: "stretch",
          gap: 8,
          marginTop: 4,
        },
        voiceBtnWrap: {
          width: 72,
          alignSelf: "stretch",
          alignItems: "center",
          justifyContent: "center",
        },
        pulseRing: {
          ...StyleSheet.absoluteFillObject,
          borderRadius: radii.sm,
          borderWidth: 2,
          borderColor: colors.primary,
        },
        voiceBtn: {
          width: "100%",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radii.sm,
          borderWidth: 1,
          borderColor: colors.border,
        },
        voiceBtnActive: {
          borderColor: colors.primary,
          backgroundColor: colors.inputBackground,
        },
        input: {
          flex: 1,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.sm,
          backgroundColor: colors.background,
          color: colors.onSurface,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          minHeight: 72,
          textAlignVertical: "top",
        },
        counter: {
          marginTop: 4,
          alignSelf: "flex-end",
          color: colors.onSurfaceVariant,
          fontSize: 12,
        },
        hint: { marginTop: 4, fontSize: 12, color: colors.primary },
        error: { marginTop: 4, fontSize: 12, color: "#ef4444" },
      }),
    [colors, radii.sm],
  );

  const voiceError = () => {
    if (!speech.errorCode) return null;
    if (speech.errorCode === "permission_denied") return t("assistant.voicePermissionDenied");
    if (speech.errorCode === "transcribe_failed") return t("assistant.voiceTranscribeFailed");
    if (speech.errorCode === "unsupported") return t("assistant.voiceNotSupported");
    return t("assistant.voiceError");
  };

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? label}
          placeholderTextColor={colors.onSurfaceVariant}
          style={styles.input}
          multiline
          editable={!disabled}
          maxLength={MAX_LEN}
        />
        <View style={styles.voiceBtnWrap}>
          {speech.listening ? (
            <Animated.View
              style={[
                styles.pulseRing,
                {
                  opacity: pulseOpacity,
                  transform: [{ scale: pulseScale }],
                },
              ]}
            />
          ) : null}
          <HapticPressable
            disabled={disabled || speech.localizing}
            style={({ pressed }) => [
              styles.voiceBtn,
              (speech.listening || speech.localizing) && styles.voiceBtnActive,
              pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
            ]}
            onPress={() => {
              if (!speech.supported) {
                Alert.alert(t("assistant.voiceInput"), t("assistant.voiceNotSupported"));
                return;
              }
              if (!speech.listening) {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              speech.toggleListening();
            }}
            accessibilityLabel={
              speech.listening ? t("assistant.stopListening") : t("workOrders.feedbackVoiceInput")
            }
            accessibilityState={{ selected: speech.listening }}
          >
            {speech.localizing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Mic
                size={24}
                color={speech.listening ? colors.primary : colors.onSurfaceVariant}
              />
            )}
          </HapticPressable>
        </View>
      </View>
      {speech.listening ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {t("assistant.listening")}
        </Text>
      ) : null}
      {speech.localizing ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          {t("workOrders.feedbackVoiceTranscribing")}
        </Text>
      ) : null}
      {voiceError() ? (
        <Text style={styles.error} accessibilityRole="alert">
          {voiceError()}
        </Text>
      ) : null}
      <Text style={styles.counter}>{t("workOrders.descriptionCounter", { count: value.length, max: MAX_LEN })}</Text>
    </View>
  );
}
