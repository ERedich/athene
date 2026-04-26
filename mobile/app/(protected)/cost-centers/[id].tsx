import { MaterialIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../../src/auth/AuthContext";
import { SitePicker } from "../../../src/components/SitePicker";
import { ShellHeaderActions } from "../../../src/components/ShellHeaderActions";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../../src/lib/appParameterKeys";
import { isUuid } from "../../../src/lib/uuid";
import {
  putCostCenter,
  queryKeys,
  useCostCentersQuery,
  useDeleteCostCenterMutation,
  useSitesQuery,
} from "../../../src/hooks/queries";
import { useAppTheme } from "../../../src/theme/AppThemeContext";

export default function CostCenterEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const qc = useQueryClient();
  const { colors } = useAppTheme();
  const { appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { data: sites = [], isLoading: sitesLoading } = useSitesQuery();
  const { data: rows = [], isLoading: rowsLoading } = useCostCentersQuery();
  const deleteMutation = useDeleteCostCenterMutation();

  const row = useMemo(() => rows.find((r) => r.id === id), [rows, id]);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        center: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: colors.background,
        },
        errText: { color: colors.onSurface },
        scroll: { padding: 16, paddingBottom: 40, backgroundColor: colors.background },
        label: { fontSize: 12, fontWeight: "600", marginBottom: 6, color: colors.outline },
        hint: { fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 12 },
        input: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 12,
          fontSize: 16,
          marginBottom: 14,
          backgroundColor: colors.inputBackground,
          color: colors.onSurface,
        },
        rowBetween: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          marginTop: 8,
        },
        actions: { flexDirection: "row", gap: 12, marginTop: 8 },
        secondary: {
          flex: 1,
          padding: 14,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          alignItems: "center",
        },
        secondaryText: { fontWeight: "600", color: colors.onSurface },
        primary: {
          flex: 1,
          padding: 14,
          borderRadius: 8,
          backgroundColor: colors.primary,
          alignItems: "center",
        },
        primaryText: { fontWeight: "700", color: "#fff" },
      }),
    [colors],
  );

  useLayoutEffect(() => {
    if (!row) return;
    if (hydrated) return;
    setKey(row.key);
    setName(row.name);
    setSiteId(row.siteId);
    setIsActive(row.isActive);
    setHydrated(true);
  }, [row, hydrated]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ShellHeaderActions
          extra={
            <Pressable
              onPress={() => {
                Alert.alert(t("costCenters.delete"), t("costCenters.deleteConfirm"), [
                  { text: t("costCenters.cancel"), style: "cancel" },
                  {
                    text: t("costCenters.delete"),
                    style: "destructive",
                    onPress: () => {
                      void (async () => {
                        try {
                          await deleteMutation.mutateAsync(String(id));
                          await qc.invalidateQueries({ queryKey: queryKeys.costCenters });
                          router.back();
                        } catch {
                          Alert.alert("", t("costCenters.saveError"));
                        }
                      })();
                    },
                  },
                ]);
              }}
              style={{ paddingHorizontal: 6 }}
            >
              <MaterialIcons name="delete-outline" size={24} color="#b91c1c" />
            </Pressable>
          }
        />
      ),
    });
  }, [deleteMutation, id, navigation, qc, router, t]);

  async function onSave() {
    const k = key.trim();
    const n = name.trim();
    if (!id || !isUuid(String(id)) || !k || !n || !siteId) {
      Alert.alert("", t("costCenters.saveError"));
      return;
    }
    setSaving(true);
    try {
      await putCostCenter(String(id), { key: k, name: n, siteId, isActive });
      await qc.invalidateQueries({ queryKey: queryKeys.costCenters });
      router.back();
    } catch {
      Alert.alert("", t("costCenters.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (!id || !isUuid(String(id))) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{t("costCenters.loadError")}</Text>
      </View>
    );
  }

  if (rowsLoading || sitesLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>{t("costCenters.loadError")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.label}>{t("costCenters.key")}</Text>
      <TextInput value={key} onChangeText={setKey} style={styles.input} autoCapitalize="none" />

      <Text style={styles.label}>{t("costCenters.name")}</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} />

      <SitePicker
        sites={sites}
        value={siteId || row.siteId}
        onChange={setSiteId}
        disabled={siteFieldLocked}
        label={t("costCenters.site")}
      />
      {siteFieldLocked ? (
        <Text style={styles.hint}>{t("costCenters.siteLocked")}</Text>
      ) : null}

      <View style={styles.rowBetween}>
        <Text style={styles.label}>{t("costCenters.active")}</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>{t("costCenters.cancel")}</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={() => void onSave()} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>{t("costCenters.save")}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}
