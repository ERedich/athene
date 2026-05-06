import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../auth/AuthContext";
import { ClassificationPicker } from "../../components/ClassificationPicker";
import { CostCenterPicker } from "../../components/CostCenterPicker";
import { ParentAssetPicker } from "../../components/ParentAssetPicker";
import { SelectModal, type SelectItem } from "../../components/SelectModal";
import { SitePicker } from "../../components/SitePicker";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../lib/appParameterKeys";
import { isValidDateOnly } from "../../lib/dateValidation";
import { isUuid } from "../../lib/uuid";
import {
  postAsset,
  putAsset,
  queryKeys,
  type AssetSaveBody,
  useAssetsQuery,
  useClassificationsQuery,
  useCostCentersQuery,
  useDeleteAssetMutation,
  useSitesQuery,
} from "../../hooks/queries";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  PRESSED_OPACITY_ROW,
  surfaceRippleColor,
} from "../../styles/pressableFeedback";
import { allowedAssetTypes } from "../../types/assetRules";
import type { AssetType } from "../../types/api";
import { useAppTheme } from "../../theme/AppThemeContext";

type Props = {
  /** When omitted, create mode. */
  assetId?: string;
};

function trimOrNull(s: string): string | null {
  const t = s.trim();
  return t ? t : null;
}

