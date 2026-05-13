import { ChevronRight, Plus, Search } from "lucide-react-native";
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
import { useCostCentersQuery, useDeleteCostCenterMutation } from "../../../src/hooks/queries";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  PRESSED_OPACITY_ROW,
  surfaceRippleColor,
} from "../../../src/styles/pressableFeedback";
import { useAppTheme } from "../../../src/theme/AppThemeContext";

export default function CostCentersListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, isDark } = useAppTheme();
  const rowRipple = surfaceRippleColor(isDark);
  const [q, setQ] = useState("");
  const { data = [], isLoading, isError, refetch } = useCostCentersQuery();
  const deleteMutation = useDeleteCostCenterMutation();

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
        meta: { fontSize: 12, color: colors.outline, marginTop: 2 },
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
              onPress={() => router.push("/cost-centers/new")}
              {...androidRippleProps(rowRipple, true)}
              style={({ pressed }) => [styles.newBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            >
              <Plus size={22} color={colors.primary} />
              <Text style={styles.newBtnText}>{t("costCenters.new")}</Text>
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
        row.siteKey.toLowerCase().includes(s) ||
        row.siteName.toLowerCase().includes(s),
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
        <Text style={styles.err}>{t("costCenters.loadError")}</Text>
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
            <Search size={20} color={colors.outline} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t("shell.search")}
              placeholderTextColor={colors.outline}
              style={styles.search}
            />
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>{t("costCenters.empty")}</Text>}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
        renderItem={({ item }) => (
          <HapticPressable
            {...androidRippleProps(rowRipple)}
            style={({ pressed }) => [styles.row, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
            onPress={() => router.push(`/cost-centers/${item.id}`)}
            onLongPress={() => {
              Alert.alert(t("costCenters.delete"), t("costCenters.deleteConfirm"), [
                { text: t("costCenters.cancel"), style: "cancel" },
                {
                  text: t("costCenters.delete"),
                  style: "destructive",
                  onPress: () => {
                    void deleteMutation.mutateAsync(item.id).catch(() => {
                      Alert.alert("", t("costCenters.saveError"));
                    });
                  },
                },
              ]);
            }}
          >
            <View style={styles.rowMain}>
              <Text style={styles.key}>{item.key}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.isActive ? "●" : "○"}</Text>
            </View>
            <ChevronRight size={22} color={colors.outline} />
          </HapticPressable>
        )}
      />
    </View>
  );
}
