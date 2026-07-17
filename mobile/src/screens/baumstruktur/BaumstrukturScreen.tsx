import {
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardList,
  File,
  MapPin,
  Network,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { BottomSheetModal } from "../../components/BottomSheetModal";
import { HapticPressable } from "../../components/HapticPressable";
import { ShellHeaderActions } from "../../components/ShellHeaderActions";
import { SiteText } from "../../components/SiteText";
import { useAuth } from "../../auth/AuthContext";
import {
  useAssetDocumentsQuery,
  useAssetsQuery,
} from "../../hooks/queries";
import { APP_PARAM_KEY_COLORED_ASSET_TREE } from "../../lib/appParameterKeys";
import {
  assetTypeColorHex,
  assetTypeDisplayLabel,
  assetTypeRowBackground,
  DEFAULT_ASSET_TYPE_DISPLAY_CONFIG,
} from "../../lib/assetTypeDisplay";
import {
  buildAssetTree,
  collectDescendantRefFlags,
  collectExpandableIds,
  filterAssetTree,
  flattenVisibleTree,
  refButtonAppearance,
  type AssetTreeAsset,
  type RefButtonAppearance,
} from "../../lib/assetTree";
import { resolveAssetDocumentUri } from "../../lib/documentLocalUri";
import { isImageMime, openNativeLocalDocument } from "../../lib/openNativeDocument";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  PRESSED_OPACITY_ROW,
  surfaceRippleColor,
} from "../../styles/pressableFeedback";
import { useAppTheme } from "../../theme/AppThemeContext";
import type { AssetDocumentRow, AssetRow, AssetType } from "../../types/api";

const DEPTH_INDENT = 20;
const ROW_BASE_PADDING = 16;

function toTreeAsset(row: AssetRow): AssetTreeAsset {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    siteId: row.siteId,
    siteKey: row.siteKey,
    siteName: row.siteName,
    siteColorHex: row.siteColorHex,
    type: row.type,
    parentAssetId: row.parentAssetId,
    parentAssetKey: row.parentAssetKey,
    parentAssetName: row.parentAssetName,
    parentAssetType: row.parentAssetType,
    documentCount: row.documentCount ?? 0,
    workOrderCount: row.workOrderCount ?? 0,
  };
}

function assetTypeIcon(type: AssetType): LucideIcon {
  switch (type) {
    case "site":
      return MapPin;
    case "structure":
      return Network;
    case "line":
      return ArrowLeftRight;
    case "maintenanceObject":
      return Wrench;
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Match web `app-ref-button--documents` / `--work-orders` (frontend/src/index.css). */
const REF_COLORS = {
  documents: {
    bg: "rgb(103, 232, 249)", // cyan-300
    outline: "rgb(103, 232, 249)", // cyan-300
    outlineFilledBorder: "rgb(8, 145, 178)", // cyan-600
    icon: "rgb(15, 23, 42)", // slate-900
  },
  workOrders: {
    bg: "rgb(196, 181, 253)", // violet-300
    outline: "rgb(196, 181, 253)", // violet-300
    outlineFilledBorder: "rgb(124, 58, 237)", // violet-600
    icon: "rgb(15, 23, 42)", // slate-900
  },
  badgeBg: "rgb(15, 23, 42)",
  badgeText: "#ffffff",
} as const;

function RefBadge({
  count,
  appearance,
  variant,
  icon: Icon,
  label,
  onPress,
  disabled,
}: {
  count: number;
  appearance: RefButtonAppearance;
  variant: "documents" | "workOrders";
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const palette = REF_COLORS[variant];
  const isOutline = appearance === "outline" || appearance === "outlineFilled";
  const isFilled = appearance === "filled" || appearance === "outlineFilled";
  const isEmpty = appearance === "empty";

  return (
    <HapticPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: 32,
          height: 32,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          ...(isEmpty
            ? {
                backgroundColor: palette.bg,
                borderWidth: 0,
                // Web empty refs keep filled chrome at 10% opacity.
                opacity: 0.1,
              }
            : {
                backgroundColor: isFilled ? palette.bg : "transparent",
                borderWidth: isOutline ? 2 : 0,
                borderColor:
                  appearance === "outlineFilled" ? palette.outlineFilledBorder : palette.outline,
                opacity: 1,
              }),
        },
        pressedOpacity(pressed, PRESSED_OPACITY_CONTROL),
      ]}
    >
      <Icon size={16} color={palette.icon} strokeWidth={1.75} />
      {count > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 3,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: REF_COLORS.badgeBg,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "700", color: REF_COLORS.badgeText }}>{count}</Text>
        </View>
      ) : null}
    </HapticPressable>
  );
}

