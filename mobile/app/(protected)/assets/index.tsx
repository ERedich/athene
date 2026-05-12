import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ShellHeaderActions } from "../../../src/components/ShellHeaderActions";
import { HapticPressable } from "../../../src/components/HapticPressable";
import { useAssetsQuery, useDeleteAssetMutation } from "../../../src/hooks/queries";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  PRESSED_OPACITY_ROW,
  surfaceRippleColor,
} from "../../../src/styles/pressableFeedback";
import { useAppTheme } from "../../../src/theme/AppThemeContext";

export default function AssetsListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const rowRipple = surfaceRippleColor(isDark);
  const [q, setQ] = useState("");
  const { data = [], isLoading, isError, refetch } = useAssetsQuery();
  const deleteMutation = useDeleteAssetMutation();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
        err: { color: colors.primary, marginBottom: 12 },
        retry: { padding: 12 },
        retryText: { color: colors.primary, fontWeight: "600" },
        searchWrap: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 16,
          marginVertical: 12,
          paddingHorizontal: 12,
          height: 40,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        search: { flex: 1, fontSize: 15, color: colors.onSurface },
        row: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        },
        rowMain: { flex: 1 },
        key: { fontSize: 13, fontWeight: "700", color: colors.primary },
        name: { fontSize: 16, fontWeight: "600", color: colors.onSurface, marginTop: 2 },
        type: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
        cc: { fontSize: 12, color: colors.outline, marginTop: 2 },
        empty: { textAlign: "center", color: colors.onSurfaceVariant, marginTop: 32 },
        emptyList: { flexGrow: 1 },
        newBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
        newBtnText: { fontSize: 14, fontWeight: "700", color: colors.primary },
      }),
    [
      colors.background,
      colors.border,
      colors.onSurface,
      colors.onSurfaceVariant,
      colors.outline,
      colors.primary,
      colors.surface,
    ],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ShellHeaderActions
          extra={
            <HapticPressable
              onPress={() => router.push("/assets/new")}
              {...androidRippleProps(rowRipple, true)}
              style={({ pressed }) => [styles.newBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            >
              <MaterialIcons name="add" size={22} color={colors.primary} />
              <Text style={styles.newBtnText}>{t("assets.new")}</Text>
            </HapticPressable>
          }
        />
      ),
    });
  }, [colors.primary, navigation, router, rowRipple, styles.newBtn, styles.newBtnText, t]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter(
      (row) =>
        row.key.toLowerCase().includes(s) ||
        row.name.toLowerCase().includes(s) ||
        row.type.toLowerCase().includes(s) ||
        (row.costCenterKey && row.costCenterKey.toLowerCase().includes(s)),
    );
  }, [data, q]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{t("assets.loadError")}</Text>
        <HapticPressable
          onPress={() => void refetch()}
          {...androidRippleProps(rowRipple, true)}
          style={({ pressed }) => [styles.retry, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </HapticPressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.searchWrap}>
            <MaterialIcons name="search" size={20} color={colors.outline} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t("shell.search")}
              placeholderTextColor={colors.outline}
              style={styles.search}
            />
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>{t("assets.empty")}</Text>}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
        renderItem={({ item }) => (
          <HapticPressable
            {...androidRippleProps(rowRipple)}
            style={({ pressed }) => [styles.row, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
            onPress={() => router.push(`/assets/${item.id}`)}
            onLongPress={() => {
              Alert.alert(t("assets.delete"), t("assets.deleteConfirm"), [
                { text: t("assets.cancel"), style: "cancel" },
                {
                  text: t("assets.delete"),
                  style: "destructive",
                  onPress: () => {
                    void deleteMutation.mutateAsync(item.id).catch(() => {
                      Alert.alert("", t("assets.saveError"));
                    });
                  },
                },
              ]);
            }}
          >
            <View style={styles.rowMain}>
              <Text style={styles.key}>{item.key}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>{t(`assets.types.${item.type}`)}</Text>
              {item.costCenterKey ? (
                <Text style={styles.cc}>
                  {item.costCenterKey} — {item.costCenterName}
                </Text>
              ) : null}
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
          </HapticPressable>
        )}
      />
    </View>
  );
}
