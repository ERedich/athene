import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { resolveWorkOrderDocumentUri } from "../lib/documentLocalUri";
import { useAppTheme } from "../theme/AppThemeContext";

type Props = {
  orderId: string;
  documentId: string;
  mimeType: string | null;
  style?: object;
};

export function WorkOrderChatDocumentImage({ orderId, documentId, mimeType, style }: Props) {
  const { colors } = useAppTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isImage = (mimeType ?? "").startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    let revoked: string | null = null;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setUri(null);
    void (async () => {
      try {
        const next = await resolveWorkOrderDocumentUri(orderId, documentId, mimeType);
        if (cancelled) {
          if (Platform.OS === "web") URL.revokeObjectURL(next);
          return;
        }
        if (Platform.OS === "web") revoked = next;
        setUri(next);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [documentId, isImage, mimeType, orderId]);

  if (!isImage) return null;

  if (loading) {
    return (
      <View style={[styles.placeholder, style, { backgroundColor: colors.inputBackground }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (failed || !uri) return null;

  return (
    <>
      <Pressable onPress={() => setPreviewOpen(true)} accessibilityRole="imagebutton">
        <Image source={{ uri }} style={[styles.image, style]} resizeMode="cover" />
      </Pressable>
      <Modal visible={previewOpen} transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewOpen(false)}>
          <Image source={{ uri }} style={styles.previewImage} resizeMode="contain" />
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
    height: 180,
    borderRadius: 6,
    marginBottom: 6,
  },
  placeholder: {
    width: "100%",
    height: 180,
    borderRadius: 6,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
});