export function BaumstrukturScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors, isDark, radii } = useAppTheme();
  const rowRipple = surfaceRippleColor(isDark);
  const { appParameterBooleans, appParameterAssetTypes } = useAuth();
  const langDe = i18n.language?.toLowerCase().startsWith("de") ?? false;
  const typeDisplayConfig = appParameterAssetTypes ?? DEFAULT_ASSET_TYPE_DISPLAY_CONFIG;
  const typeColorsEnabled = appParameterBooleans[APP_PARAM_KEY_COLORED_ASSET_TREE] === true;

  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [selectedAsset, setSelectedAsset] = useState<AssetTreeAsset | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [refsAsset, setRefsAsset] = useState<AssetTreeAsset | null>(null);
  const [refsVisible, setRefsVisible] = useState(false);
  const [docsSearchTerm, setDocsSearchTerm] = useState("");
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);

  const { data: assetsRaw = [], isLoading, isError, refetch } = useAssetsQuery();

  const treeAssets = useMemo(() => assetsRaw.map(toTreeAsset), [assetsRaw]);
  const fullTree = useMemo(() => buildAssetTree(treeAssets), [treeAssets]);
  const descendantRefFlags = useMemo(() => collectDescendantRefFlags(fullTree), [fullTree]);
  const filteredTree = useMemo(() => filterAssetTree(fullTree, searchTerm), [fullTree, searchTerm]);
  const flatRows = useMemo(
    () => flattenVisibleTree(filteredTree, expandedIds),
    [filteredTree, expandedIds],
  );

  const docsQuery = useAssetDocumentsQuery(refsAsset?.id, refsVisible);

  const filteredDocs = useMemo(() => {
    const rows = docsQuery.data ?? [];
    const q = docsSearchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((doc) => {
      const name = (doc.displayName || doc.fileName).toLowerCase();
      return name.includes(q) || doc.fileName.toLowerCase().includes(q);
    });
  }, [docsQuery.data, docsSearchTerm]);

  useEffect(() => {
    const q = searchTerm.trim();
    if (!q) return;
    setExpandedIds(collectExpandableIds(filteredTree));
  }, [searchTerm, filteredTree]);

  useEffect(() => {
    if (selectedAsset && !treeAssets.some((a) => a.id === selectedAsset.id)) {
      setSelectedAsset(null);
      setDetailVisible(false);
    }
  }, [selectedAsset, treeAssets]);

  const expandAll = () => setExpandedIds(collectExpandableIds(filteredTree));
  const collapseAll = () => setExpandedIds(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDetail = (asset: AssetTreeAsset) => {
    setSelectedAsset(asset);
    setDetailVisible(true);
  };

  const openDocumentRefs = (asset: AssetTreeAsset) => {
    const sameAsset = refsAsset?.id === asset.id;
    setRefsAsset(asset);
    setRefsVisible(true);
    if (!sameAsset) setDocsSearchTerm("");
  };

  const openWorkOrderRefs = (asset: AssetTreeAsset) => {
    setDetailVisible(false);
    setRefsVisible(false);
    router.push({
      pathname: "/work-orders",
      params: {
        filterAssetId: asset.id,
        filterAssetKey: asset.key,
      },
    } as never);
  };

  const openDocument = async (assetId: string, doc: AssetDocumentRow) => {
    try {
      const uri = await resolveAssetDocumentUri(assetId, doc.id, doc.mimeType);
      if (Platform.OS === "web") {
        window.open(uri, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(uri), 60000);
        return;
      }
      if (isImageMime(doc.mimeType)) {
        setImagePreviewUri(uri);
        return;
      }
      await openNativeLocalDocument(uri, {
        mimeType: doc.mimeType,
        displayName: doc.displayName || doc.fileName,
      });
    } catch {
      Alert.alert("", t("workOrders.documentsOpenError"));
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
        err: { color: colors.primary, marginBottom: 12 },
        retry: { padding: 12 },
        retryText: { color: colors.primary, fontWeight: "600" },
        toolbar: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 16,
          marginVertical: 12,
        },
        searchWrap: {
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          height: 40,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        search: { flex: 1, fontSize: 15, color: colors.onSurface },
        expandBtn: {
          width: 40,
          height: 40,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignItems: "center",
          justifyContent: "center",
        },
        row: {
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingRight: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          gap: 8,
        },
        rowSelected: {
          backgroundColor: isDark ? "rgba(255,140,66,0.12)" : "rgba(173,44,0,0.08)",
        },
        expandSlot: { width: 28, alignItems: "center", justifyContent: "center" },
        rowMain: { flex: 1, minWidth: 0 },
        key: { fontSize: 13, fontWeight: "700", color: colors.primary },
        name: { fontSize: 15, fontWeight: "600", color: colors.onSurface, marginTop: 2 },
        site: { fontSize: 12, marginTop: 2 },
        badges: { flexDirection: "row", gap: 6, alignItems: "center" },
        empty: { textAlign: "center", color: colors.onSurfaceVariant, marginTop: 32 },
        emptyList: { flexGrow: 1 },
        sheet: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: radii.md,
          borderTopRightRadius: radii.md,
          maxHeight: "80%",
        },
        sheetTitle: {
          padding: 16,
          fontSize: 16,
          fontWeight: "700",
          color: colors.onSurface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        sheetContent: { padding: 16, gap: 14 },
        detailRow: { gap: 4 },
        detailLabel: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceVariant, textTransform: "uppercase" },
        detailValue: { fontSize: 15, color: colors.onSurface, fontWeight: "600" },
        detailTypeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
        listItem: {
          paddingVertical: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        listItemTitle: { fontSize: 14, fontWeight: "600", color: colors.onSurface },
        listItemMeta: { fontSize: 12, color: colors.onSurfaceVariant, marginTop: 2 },
        sheetCenter: { padding: 24, alignItems: "center" },
        docsSearchWrap: {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginHorizontal: 16,
          marginTop: 12,
          marginBottom: 4,
          paddingHorizontal: 12,
          height: 36,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        imagePreviewBackdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.85)",
          justifyContent: "center",
          alignItems: "center",
        },
        imagePreview: { width: "92%", height: "70%", resizeMode: "contain" },
      }),
    [colors, isDark, radii.md],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <ShellHeaderActions
          extra={
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HapticPressable
                onPress={expandAll}
                accessibilityLabel={t("baumstruktur.expandAll")}
                {...androidRippleProps(rowRipple, true)}
                style={({ pressed }) => [styles.expandBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              >
                <ChevronsUpDown size={20} color={colors.onSurface} />
              </HapticPressable>
              <HapticPressable
                onPress={collapseAll}
                accessibilityLabel={t("baumstruktur.collapseAll")}
                {...androidRippleProps(rowRipple, true)}
                style={({ pressed }) => [styles.expandBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              >
                <ChevronsDownUp size={20} color={colors.onSurface} />
              </HapticPressable>
            </View>
          }
        />
      ),
    });
  }, [collapseAll, colors.onSurface, expandAll, navigation, rowRipple, styles.expandBtn, t]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.onSurfaceVariant }}>{t("baumstruktur.loading")}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{t("baumstruktur.loadError")}</Text>
        <HapticPressable onPress={() => void refetch()} style={styles.retry}>
          <Text style={styles.retryText}>{t("dashboard.retry")}</Text>
        </HapticPressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Search size={18} color={colors.onSurfaceVariant} />
          <TextInput
            style={styles.search}
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder={t("baumstruktur.searchPlaceholder")}
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <FlatList
        data={flatRows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={flatRows.length === 0 ? styles.emptyList : undefined}
        ListEmptyComponent={<Text style={styles.empty}>{t("baumstruktur.empty")}</Text>}
        renderItem={({ item }) => {
          const { asset, depth, hasChildren, expanded, hasDescendantDocuments, hasDescendantWorkOrders } =
            item;
          const TypeIcon = assetTypeIcon(asset.type);
          const typeColor = assetTypeColorHex(asset.type, typeDisplayConfig);
          const rowBg = typeColorsEnabled ? assetTypeRowBackground(asset.type, typeDisplayConfig) : colors.surface;
          const isSelected = selectedAsset?.id === asset.id;
          const docsAppearance = refButtonAppearance(asset.documentCount, hasDescendantDocuments);
          const woAppearance = refButtonAppearance(asset.workOrderCount, hasDescendantWorkOrders);

          return (
            <View
              style={[
                styles.row,
                {
                  paddingLeft: ROW_BASE_PADDING + depth * DEPTH_INDENT,
                  backgroundColor: isSelected ? undefined : rowBg,
                },
                isSelected && styles.rowSelected,
              ]}
            >
              <View style={styles.expandSlot}>
                {hasChildren ? (
                  <HapticPressable
                    onPress={() => toggleExpand(asset.id)}
                    hitSlop={8}
                    style={({ pressed }) => pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)}
                  >
                    {expanded ? (
                      <ChevronDown size={18} color={colors.onSurfaceVariant} />
                    ) : (
                      <ChevronRight size={18} color={colors.onSurfaceVariant} />
                    )}
                  </HapticPressable>
                ) : null}
              </View>

              <HapticPressable
                onPress={() => openDetail(asset)}
                {...androidRippleProps(rowRipple)}
                style={({ pressed }) => [
                  { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
                  pressedOpacity(pressed, PRESSED_OPACITY_ROW),
                ]}
              >
                <TypeIcon size={18} color={typeColor} strokeWidth={1.75} />

                <View style={styles.rowMain}>
                  <Text style={styles.key} numberOfLines={1}>
                    {asset.key}
                  </Text>
                  <Text style={styles.name} numberOfLines={2}>
                    {asset.name}
                  </Text>
                  <SiteText
                    siteColorHex={asset.siteColorHex}
                    style={styles.site}
                    numberOfLines={1}
                  >
                    {`${asset.siteKey} — ${asset.siteName}`}
                  </SiteText>
                </View>
              </HapticPressable>

              <View style={styles.badges}>
                <RefBadge
                  count={asset.documentCount}
                  appearance={docsAppearance}
                  variant="documents"
                  icon={File}
                  label={t("baumstruktur.referencesDocuments")}
                  onPress={() => openDocumentRefs(asset)}
                />
                <RefBadge
                  count={asset.workOrderCount}
                  appearance={woAppearance}
                  variant="workOrders"
                  icon={ClipboardList}
                  label={t("baumstruktur.referencesWorkOrders")}
                  onPress={() => openWorkOrderRefs(asset)}
                  disabled={asset.workOrderCount === 0}
                />
              </View>
            </View>
          );
        }}
      />

      <BottomSheetModal visible={detailVisible} onClose={() => setDetailVisible(false)} sheetStyle={styles.sheet}>
        <Text style={styles.sheetTitle}>{t("baumstruktur.detailTitle")}</Text>
        {selectedAsset ? (
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("baumstruktur.detailKey")}</Text>
              <Text style={styles.detailValue}>{selectedAsset.key}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("baumstruktur.detailName")}</Text>
              <Text style={styles.detailValue}>{selectedAsset.name}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("baumstruktur.detailType")}</Text>
              <View style={styles.detailTypeRow}>
                {(() => {
                  const Ico = assetTypeIcon(selectedAsset.type);
                  return (
                    <Ico
                      size={18}
                      color={assetTypeColorHex(selectedAsset.type, typeDisplayConfig)}
                      strokeWidth={1.75}
                    />
                  );
                })()}
                <Text style={styles.detailValue}>
                  {assetTypeDisplayLabel(selectedAsset.type, typeDisplayConfig, langDe, t)}
                </Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("baumstruktur.detailSite")}</Text>
              <SiteText siteColorHex={selectedAsset.siteColorHex} style={styles.detailValue}>
                {`${selectedAsset.siteKey} — ${selectedAsset.siteName}`}
              </SiteText>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>{t("baumstruktur.references")}</Text>
              <View style={[styles.badges, { marginTop: 4 }]}>
                <RefBadge
                  count={selectedAsset.documentCount}
                  appearance={refButtonAppearance(
                    selectedAsset.documentCount,
                    descendantRefFlags.get(selectedAsset.id)?.hasDescendantDocuments === true,
                  )}
                  variant="documents"
                  icon={File}
                  label={t("baumstruktur.referencesDocuments")}
                  onPress={() => {
                    setDetailVisible(false);
                    openDocumentRefs(selectedAsset);
                  }}
                />
                <RefBadge
                  count={selectedAsset.workOrderCount}
                  appearance={refButtonAppearance(
                    selectedAsset.workOrderCount,
                    descendantRefFlags.get(selectedAsset.id)?.hasDescendantWorkOrders === true,
                  )}
                  variant="workOrders"
                  icon={ClipboardList}
                  label={t("baumstruktur.referencesWorkOrders")}
                  onPress={() => openWorkOrderRefs(selectedAsset)}
                  disabled={selectedAsset.workOrderCount === 0}
                />
              </View>
            </View>
          </ScrollView>
        ) : (
          <Text style={[styles.empty, { padding: 16 }]}>{t("baumstruktur.detailEmpty")}</Text>
        )}
      </BottomSheetModal>

      <BottomSheetModal
        visible={refsVisible}
        onClose={() => setRefsVisible(false)}
        sheetStyle={styles.sheet}
      >
        <Text style={styles.sheetTitle}>
          {t("baumstruktur.referencesDrawerTitle", { key: refsAsset?.key ?? "" })}
        </Text>

        <View style={styles.docsSearchWrap}>
          <Search size={16} color={colors.onSurfaceVariant} />
          <TextInput
            style={styles.search}
            value={docsSearchTerm}
            onChangeText={setDocsSearchTerm}
            placeholder={t("shell.search")}
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        {docsQuery.isLoading ? (
          <View style={styles.sheetCenter}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : docsQuery.isError ? (
          <View style={styles.sheetCenter}>
            <Text style={styles.err}>{t("baumstruktur.documentsLoadError")}</Text>
          </View>
        ) : (
          <FlatList
            data={filteredDocs}
            keyExtractor={(doc) => doc.id}
            style={{ maxHeight: 360 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
            ListEmptyComponent={<Text style={styles.empty}>{t("baumstruktur.documentsEmpty")}</Text>}
            renderItem={({ item: doc }) => (
              <HapticPressable
                onPress={() => refsAsset && void openDocument(refsAsset.id, doc)}
                style={({ pressed }) => [styles.listItem, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
              >
                <Text style={styles.listItemTitle} numberOfLines={2}>
                  {doc.displayName?.trim() || doc.fileName}
                </Text>
                <Text style={styles.listItemMeta}>
                  {doc.fileName} · {formatFileSize(doc.fileSize)}
                </Text>
              </HapticPressable>
            )}
          />
        )}
      </BottomSheetModal>

      <Modal
        visible={Boolean(imagePreviewUri)}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewUri(null)}
      >
        <Pressable style={styles.imagePreviewBackdrop} onPress={() => setImagePreviewUri(null)}>
          {imagePreviewUri ? (
            <Image source={{ uri: imagePreviewUri }} style={styles.imagePreview} accessibilityLabel="" />
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}