export function AssetEditor({ assetId }: Props) {
  const isNew = !assetId;
  const { t } = useTranslation();
  const router = useRouter();
  const qc = useQueryClient();
  const { user, appParameterBooleans, appParameterAssetKeyMode } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];
  const { colors, isDark } = useAppTheme();
  const ripple = surfaceRippleColor(isDark);

  const { data: sites = [], isLoading: sitesLoading } = useSitesQuery();
  const { data: costCenters = [], isLoading: ccLoading } = useCostCentersQuery();
  const { data: classifications = [], isLoading: clfLoading } = useClassificationsQuery();
  const { data: assets = [], isLoading: assetsLoading } = useAssetsQuery();
  const deleteMutation = useDeleteAssetMutation();

  const defaultSiteId = useMemo(() => {
    if (sites.length === 0) return "";
    const w = user?.workingSiteId;
    if (w && sites.some((s) => s.id === w)) return w;
    return sites[0]!.id;
  }, [sites, user?.workingSiteId]);

  const row = useMemo(
    () => (assetId && isUuid(assetId) ? assets.find((a) => a.id === assetId) : undefined),
    [assets, assetId],
  );

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [type, setType] = useState<AssetType>("maintenanceObject");
  const [parentAssetId, setParentAssetId] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState("");
  const [buildDate, setBuildDate] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [remark, setRemark] = useState("");
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [classificationId, setClassificationId] = useState<string | null>(null);
  const [typeModal, setTypeModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isNew || siteId) return;
    if (defaultSiteId) setSiteId(defaultSiteId);
  }, [isNew, defaultSiteId, siteId]);

  useEffect(() => {
    if (isNew || !row || hydrated) return;
    setKey(row.key);
    setName(row.name);
    setSiteId(row.siteId);
    setType(row.type);
    setParentAssetId(row.parentAssetId);
    setSerialNumber(row.serialNumber ?? "");
    setBuildDate(row.buildDate ?? "");
    setManufacturer(row.manufacturer ?? "");
    setRemark(row.remark ?? "");
    setCostCenterId(row.costCenterId);
    setClassificationId(row.classificationId);
    setHydrated(true);
  }, [isNew, row, hydrated]);

  useEffect(() => {
    if (costCenterId) {
      const cc = costCenters.find((c) => c.id === costCenterId);
      if (!cc || cc.siteId !== siteId) setCostCenterId(null);
    }
  }, [siteId, costCenterId, costCenters]);

  useEffect(() => {
    if (!classificationId) return;
    const ok = classifications.some(
      (c) =>
        c.id === classificationId &&
        c.siteId === siteId &&
        c.appliesToAsset,
    );
    if (!ok) setClassificationId(null);
  }, [siteId, classificationId, classifications]);

  const typeItems: SelectItem[] = useMemo(
    () =>
      allowedAssetTypes.map((tp) => ({
        id: tp,
        label: t(`assets.types.${tp}`),
      })),
    [t],
  );

  const selectedSiteIsPlant = useMemo(
    () => sites.find((s) => s.id === siteId)?.isPlant === true,
    [sites, siteId],
  );
  const assetKeyReadOnly =
    appParameterAssetKeyMode === "auto_incremental" && selectedSiteIsPlant;

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
        scroll: { padding: 16, paddingBottom: 48, backgroundColor: colors.background },
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
        inputLike: {
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          padding: 14,
          marginBottom: 14,
          backgroundColor: colors.inputBackground,
        },
        inputLikeText: { fontSize: 16, color: colors.onSurface },
        remark: { minHeight: 100, textAlignVertical: "top" },
        counter: { fontSize: 12, color: colors.outline, marginTop: -8, marginBottom: 16 },
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
        danger: {
          marginTop: 20,
          padding: 14,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isDark ? "rgba(248, 113, 113, 0.45)" : "#fecaca",
          backgroundColor: isDark ? "rgba(127, 29, 29, 0.35)" : "#fef2f2",
          alignItems: "center",
        },
        dangerText: { fontWeight: "700", color: "#f87171" },
      }),
    [colors, isDark],
  );

  async function onSave() {
    const k = key.trim();
    const n = name.trim();
    const bd = buildDate.trim();
    const createAutoPlant =
      isNew && appParameterAssetKeyMode === "auto_incremental" && selectedSiteIsPlant;
    if (!n || !siteId || !isUuid(siteId)) {
      Alert.alert("", t("assets.saveError"));
      return;
    }
    if (!createAutoPlant && !k) {
      Alert.alert("", t("assets.saveError"));
      return;
    }
    if (bd && !isValidDateOnly(bd)) {
      Alert.alert("", t("assets.invalidDate"));
      return;
    }
    if (remark.length > 2000) {
      Alert.alert("", t("assets.remarkTooLong"));
      return;
    }

    const body: AssetSaveBody = {
      key: createAutoPlant ? "" : k,
      name: n,
      siteId,
      type,
      parentAssetId,
      serialNumber: trimOrNull(serialNumber),
      buildDate: bd ? bd : null,
      manufacturer: trimOrNull(manufacturer),
      remark: trimOrNull(remark),
      costCenterId,
      classificationId,
    };

    setSaving(true);
    try {
      if (isNew) {
        await postAsset(body);
      } else {
        if (!assetId || !isUuid(assetId)) throw new Error("id");
        await putAsset(assetId, body);
      }
      await qc.invalidateQueries({ queryKey: queryKeys.assets });
      router.back();
    } catch {
      Alert.alert("", t("assets.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!assetId || !isUuid(assetId)) return;
    Alert.alert(t("assets.delete"), t("assets.deleteConfirm"), [
      { text: t("assets.cancel"), style: "cancel" },
      {
        text: t("assets.delete"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteMutation.mutateAsync(assetId);
              await qc.invalidateQueries({ queryKey: queryKeys.assets });
              router.back();
            } catch {
              Alert.alert("", t("assets.saveError"));
            }
          })();
        },
      },
    ]);
  }

  if (sitesLoading || ccLoading || clfLoading || assetsLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isNew) {
    if (!assetId || !isUuid(String(assetId))) {
      return (
        <View style={styles.center}>
          <Text style={styles.errText}>{t("assets.loadError")}</Text>
        </View>
      );
    }
    if (!row) {
      return (
        <View style={styles.center}>
          <Text style={styles.errText}>{t("assets.loadError")}</Text>
        </View>
      );
    }
  }

  const remarkLen = remark.length;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.label}>{t("assets.key")}</Text>
      <TextInput
        value={key}
        onChangeText={setKey}
        style={styles.input}
        autoCapitalize="none"
        editable={!assetKeyReadOnly}
        placeholder={assetKeyReadOnly && isNew ? t("assets.keyAutoHint") : undefined}
      />
      {assetKeyReadOnly && isNew ? <Text style={styles.hint}>{t("assets.keyAutoHint")}</Text> : null}

      <Text style={styles.label}>{t("assets.name")}</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} />

      <SitePicker
        sites={sites}
        value={siteId || defaultSiteId}
        onChange={setSiteId}
        disabled={siteFieldLocked}
        label={t("assets.site")}
      />
      {siteFieldLocked ? <Text style={styles.hint}>{t("assets.siteLocked")}</Text> : null}

      <Text style={styles.label}>{t("assets.type")}</Text>
      <Pressable
        {...androidRippleProps(ripple)}
        onPress={() => setTypeModal(true)}
        style={({ pressed }) => [styles.inputLike, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
      >
        <Text style={styles.inputLikeText}>{t(`assets.types.${type}`)}</Text>
      </Pressable>
      <SelectModal
        visible={typeModal}
        title={t("assets.type")}
        items={typeItems}
        onSelect={(id) => setType(id as AssetType)}
        onClose={() => setTypeModal(false)}
      />

      <ParentAssetPicker
        assets={assets}
        siteId={siteId || defaultSiteId}
        childType={type}
        value={parentAssetId}
        onChange={setParentAssetId}
        label={t("assets.parent")}
        noneLabel={t("assets.parentNone")}
        excludeAssetId={isNew ? undefined : assetId}
      />

      <Text style={styles.label}>{t("assets.serial")}</Text>
      <TextInput value={serialNumber} onChangeText={setSerialNumber} style={styles.input} />

      <Text style={styles.label}>{t("assets.buildDate")}</Text>
      <TextInput
        value={buildDate}
        onChangeText={setBuildDate}
        placeholder="YYYY-MM-DD"
        style={styles.input}
        autoCapitalize="none"
      />

      <Text style={styles.label}>{t("assets.manufacturer")}</Text>
      <TextInput value={manufacturer} onChangeText={setManufacturer} style={styles.input} />

      <CostCenterPicker
        costCenters={costCenters}
        siteId={siteId || defaultSiteId}
        value={costCenterId}
        onChange={setCostCenterId}
        label={t("assets.costCenter")}
        noneLabel={t("assets.costCenterNone")}
      />

      <ClassificationPicker
        classifications={classifications}
        siteId={siteId || defaultSiteId}
        scope="asset"
        value={classificationId}
        onChange={setClassificationId}
        label={t("assets.classification")}
        noneLabel={t("assets.classificationNone")}
      />

      <Text style={styles.label}>{t("assets.remark")}</Text>
      <TextInput
        value={remark}
        onChangeText={setRemark}
        style={[styles.input, styles.remark]}
        multiline
      />
      <Text style={styles.counter}>{t("assets.remarkCount", { count: remarkLen, max: 2000 })}</Text>

      <View style={styles.actions}>
        <Pressable
          {...androidRippleProps(ripple)}
          style={({ pressed }) => [styles.secondary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryText}>{t("assets.cancel")}</Text>
        </Pressable>
        <Pressable
          {...androidRippleProps(ripple)}
          style={({ pressed }) => [styles.primary, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
          onPress={() => void onSave()}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>{t("assets.save")}</Text>
          )}
        </Pressable>
      </View>

      {!isNew ? (
        <Pressable
          {...androidRippleProps(ripple)}
          style={({ pressed }) => [styles.danger, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
          onPress={() => void onDelete()}
        >
          <Text style={styles.dangerText}>{t("assets.delete")}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
