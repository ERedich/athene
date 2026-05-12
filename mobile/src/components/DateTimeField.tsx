import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { HapticPressable } from "./HapticPressable";

import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_ROW, surfaceRippleColor } from "../styles/pressableFeedback";

import { useAppTheme } from "../theme/AppThemeContext";

type Props = {
  label: string;
  value: Date | null;
  onChange: (next: Date | null) => void;
  locale: string;
  placeholder?: string;
};

function formatDateTime(value: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(value);
  } catch {
    return value.toISOString();
  }
}

function parseWebDateTime(raw: string): Date | null {
  if (!raw.trim()) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toWebInputValue(value: Date | null): string {
  if (!value) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = value.getFullYear();
  const mm = pad(value.getMonth() + 1);
  const dd = pad(value.getDate());
  const hh = pad(value.getHours());
  const min = pad(value.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function DateTimeField({ label, value, onChange, locale, placeholder }: Props) {
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const [androidStep, setAndroidStep] = useState<"date" | "time" | null>(null);
  const [androidDraft, setAndroidDraft] = useState<Date | null>(null);
  const [iosOpen, setIosOpen] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { marginBottom: 14 },
        label: { fontSize: 12, fontWeight: "600", marginBottom: 6, color: colors.outline },
        btn: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: colors.inputBackground,
        },
        btnText: { fontSize: 15, color: colors.onSurface },
        webInput: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 12,
          fontSize: 16,
          backgroundColor: colors.inputBackground,
          color: colors.onSurface,
        },
        iosPanel: {
          marginTop: 8,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          backgroundColor: colors.inputBackground,
        },
      }),
    [colors.border, colors.inputBackground, colors.onSurface, colors.outline],
  );

  if (Platform.OS === "web") {
    const inputProps = {
      value: toWebInputValue(value),
      onChangeText: (text: string) => onChange(parseWebDateTime(text)),
      placeholder,
      style: styles.webInput,
    } satisfies TextInputProps;
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <TextInput {...inputProps} />
      </View>
    );
  }

  const shown = value ?? new Date();

  const onAndroidChange = (event: DateTimePickerEvent, picked?: Date) => {
    if (event.type === "dismissed") {
      setAndroidStep(null);
      setAndroidDraft(null);
      return;
    }
    if (!picked) return;

    if (androidStep === "date") {
      const base = value ?? new Date();
      const merged = new Date(base);
      merged.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
      setAndroidDraft(merged);
      setAndroidStep("time");
      return;
    }

    const base = androidDraft ?? value ?? new Date();
    const merged = new Date(base);
    merged.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    onChange(merged);
    setAndroidStep(null);
    setAndroidDraft(null);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <HapticPressable
        {...androidRippleProps(ripple)}
        style={({ pressed }) => [styles.btn, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
        onPress={() => {
          if (Platform.OS === "android") {
            setAndroidStep("date");
            return;
          }
          setIosOpen((cur) => !cur);
        }}
      >
        <Text style={styles.btnText}>{value ? formatDateTime(value, locale) : placeholder ?? "—"}</Text>
      </HapticPressable>

      {Platform.OS === "android" && androidStep ? (
        <DateTimePicker
          value={androidStep === "date" ? (androidDraft ?? shown) : (androidDraft ?? shown)}
          mode={androidStep}
          is24Hour
          onChange={onAndroidChange}
        />
      ) : null}

      {Platform.OS === "ios" && iosOpen ? (
        <View style={styles.iosPanel}>
          <DateTimePicker
            value={shown}
            mode="datetime"
            onChange={(_, picked) => {
              if (picked) onChange(picked);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
