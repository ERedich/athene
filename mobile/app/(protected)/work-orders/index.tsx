import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ShellHeaderActions } from "../../../src/components/ShellHeaderActions";
import { useDeleteWorkOrderMutation, useWorkOrdersQuery } from "../../../src/hooks/queries";
import { useAppTheme } from "../../../src/theme/AppThemeContext";

export default function WorkOrdersListScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const [q, setQ] = useState("");
  const { data = [], isLoading, isError, refetch } = useWorkOrdersQuery();
  const deleteMutation = useDeleteWorkOrderMutation();

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
        empty: { textAlign: "center", color: colors.onSurfaceVariant, marginTop: 32 },
        emptyList: { flexGrow: 1 },
        newBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
        newBtnText: { fontSize: 14, fontWeight: "700", color: colors.primary },
        docChip: {
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
          marginRight: 6,
        },
        docChipBlue: { backgroundColor: "rgb(103,232,249)" },
        docChipGreen: { backgroundColor: "rgb(134,239,172)" },
        docChipMuted: { backgroundColor: "transparent" },
        docChipText: { color: "rgb(15,23,42)", fontWeight: "700", fontSize: 12 },
      }),
    [
      colors.background,
      colors.border,
      colors.onSurface,
      colors.onSurfaceVariant,
      colors.primary,
      colors.surface,
    ],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ShellHeaderActions
          extra={
            <Pressable onPress={() => router.push("/work-orders/new")} style={styles.newBtn}>
              <MaterialIcons name="add" size={22} color={colors.primary} />
              <Text style={styles.newBtnText}>{t("workOrders.new")}</Text>
            </Pressable>
          }
        />
      ),
    });
  }, [colors.primary, navigation, router, styles.newBtn, styles.newBtnText, t]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data;
    return data.filter((row) =>
      [
        row.orderNumber,
        row.name,
        row.description ?? "",
        row.assetKey,
        row.assetName,
        row.costCenterKey,
        row.costCenterName,
        row.siteKey,
        row.siteName,
        row.orderType,
        row.createdBy,
        row.updatedBy,
      ]
        .join(" ")
        .toLowerCase()
        .includes(s),
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
        <Text style={styles.err}>{t("workOrders.loadError")}</Text>
        <Pressable onPress={() => void refetch()} style={styles.retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
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
            <MaterialIcons name="search" size={20} color={colors.onSurfaceVariant} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t("workOrders.searchPlaceholder")}
              placeholderTextColor={colors.onSurfaceVariant}
              style={styles.search}
            />
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>{t("workOrders.empty")}</Text>}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
            onPress={() => router.push({ pathname: "/work-orders/[id]", params: { id: item.id } })}
            onLongPress={() => {
              Alert.alert(t("workOrders.confirmDeleteTitle"), t("workOrders.confirmDelete", { name: item.name }), [
                { text: t("workOrders.no"), style: "cancel" },
                {
                  text: t("workOrders.yes"),
                  style: "destructive",
                  onPress: () => {
                    void deleteMutation.mutateAsync(item.id).catch(() => {
                      Alert.alert("", t("workOrders.deleteError"));
                    });
                  },
                },
              ]);
            }}
          >
            <View style={styles.rowMain}>
              <Text style={styles.key}>{item.orderNumber}</Text>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.type}>
                {item.assetKey} — {item.assetName}
              </Text>
              <Text style={styles.type}>
                {t(`workOrders.typeValues.${item.orderType}`)} ·{" "}
                {new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }).format(
                  new Date(item.plannedStart),
                )}
              </Text>
            </View>
            {(() => {
              const own = item.documentCount;
              const asset = item.assetDocumentCount;
              const total = own + asset;
              const isAssetOnly = own === 0 && asset > 0;
              return (
                <View
                  style={[
                    styles.docChip,
                    total === 0 ? styles.docChipMuted : isAssetOnly ? styles.docChipGreen : styles.docChipBlue,
                  ]}
                >
                  <MaterialIcons
                    name="description"
                    size={16}
                    color={total === 0 ? "rgb(125,211,252)" : "rgb(15,23,42)"}
                  />
                  {total > 0 ? <Text style={styles.docChipText}>{total}</Text> : null}
                </View>
              );
            })()}
            <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
          </Pressable>
        )}
      />
    </View>
  );
}
