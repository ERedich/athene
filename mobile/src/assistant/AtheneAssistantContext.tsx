import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Send, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { HapticPressable } from "../components/HapticPressable";

import { apiFetch } from "../lib/api";
import { androidRippleProps, pressedOpacity, PRESSED_OPACITY_CONTROL, surfaceRippleColor } from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

export type AtheneUiContext = {
  type: "workOrder" | "asset" | "monitoring" | "app" | "unknown";
  id?: string;
  label?: string;
  data?: unknown;
};

type AtheneMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  locale: string | null;
  clientContext: AtheneUiContext | null;
  createdAt: string;
};

type AtheneAssistantContextValue = {
  busy: boolean;
  open: () => void;
  openWithContext: (context: AtheneUiContext) => void;
};

const AtheneAssistantContext = createContext<AtheneAssistantContextValue | null>(null);

export function AtheneAssistantProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { colors, radii, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AtheneMessage[]>([]);
  const [uiContext, setUiContext] = useState<AtheneUiContext | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadedRef = useRef(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        modal: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
        sheet: {
          maxHeight: "92%",
          minHeight: "72%",
          backgroundColor: colors.surface,
          borderTopLeftRadius: radii.md,
          borderTopRightRadius: radii.md,
          overflow: "hidden",
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        title: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
        subtitle: { marginTop: 2, fontSize: 12, color: colors.onSurfaceVariant },
        iconButton: { padding: 8 },
        content: { flex: 1, padding: 14 },
        empty: {
          padding: 12,
          borderRadius: radii.sm,
          backgroundColor: colors.inputBackground,
          color: colors.onSurfaceVariant,
        },
        message: { marginBottom: 10, padding: 12, borderRadius: radii.sm },
        userMessage: { marginLeft: 36, backgroundColor: isDark ? "rgba(255,140,66,0.14)" : "rgba(173,44,0,0.08)" },
        assistantMessage: { marginRight: 36, backgroundColor: colors.inputBackground },
        messageMeta: { marginBottom: 4, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, color: colors.onSurfaceVariant },
        messageText: { fontSize: 14, lineHeight: 20, color: colors.onSurface },
        error: { marginBottom: 10, padding: 10, borderRadius: radii.sm, color: "#ef4444" },
        form: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
        input: {
          minHeight: 88,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: radii.sm,
          padding: 12,
          color: colors.onSurface,
          backgroundColor: colors.background,
          textAlignVertical: "top",
        },
        formFooter: { marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        clearText: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceVariant },
        sendButton: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: radii.sm,
          backgroundColor: colors.primary,
        },
        sendText: { fontSize: 14, fontWeight: "800", color: "#ffffff" },
        disabled: { opacity: 0.5 },
      }),
    [colors, isDark, radii.md, radii.sm],
  );

  const loadConversation = useCallback(async () => {
    try {
      const res = await apiFetch("/api/assistant");
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { messages?: AtheneMessage[] };
      setMessages(data.messages ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadConversation();
  }, [loadConversation]);

  const open = useCallback(() => {
    setVisible(true);
    void loadConversation();
  }, [loadConversation]);

  const openWithContext = useCallback(
    (context: AtheneUiContext) => {
      setUiContext(context);
      setVisible(true);
      void loadConversation();
    },
    [loadConversation],
  );

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || busy) return;
    setBusy(true);
    setInput("");
    try {
      const res = await apiFetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, locale: i18n.language, uiContext }),
      });
      if (!res.ok) throw new Error("send_failed");
      const data = (await res.json()) as {
        userMessage?: AtheneMessage;
        assistantMessage?: AtheneMessage;
      };
      setMessages((cur) => [
        ...(data.assistantMessage ? [data.assistantMessage] : []),
        ...(data.userMessage ? [data.userMessage] : []),
        ...cur,
      ]);
    } catch {
      setMessages((cur) => [
        {
          id: `local-${Date.now()}`,
          role: "assistant",
          content: t("assistant.sendError"),
          locale: i18n.language,
          clientContext: uiContext,
          createdAt: new Date().toISOString(),
        },
        ...cur,
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, i18n.language, input, t, uiContext]);

  const value = useMemo(() => ({ busy, open, openWithContext }), [busy, open, openWithContext]);

  return (
    <AtheneAssistantContext.Provider value={value}>
      {children}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.modal}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{t("assistant.title")}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {uiContext?.label ?? t("assistant.globalContext")}
                </Text>
              </View>
              <HapticPressable
                {...androidRippleProps(ripple, true)}
                style={({ pressed }) => [styles.iconButton, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                onPress={() => setVisible(false)}
              >
                <X size={24} color={colors.onSurfaceVariant} />
              </HapticPressable>
            </View>
            <ScrollView style={styles.content}>
              {loadError ? <Text style={styles.error}>{t("assistant.loadError")}</Text> : null}
              {messages.length === 0 ? <Text style={styles.empty}>{t("assistant.empty")}</Text> : null}
              {messages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.message,
                    message.role === "user" ? styles.userMessage : styles.assistantMessage,
                  ]}
                >
                  <Text style={styles.messageMeta}>
                    {message.role === "user" ? t("assistant.you") : "Athene"}
                  </Text>
                  <Text style={styles.messageText}>{message.content}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.form}>
              <TextInput
                style={styles.input}
                multiline
                value={input}
                editable={!busy}
                placeholder={t("assistant.placeholder")}
                placeholderTextColor={colors.onSurfaceVariant}
                onChangeText={setInput}
              />
              <View style={styles.formFooter}>
                <HapticPressable onPress={() => setUiContext(null)}>
                  <Text style={styles.clearText}>{t("assistant.clearContext")}</Text>
                </HapticPressable>
                <HapticPressable
                  disabled={busy || !input.trim()}
                  {...androidRippleProps(ripple)}
                  style={({ pressed }) => [
                    styles.sendButton,
                    (busy || !input.trim()) && styles.disabled,
                    pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
                  ]}
                  onPress={send}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Send size={18} color="#ffffff" />
                  )}
                  <Text style={styles.sendText}>{t("assistant.send")}</Text>
                </HapticPressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </AtheneAssistantContext.Provider>
  );
}

export function useAtheneAssistant(): AtheneAssistantContextValue {
  const ctx = useContext(AtheneAssistantContext);
  if (!ctx) {
    throw new Error("useAtheneAssistant must be used within AtheneAssistantProvider");
  }
  return ctx;
}
