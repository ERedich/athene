import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
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
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../../src/lib/appParameterKeys";
import { postCostCenter, queryKeys, useCostCentersQuery, useSitesQuery } from "../../../src/hooks/queries";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  surfaceRippleColor,
} from "../../../src/styles/pressableFeedback";
import { useAppTheme } from "../../../src/theme/AppThemeContext";

export default function CostCenterNewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const btnRipple = surfaceRippleColor(isDark);
  const { user, appParameterBooleans } = useAuth();
  const { data: sites = [], isLoading: sitesLoading } = useSitesQuery();
  const { refetch: refetchCc } = useCostCentersQuery();

  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];

  const defaultSiteId = useMemo(() => {
    if (sites.length === 0) return "";
    const w = user?.workingSiteId;
    if (w && sites.some((s) => s.id === w)) return w;
    return sites[0]!.id;
  }, [sites, user?.workingSiteId]);

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
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
    if (siteId === "" && defaultSiteId) setSiteId(defaultSiteId);
  }, [defaultSiteId, siteId]);

  async function onSave() {
    const k = key.trim();
    const n = name.trim();
    if (!k || !n || !siteId) {
      Alert.alert("", t("costCenters.saveError"));
      return;
    }
    setSaving(true);
    try {
      await postCostCenter({ key: k, name: n, siteId, isActive });
      await qc.invalidateQueries({ queryKey: queryKeys.costCenters });
      await refetchCc();
      router.back();
    } catch {
      Alert.alert("", t("costCenters.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (sitesLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
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
        value={siteId || defaultSiteId}
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
        <Pressable
          {...androidRippleProps(btnRipple)}
          style={({ pressed }) => [styles.secondary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryText}>{t("costCenters.cancel")}</Text>
        </Pressable>
        <Pressable
          {...androidRippleProps(btnRipple)}
          style={({ pressed }) => [styles.primary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
          onPress={() => void onSave()}
          disabled={saving}
        >
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
