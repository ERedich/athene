import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Camera, Image as ImageIcon, Mic, Reply, Send, X } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HapticPressable } from "./HapticPressable";
import { WorkOrderChatDocumentImage } from "./WorkOrderChatDocumentImage";
import {
  queryKeys,
  sendWorkOrderMessage,
  uploadWorkOrderDocument,
  useWorkOrderMessagesQuery,
} from "../hooks/queries";
import { useWhisperDictation, type WhisperDictationErrorCode } from "../hooks/useWhisperDictation";
import type { WorkOrderMessage } from "../types/api";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  surfaceRippleColor,
} from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

type PendingPhoto = {
  uri: string;
  name: string;
  mimeType: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  orderLabel?: string;
  currentUserId: string | null;
};

function dayKey(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMessageTimestamp(iso: string, locale: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function formatDayLabel(iso: string, locale: string, todayLabel: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  const today = new Date();
  if (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  ) {
    return todayLabel;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(value);
}

export function WorkOrderChatSheet({
  visible,
  onClose,
  orderId,
  orderLabel,
  currentUserId,
}: Props) {
  const { t, i18n } = useTranslation();
  const { colors, radii, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const ripple = surfaceRippleColor(isDark);
  const qc = useQueryClient();
  const listRef = useRef<FlatList<WorkOrderMessage>>(null);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<WorkOrderMessage | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [sending, setSending] = useState(false);

  const appendTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft((prev) => (prev.trim() ? `${prev.trimEnd()} ${trimmed}` : trimmed));
  }, []);

  const speech = useWhisperDictation({
    targetLocale: i18n.language,
    disabled: sending || !visible,
    onResult: appendTranscript,
  });

  const voiceErrorMessage = useCallback(
    (code: WhisperDictationErrorCode | null) => {
      if (!code) return null;
      if (code === "permission_denied") return t("assistant.voicePermissionDenied");
      if (code === "transcribe_failed") return t("assistant.voiceTranscribeFailed");
      if (code === "unsupported") return t("assistant.voiceNotSupported");
      return t("assistant.voiceError");
    },
    [t],
  );

  const { data: messages = [], isLoading, isError, refetch } = useWorkOrderMessagesQuery(
    orderId,
    visible,
  );

  useEffect(() => {
    if (!visible) {
      speech.stop();
      setDraft("");
      setReplyTo(null);
      setPendingPhoto(null);
      setSending(false);
      return;
    }
    void refetch();
  }, [refetch, visible]); // eslint-disable-line react-hooks/exhaustive-deps -- stop only on close

  useEffect(() => {
    if (!visible || messages.length === 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [messages.length, visible]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          backgroundColor: colors.surface,
        },
        header: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: Math.max(insets.top, 12),
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        title: { fontSize: 17, fontWeight: "800", color: colors.onSurface },
        subtitle: { marginTop: 2, fontSize: 12, color: colors.onSurfaceVariant },
        iconButton: { padding: 8 },
        list: { flex: 1, paddingHorizontal: 14 },
        listContent: { paddingVertical: 12, paddingBottom: 8 },
        empty: {
          padding: 16,
          textAlign: "center",
          color: colors.onSurfaceVariant,
          fontSize: 14,
        },
        error: { padding: 12, color: "#ef4444", fontSize: 13 },
        dayRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginVertical: 10,
        },
        dayLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
        dayLabel: {
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: colors.onSurfaceVariant,
        },
        bubble: {
          marginBottom: 10,
          padding: 12,
          borderRadius: radii.sm,
          maxWidth: "88%",
        },
        ownBubble: {
          alignSelf: "flex-end",
          backgroundColor: isDark ? "rgba(255,140,66,0.14)" : "rgba(173,44,0,0.08)",
        },
        otherBubble: {
          alignSelf: "flex-start",
          backgroundColor: colors.inputBackground,
        },
        metaRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 4,
        },
        meta: {
          fontSize: 10,
          fontWeight: "800",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: colors.onSurfaceVariant,
          flexShrink: 1,
        },
        metaTime: {
          fontSize: 11,
          color: colors.onSurfaceVariant,
          textTransform: "none",
          letterSpacing: 0,
          fontWeight: "500",
        },
        replyQuote: {
          marginBottom: 6,
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderLeftWidth: 2,
          borderLeftColor: colors.primary,
          backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          borderRadius: 4,
        },
        replyAuthor: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
        replyPreview: { marginTop: 2, fontSize: 12, color: colors.onSurfaceVariant },
        body: { fontSize: 14, lineHeight: 20, color: colors.onSurface },
        form: {
          padding: 12,
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        replyBar: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderLeftWidth: 2,
          borderLeftColor: colors.primary,
          backgroundColor: colors.inputBackground,
          borderRadius: radii.sm,
        },
        replyBarText: { flex: 1, fontSize: 12, color: colors.onSurfaceVariant },
        hint: { marginBottom: 8, fontSize: 11, color: colors.onSurfaceVariant },
        pendingRow: {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
          padding: 8,
          borderRadius: radii.sm,
          backgroundColor: colors.inputBackground,
        },
        pendingThumb: { width: 56, height: 56, borderRadius: 6 },
        pendingMeta: { flex: 1, fontSize: 12, color: colors.onSurfaceVariant },
        input: {
          minHeight: 72,
          maxHeight: 140,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: radii.sm,
          padding: 12,
          color: colors.onSurface,
          backgroundColor: colors.background,
          textAlignVertical: "top",
        },
        formActions: {
          marginTop: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        },
        attachRow: { flexDirection: "row", alignItems: "center", gap: 8 },
        iconAction: {
          width: 40,
          height: 40,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: radii.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        voiceButtonActive: {
          borderColor: colors.primary,
          backgroundColor: isDark ? "rgba(255,140,66,0.14)" : "rgba(173,44,0,0.08)",
        },
        listeningText: { marginTop: 6, fontSize: 12, color: colors.primary },
        voiceErrorText: { marginTop: 6, fontSize: 12, color: "#ef4444" },
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
        loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
        replyBtn: { padding: 4 },
      }),
    [colors, insets.bottom, insets.top, isDark, radii.sm],
  );

  const canSend = Boolean(draft.trim() || pendingPhoto) && !sending && !speech.processing;

  const setPhotoFromAsset = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    const ts = new Date();
    const fallbackName = `photo-${ts.toISOString().replace(/[:.]/g, "-")}.jpg`;
    setPendingPhoto({
      uri: asset.uri,
      name: asset.fileName ?? fallbackName,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }, []);

  const onCapturePhoto = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("", t("workOrders.documentsCameraNotSupportedWeb"));
      return;
    }
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("", t("workOrders.documentsCameraPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || result.assets.length === 0) return;
    setPhotoFromAsset(result.assets[0]!);
  }, [setPhotoFromAsset, t]);

  const onPickGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("", t("workOrders.messagesPhotoLibraryPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
      selectionLimit: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    setPhotoFromAsset(result.assets[0]!);
  }, [setPhotoFromAsset, t]);

  const onAttachPress = useCallback(() => {
    if (Platform.OS === "web") {
      void onPickGallery();
      return;
    }
    Alert.alert(t("workOrders.messagesAttachPhoto"), t("workOrders.messagesAttachChooserTitle"), [
      { text: t("workOrders.messagesAttachCamera"), onPress: () => void onCapturePhoto() },
      { text: t("workOrders.messagesAttachGallery"), onPress: () => void onPickGallery() },
      { text: t("workOrders.cancel"), style: "cancel" },
    ]);
  }, [onCapturePhoto, onPickGallery, t]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !pendingPhoto) || sending || speech.processing) return;
    speech.stop();
    setSending(true);
    try {
      let documentId: string | null = null;
      if (pendingPhoto) {
        const uploaded = await uploadWorkOrderDocument(orderId, {
          file: {
            uri: pendingPhoto.uri,
            name: pendingPhoto.name,
            type: pendingPhoto.mimeType,
          },
          displayName: pendingPhoto.name,
          category: "general",
        });
        documentId = uploaded.id;
        await qc.invalidateQueries({ queryKey: queryKeys.workOrderDocuments(orderId) });
      }
      const created = await sendWorkOrderMessage(orderId, {
        body,
        replyToMessageId: replyTo?.id ?? null,
        documentId,
      });
      qc.setQueryData<WorkOrderMessage[]>(queryKeys.workOrderMessages(orderId), (prev) => {
        const list = Array.isArray(prev) ? prev : [];
        if (list.some((m) => m.id === created.id)) return list;
        return [...list, created];
      });
      setDraft("");
      setReplyTo(null);
      setPendingPhoto(null);
    } catch {
      Alert.alert("", t("workOrders.messagesSendError"));
    } finally {
      setSending(false);
    }
  }, [draft, orderId, pendingPhoto, qc, replyTo?.id, sending, speech.processing, speech.stop, t]);

  const renderItem = useCallback(
    ({ item, index }: { item: WorkOrderMessage; index: number }) => {
      const isOwn = currentUserId != null && item.authorUserId === currentUserId;
      const prev = index > 0 ? messages[index - 1] : null;
      const showDayDivider = !prev || dayKey(prev.createdAt) !== dayKey(item.createdAt);
      return (
        <View>
          {showDayDivider ? (
            <View style={styles.dayRow}>
              <View style={styles.dayLine} />
              <Text style={styles.dayLabel}>
                {formatDayLabel(item.createdAt, i18n.language, t("workOrders.messagesToday"))}
              </Text>
              <View style={styles.dayLine} />
            </View>
          ) : null}
          <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
            <View style={styles.metaRow}>
              <Text style={styles.meta} numberOfLines={1}>
                {isOwn ? t("assistant.you") : item.authorUserName}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {!isOwn ? (
                  <HapticPressable
                    accessibilityLabel={t("workOrders.messagesReply")}
                    style={styles.replyBtn}
                    onPress={() => setReplyTo(item)}
                  >
                    <Reply size={14} color={colors.onSurfaceVariant} />
                  </HapticPressable>
                ) : null}
                <Text style={styles.metaTime}>
                  {formatMessageTimestamp(item.createdAt, i18n.language)}
                </Text>
              </View>
            </View>
            {item.replyToMessageId && item.replyToAuthorUserName ? (
              <View style={styles.replyQuote}>
                <Text style={styles.replyAuthor}>{item.replyToAuthorUserName}</Text>
                {item.replyToBodyPreview ? (
                  <Text style={styles.replyPreview} numberOfLines={2}>
                    {item.replyToBodyPreview}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {item.documentId ? (
              <WorkOrderChatDocumentImage
                orderId={orderId}
                documentId={item.documentId}
                mimeType={item.documentMimeType}
              />
            ) : null}
            {item.body.trim() ? <Text style={styles.body}>{item.body}</Text> : null}
          </View>
        </View>
      );
    },
    [colors.onSurfaceVariant, currentUserId, i18n.language, messages, orderId, styles, t],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t("workOrders.messagesTitle")}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {orderLabel ?? t("workOrders.edit")}
          </Text>
        </View>
        <HapticPressable
          {...androidRippleProps(ripple, true)}
          style={({ pressed }) => [styles.iconButton, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
          onPress={onClose}
          accessibilityLabel={t("workOrders.cancel")}
        >
          <X size={24} color={colors.onSurfaceVariant} />
        </HapticPressable>
      </View>

      {isLoading && messages.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.empty, { marginTop: 10 }]}>{t("workOrders.messagesLoading")}</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            isError ? (
              <Text style={styles.error}>{t("workOrders.messagesLoadError")}</Text>
            ) : (
              <Text style={styles.empty}>{t("workOrders.messagesEmpty")}</Text>
            )
          }
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      <View style={styles.form}>
        {replyTo ? (
          <View style={styles.replyBar}>
            <Text style={styles.replyBarText} numberOfLines={1}>
              {t("workOrders.messagesReplyingTo", { name: replyTo.authorUserName })}
            </Text>
            <HapticPressable
              accessibilityLabel={t("workOrders.messagesCancelReply")}
              onPress={() => setReplyTo(null)}
            >
              <X size={16} color={colors.onSurfaceVariant} />
            </HapticPressable>
          </View>
        ) : (
          <Text style={styles.hint}>{t("workOrders.messagesDefaultRecipients")}</Text>
        )}

        {pendingPhoto ? (
          <View style={styles.pendingRow}>
            <Image source={{ uri: pendingPhoto.uri }} style={styles.pendingThumb} />
            <Text style={styles.pendingMeta} numberOfLines={2}>
              {pendingPhoto.name}
            </Text>
            <HapticPressable
              accessibilityLabel={t("workOrders.messagesRemovePhoto")}
              onPress={() => setPendingPhoto(null)}
              disabled={sending}
            >
              <X size={18} color={colors.onSurfaceVariant} />
            </HapticPressable>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          multiline
          value={draft}
          editable={!sending && !speech.processing}
          placeholder={t("workOrders.messagesPlaceholder")}
          placeholderTextColor={colors.onSurfaceVariant}
          onChangeText={setDraft}
        />
        {speech.recording ? (
          <Text style={styles.listeningText} accessibilityLiveRegion="polite">
            {t("assistant.listening")}
          </Text>
        ) : null}
        {speech.processing ? (
          <Text style={styles.listeningText} accessibilityLiveRegion="polite">
            {t("assistant.voiceTranscribing")}
          </Text>
        ) : null}
        {voiceErrorMessage(speech.errorCode) ? (
          <Text style={styles.voiceErrorText} accessibilityRole="alert">
            {voiceErrorMessage(speech.errorCode)}
          </Text>
        ) : null}

        <View style={styles.formActions}>
          <View style={styles.attachRow}>
            <HapticPressable
              accessibilityLabel={
                speech.recording ? t("assistant.stopListening") : t("assistant.startListening")
              }
              accessibilityState={{ selected: speech.recording, disabled: !speech.supported }}
              disabled={sending || speech.processing}
              {...androidRippleProps(ripple, true)}
              style={({ pressed }) => [
                styles.iconAction,
                (speech.recording || speech.processing) && speech.supported && styles.voiceButtonActive,
                (sending || !speech.supported || speech.processing) && styles.disabled,
                pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
              ]}
              onPress={() => {
                if (!speech.supported) {
                  Alert.alert(t("assistant.voiceInput"), t("assistant.voiceNotSupported"));
                  return;
                }
                if (!speech.recording) {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                speech.toggleRecording();
              }}
            >
              {speech.processing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Mic
                  size={20}
                  color={
                    speech.recording && speech.supported ? colors.primary : colors.onSurfaceVariant
                  }
                />
              )}
            </HapticPressable>
            <HapticPressable
              accessibilityLabel={t("workOrders.messagesAttachPhoto")}
              disabled={sending || speech.processing}
              {...androidRippleProps(ripple, true)}
              style={({ pressed }) => [
                styles.iconAction,
                (sending || speech.processing) && styles.disabled,
                pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
              ]}
              onPress={onAttachPress}
            >
              <Camera size={20} color={colors.onSurfaceVariant} />
            </HapticPressable>
            {Platform.OS !== "web" ? (
              <HapticPressable
                accessibilityLabel={t("workOrders.messagesAttachGallery")}
                disabled={sending || speech.processing}
                {...androidRippleProps(ripple, true)}
                style={({ pressed }) => [
                  styles.iconAction,
                  (sending || speech.processing) && styles.disabled,
                  pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
                ]}
                onPress={() => void onPickGallery()}
              >
                <ImageIcon size={20} color={colors.onSurfaceVariant} />
              </HapticPressable>
            ) : null}
          </View>
          <HapticPressable
            disabled={!canSend}
            accessibilityLabel={t("workOrders.messagesSend")}
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [
              styles.sendButton,
              !canSend && styles.disabled,
              pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
            ]}
            onPress={() => void handleSend()}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Send size={18} color="#ffffff" />
            )}
            <Text style={styles.sendText}>{t("workOrders.messagesSend")}</Text>
          </HapticPressable>
        </View>
      </View>
      </View>
    </Modal>
  );
}
