import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import {
  ClipboardList,
  Factory,
  FolderTree,
  Home,
  Landmark,
  Moon,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react-native";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { HapticPressable } from "./HapticPressable";
import { useTranslation } from "react-i18next";

import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../lib/api";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  PRESSED_OPACITY_ROW,
  surfaceRippleColor,
} from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

type DrawerLink = {
  to: string;
  labelKey?: string;
  label?: string;
};

const ICON_BY_TO: Record<string, LucideIcon> = {
  "/home": Home,
  "/cost-centers": Landmark,
  "/assets": Factory,
  "/baumstruktur": FolderTree,
  "/work-orders": ClipboardList,
};

const DEFAULT_LINKS: DrawerLink[] = [
  { to: "/home", labelKey: "drawer.navStart" },
  { to: "/cost-centers", labelKey: "drawer.navCostCenters" },
  { to: "/assets", labelKey: "drawer.navAssets" },
  { to: "/baumstruktur", labelKey: "drawer.navBaumstruktur" },
  { to: "/work-orders", labelKey: "drawer.navWorkOrders" },
];

const MOBILE_ROUTE_PERM: Record<string, string> = {
  "/home": "dashboard.view",
  "/cost-centers": "cost-centers.view",
  "/assets": "assets.view",
  "/baumstruktur": "baumstruktur.view",
  "/work-orders": "work-orders.view",
};

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const { navigation } = props;
  const pathname = usePathname();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors, isDark, toggleScheme } = useAppTheme();
  const navRipple = surfaceRippleColor(isDark);
  const { signOut, permissions } = useAuth();
  const athene = useAtheneAssistant();
  const activeLang = i18n.language.startsWith("de") ? "de" : "en";
  const [links, setLinks] = useState<DrawerLink[]>(DEFAULT_LINKS);

  const loadNav = useCallback(async () => {
    try {
      const res = await apiFetch("/api/nav-layout?platform=mobile");
      if (!res.ok) return;
      const data = (await res.json()) as {
        navLayout?: {
          items?: Array<{
            to?: string;
            hidden?: boolean;
            name?: string;
            source?: string;
          }>;
        } | null;
      };
      const items = data.navLayout?.items;
      if (!Array.isArray(items) || items.length === 0) {
        setLinks(DEFAULT_LINKS);
        return;
      }
      const next: DrawerLink[] = [];
      const seen = new Set<string>();
      for (const it of items) {
        if (!it || it.hidden || typeof it.to !== "string") continue;
        if (seen.has(it.to)) continue;
        seen.add(it.to);
        const fallback = DEFAULT_LINKS.find((d) => d.to === it.to);
        next.push({
          to: it.to,
          label: typeof it.name === "string" ? it.name : undefined,
          labelKey: fallback?.labelKey,
        });
      }
      for (const d of DEFAULT_LINKS) {
        if (!seen.has(d.to)) next.push(d);
      }
      setLinks(next.length > 0 ? next : DEFAULT_LINKS);
    } catch {
      setLinks(DEFAULT_LINKS);
    }
  }, []);

  useEffect(() => {
    void loadNav();
  }, [loadNav]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        brand: {
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 20,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        brandText: { fontSize: 20, fontWeight: "800", letterSpacing: 3, color: colors.primary },
        navItem: {
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          paddingVertical: 14,
          paddingHorizontal: 16,
        },
        navItemActive: {
          backgroundColor: isDark ? "rgba(255,140,66,0.12)" : "rgba(173,44,0,0.08)",
          borderLeftWidth: 3,
          borderLeftColor: colors.primary,
        },
        navLabel: { fontSize: 16, fontWeight: "600", color: colors.onSurface },
        navLabelMuted: { fontSize: 16, fontWeight: "600", color: colors.onSurfaceVariant },
        spacer: { flexGrow: 1, minHeight: 24 },
        footer: {
          padding: 16,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          gap: 12,
        },
        footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
        iconBtn: { padding: 8 },
        pill: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
          backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(25,28,30,0.06)",
        },
        pillText: { fontSize: 12, fontWeight: "700", color: colors.onSurface },
        signOut: { fontSize: 14, fontWeight: "700", color: colors.primary },
      }),
    [colors, isDark],
  );

  function closeAndGo(href: string) {
    router.push(href as never);
    navigation.closeDrawer();
  }

  function isActive(to: string): boolean {
    if (to === "/home") return pathname === "/home" || pathname.endsWith("/home");
    return pathname.startsWith(to);
  }

  const visibleLinks = useMemo(
    () =>
      links.filter((link) => {
        const key = MOBILE_ROUTE_PERM[link.to];
        if (!key) return true;
        return permissions.includes(key);
      }),
    [links, permissions],
  );

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ flexGrow: 1, backgroundColor: colors.surface, paddingTop: 0 }}
    >
      <View style={styles.brand}>
        <Text style={styles.brandText}>ATHENE</Text>
      </View>

      {visibleLinks.map((link) => {
        const active = isActive(link.to);
        const Icon = ICON_BY_TO[link.to] ?? Home;
        const label = link.label?.trim() || (link.labelKey ? t(link.labelKey) : link.to);
        return (
          <HapticPressable
            key={link.to}
            onPress={() => closeAndGo(link.to)}
            {...androidRippleProps(navRipple)}
            style={({ pressed }) => [
              styles.navItem,
              active && styles.navItemActive,
              pressedOpacity(pressed, PRESSED_OPACITY_ROW),
            ]}
          >
            <Icon size={24} color={active ? colors.primary : colors.onSurfaceVariant} />
            <Text style={active ? styles.navLabel : styles.navLabelMuted}>{label}</Text>
          </HapticPressable>
        );
      })}

      <HapticPressable
        onPress={() => {
          athene.open();
          navigation.closeDrawer();
        }}
        {...androidRippleProps(navRipple)}
        style={({ pressed }) => [styles.navItem, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
      >
        {athene.busy ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Sparkles size={24} color={colors.onSurfaceVariant} />
        )}
        <Text style={styles.navLabelMuted}>{t("drawer.navAthene")}</Text>
      </HapticPressable>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 4 }}>
          {t("drawer.hint")}
        </Text>
        <View style={styles.footerRow}>
          <HapticPressable
            onPress={toggleScheme}
            {...androidRippleProps(navRipple, true)}
            style={({ pressed }) => [styles.iconBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            accessibilityLabel={isDark ? t("shell.themeToggleToLight") : t("shell.themeToggleToDark")}
          >
            {isDark ? <Sun size={24} color={colors.onSurface} /> : <Moon size={24} color={colors.onSurface} />}
          </HapticPressable>
          <HapticPressable
            onPress={() => void i18n.changeLanguage(activeLang === "de" ? "en" : "de")}
            {...androidRippleProps(navRipple, true)}
            style={({ pressed }) => [styles.pill, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
          >
            <Text style={styles.pillText}>{activeLang === "de" ? "DE" : "EN"}</Text>
          </HapticPressable>
        </View>
        <HapticPressable
          onPress={() => {
            void (async () => {
              await signOut();
              navigation.closeDrawer();
              router.replace("/");
            })();
          }}
          {...androidRippleProps(navRipple)}
          style={({ pressed }) => [pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
        >
          <Text style={styles.signOut}>{t("shell.signOut")}</Text>
        </HapticPressable>
      </View>
    </DrawerContentScrollView>
  );
}
