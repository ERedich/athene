import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import { useLocalSearchParams, router } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { HapticPressable } from "../../../../src/components/HapticPressable";
import { postWorkOrderSignoff, queryKeys } from "../../../../src/hooks/queries";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  surfaceRippleColor,
} from "../../../../src/styles/pressableFeedback";
import { useAppTheme } from "../../../../src/theme/AppThemeContext";

type Point = { x: number; y: number };
type Stroke = Point[];

const PAD_WIDTH = 320;
const PAD_HEIGHT = 180;

function strokesToSvg(strokes: Stroke[], width: number, height: number): string {
  const lines = strokes
    .filter((stroke) => stroke.length >= 2)
    .map((stroke) => {
      const points = stroke.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="#111827" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/>${lines}</svg>`;
}

async function writeSignatureSvg(strokes: Stroke[]): Promise<{ uri: string; name: string; type: string }> {
  const svg = strokesToSvg(strokes, PAD_WIDTH, PAD_HEIGHT);
  if (Platform.OS === "web") {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    return { uri: URL.createObjectURL(blob), name: "signoff.svg", type: "image/svg+xml" };
  }
  const dir = new Directory(Paths.cache, "athene-signoff");
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  const file = new File(dir, `signoff-${Date.now()}.svg`);
  if (file.exists) file.delete();
  file.create({ intermediates: true, overwrite: true });
  file.write(svg);
  return { uri: file.uri, name: file.name, type: "image/svg+xml" };
}

export default function WorkOrderSignoffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";
  const { t } = useTranslation();
  const { colors, isDark, radii } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);
  const qc = useQueryClient();

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke>([]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("signoff.jpg");
  const [photoType, setPhotoType] = useState("image/jpeg");
  const [displayName, setDisplayName] = useState("");
  const [remark, setRemark] = useState("");
  const [satisfaction, setSatisfaction] = useState("");
  const [saving, setSaving] = useState(false);
  const padRef = useRef<View>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.background },
        content: { padding: 16, paddingBottom: 32, gap: 16 },
        label: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceVariant, marginBottom: 6 },
        input: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          borderRadius: radii.sm,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          color: colors.onSurface,
          backgroundColor: colors.surface,
        },
        padWrap: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radii.sm,
          backgroundColor: "#fff",
          overflow: "hidden",
          alignSelf: "stretch",
        },
        pad: { width: "100%", height: PAD_HEIGHT, backgroundColor: "#fff" },
        padHint: {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: "none",
        },
        padHintText: { color: "rgb(148,163,184)", fontSize: 14 },
        strokeDot: {
          position: "absolute",
          width: 3,
          height: 3,
          borderRadius: 1.5,
          backgroundColor: "#111827",
        },
        photoPreview: { width: "100%", height: 160, borderRadius: radii.sm, backgroundColor: colors.surface },
        row: { flexDirection: "row", gap: 8 },
        btn: {
          flex: 1,
          paddingVertical: 12,
          alignItems: "center",
          borderRadius: radii.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        btnText: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
        submit: {
          paddingVertical: 14,
          alignItems: "center",
          borderRadius: radii.sm,
          backgroundColor: colors.primary,
        },
        submitDisabled: { opacity: 0.55 },
        submitText: { fontSize: 15, fontWeight: "700", color: "#ffffff" },
      }),
    [colors.background, colors.border, colors.onSurface, colors.onSurfaceVariant, colors.primary, colors.surface, radii.sm],
  );

  const allStrokes = useMemo(
    () => (currentStroke.length ? [...strokes, currentStroke] : strokes),
    [currentStroke, strokes],
  );
  const hasDrawing = allStrokes.some((stroke) => stroke.length >= 2);
  const canSubmit = Boolean(photoUri || hasDrawing);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setPhotoUri(null);
          setCurrentStroke([{ x: locationX, y: locationY }]);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          setCurrentStroke((prev) => [...prev, { x: locationX, y: locationY }]);
        },
        onPanResponderRelease: () => {
          setCurrentStroke((prev) => {
            if (prev.length >= 2) setStrokes((s) => [...s, prev]);
            return [];
          });
        },
        onPanResponderTerminate: () => {
          setCurrentStroke((prev) => {
            if (prev.length >= 2) setStrokes((s) => [...s, prev]);
            return [];
          });
        },
      }),
    [],
  );

  const clearSignature = useCallback(() => {
    setStrokes([]);
    setCurrentStroke([]);
    setPhotoUri(null);
  }, []);

  const setPhotoFromAsset = useCallback((asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.uri) return;
    setStrokes([]);
    setCurrentStroke([]);
    setPhotoUri(asset.uri);
    setPhotoName(asset.fileName ?? "signoff.jpg");
    setPhotoType(asset.mimeType ?? "image/jpeg");
  }, []);

  const pickCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("workOrders.signoffTitle"), t("workOrders.signoffCameraPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) setPhotoFromAsset(result.assets[0]);
  }, [setPhotoFromAsset, t]);

  const pickGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t("workOrders.signoffTitle"), t("workOrders.signoffGalleryPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) setPhotoFromAsset(result.assets[0]);
  }, [setPhotoFromAsset, t]);

  const onSubmit = useCallback(async () => {
    if (!orderId || saving) return;
    if (!canSubmit) {
      Alert.alert(t("workOrders.signoffTitle"), t("workOrders.signoffSignatureRequired"));
      return;
    }
    setSaving(true);
    try {
      const file = photoUri
        ? { uri: photoUri, name: photoName, type: photoType }
        : await writeSignatureSvg(allStrokes.filter((stroke) => stroke.length >= 2));
      await postWorkOrderSignoff(orderId, {
        file,
        remark: remark.trim() || null,
        satisfaction: satisfaction.trim() || null,
        displayName: displayName.trim() || t("workOrders.signoffDefaultDisplayName"),
      });
      await qc.invalidateQueries({ queryKey: [...queryKeys.workOrders] });
      Alert.alert(t("workOrders.signoffTitle"), t("workOrders.signoffSaved"), [
        { text: t("workOrders.done"), onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(t("workOrders.signoffTitle"), t("workOrders.signoffSaveError"));
    } finally {
      setSaving(false);
    }
  }, [
    allStrokes,
    canSubmit,
    displayName,
    orderId,
    photoName,
    photoType,
    photoUri,
    qc,
    remark,
    satisfaction,
    saving,
    t,
  ]);

  if (!orderId) {
    return (
      <View style={[styles.root, { justifyContent: "center", alignItems: "center", padding: 24 }]}>
        <Text style={{ color: colors.onSurfaceVariant }}>{t("workOrders.signoffInvalidOrder")}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={styles.label}>{t("workOrders.signoffSignatureLabel")}</Text>
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="contain" />
        ) : (
          <View style={styles.padWrap}>
            <View ref={padRef} style={styles.pad} {...panResponder.panHandlers}>
              {!hasDrawing ? (
                <View style={styles.padHint}>
                  <Text style={styles.padHintText}>{t("workOrders.signoffDrawHint")}</Text>
                </View>
              ) : null}
              {allStrokes.flatMap((stroke, si) =>
                stroke.map((point, pi) => (
                  <View
                    key={`${si}-${pi}`}
                    style={[styles.strokeDot, { left: point.x - 1.5, top: point.y - 1.5 }]}
                  />
                )),
              )}
            </View>
          </View>
        )}
        <View style={[styles.row, { marginTop: 8 }]}>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [styles.btn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            onPress={() => void pickCamera()}
          >
            <Text style={styles.btnText}>{t("workOrders.signoffCamera")}</Text>
          </HapticPressable>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [styles.btn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            onPress={() => void pickGallery()}
          >
            <Text style={styles.btnText}>{t("workOrders.signoffGallery")}</Text>
          </HapticPressable>
          <HapticPressable
            {...androidRippleProps(ripple)}
            style={({ pressed }) => [styles.btn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            onPress={clearSignature}
          >
            <Text style={styles.btnText}>{t("workOrders.signoffClear")}</Text>
          </HapticPressable>
        </View>
      </View>

      <View>
        <Text style={styles.label}>{t("workOrders.signoffDisplayName")}</Text>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder={t("workOrders.signoffDefaultDisplayName")}
          placeholderTextColor={colors.onSurfaceVariant}
          style={styles.input}
          maxLength={200}
        />
      </View>

      <View>
        <Text style={styles.label}>{t("workOrders.signoffSatisfaction")}</Text>
        <TextInput
          value={satisfaction}
          onChangeText={setSatisfaction}
          placeholder={t("workOrders.signoffSatisfactionPlaceholder")}
          placeholderTextColor={colors.onSurfaceVariant}
          style={styles.input}
          maxLength={200}
        />
      </View>

      <View>
        <Text style={styles.label}>{t("workOrders.signoffRemark")}</Text>
        <TextInput
          value={remark}
          onChangeText={setRemark}
          placeholder={t("workOrders.signoffRemarkPlaceholder")}
          placeholderTextColor={colors.onSurfaceVariant}
          style={[styles.input, { minHeight: 88, textAlignVertical: "top" }]}
          multiline
          maxLength={2000}
        />
      </View>

      <HapticPressable
        disabled={saving || !canSubmit}
        {...androidRippleProps(ripple)}
        style={({ pressed }) => [
          styles.submit,
          (saving || !canSubmit) && styles.submitDisabled,
          !saving && canSubmit && pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
        ]}
        onPress={() => void onSubmit()}
      >
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitText}>{t("workOrders.signoffSubmit")}</Text>
        )}
      </HapticPressable>
    </ScrollView>
  );
}
