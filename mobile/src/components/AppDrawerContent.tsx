import { MaterialIcons } from "@expo/vector-icons";
import type { DrawerContentComponentProps } from "@react-navigation/drawer";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import { usePathname, useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { HapticPressable } from "./HapticPressable";
import { useTranslation } from "react-i18next";

import { useAtheneAssistant } from "../assistant/AtheneAssistantContext";
import { useAuth } from "../auth/AuthContext";
import {
  androidRippleProps,
  pressedOpacity,
  PRESSED_OPACITY_CONTROL,
  PRESSED_OPACITY_ROW,
  surfaceRippleColor,
} from "../styles/pressableFeedback";
import { useAppTheme } from "../theme/AppThemeContext";

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const { navigation } = props;
  const pathname = usePathname();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors, isDark, toggleScheme } = useAppTheme();
  const navRipple = surfaceRippleColor(isDark);
  const { signOut } = useAuth();
  const athene = useAtheneAssistant();
  const activeLang = i18n.language.startsWith("de") ? "de" : "en";

  const activeHome = pathname === "/home" || pathname.endsWith("/home");
  const activeCc = pathname.startsWith("/cost-centers");
  const activeAssets = pathname.startsWith("/assets");
  const activeWorkOrders = pathname.startsWith("/work-orders");

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

  function closeAndGo(href: "/home" | "/cost-centers" | "/assets" | "/work-orders") {
    router.push(href as never);
    navigation.closeDrawer();
  }

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ flexGrow: 1, backgroundColor: colors.surface, paddingTop: 0 }}
    >
      <View style={styles.brand}>
        <Text style={styles.brandText}>ATHENE</Text>
      </View>

      <HapticPressable
        onPress={() => closeAndGo("/home")}
        {...androidRippleProps(navRipple)}
        style={({ pressed }) => [styles.navItem, activeHome && styles.navItemActive, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
      >
        <MaterialIcons name="home" size={24} color={activeHome ? colors.primary : colors.onSurfaceVariant} />
        <Text style={activeHome ? styles.navLabel : styles.navLabelMuted}>{t("drawer.navStart")}</Text>
      </HapticPressable>

      <HapticPressable
        onPress={() => closeAndGo("/cost-centers")}
        {...androidRippleProps(navRipple)}
        style={({ pressed }) => [styles.navItem, activeCc && styles.navItemActive, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
      >
        <MaterialIcons
          name="account-balance"
          size={24}
          color={activeCc ? colors.primary : colors.onSurfaceVariant}
        />
        <Text style={activeCc ? styles.navLabel : styles.navLabelMuted}>
          {t("drawer.navCostCenters")}
        </Text>
      </HapticPressable>

      <HapticPressable
        onPress={() => closeAndGo("/assets")}
        {...androidRippleProps(navRipple)}
        style={({ pressed }) => [styles.navItem, activeAssets && styles.navItemActive, pressedOpacity(pressed, PRESSED_OPACITY_ROW)]}
      >
        <MaterialIcons
          name="precision-manufacturing"
          size={24}
          color={activeAssets ? colors.primary : colors.onSurfaceVariant}
        />
        <Text style={activeAssets ? styles.navLabel : styles.navLabelMuted}>{t("drawer.navAssets")}</Text>
      </HapticPressable>

      <HapticPressable
        onPress={() => closeAndGo("/work-orders")}
        {...androidRippleProps(navRipple)}
        style={({ pressed }) => [
          styles.navItem,
          activeWorkOrders && styles.navItemActive,
          pressedOpacity(pressed, PRESSED_OPACITY_ROW),
        ]}
      >
        <MaterialIcons
          name="assignment"
          size={24}
          color={activeWorkOrders ? colors.primary : colors.onSurfaceVariant}
        />
        <Text style={activeWorkOrders ? styles.navLabel : styles.navLabelMuted}>
          {t("drawer.navWorkOrders")}
        </Text>
      </HapticPressable>

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
          <MaterialIcons name="psychology" size={24} color={colors.onSurfaceVariant} />
        )}
        <Text style={styles.navLabelMuted}>{t("drawer.navAthene")}</Text>
      </HapticPressable>

      <View style={styles.spacer} />

      <View style={styles.footer}>
        <Text style={{ fontSize: 12, color: colors.onSurfaceVariant, marginBottom: 4 }}>{t("drawer.hint")}</Text>
        <View style={styles.footerRow}>
          <HapticPressable
            onPress={toggleScheme}
            {...androidRippleProps(navRipple, true)}
            style={({ pressed }) => [styles.iconBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            accessibilityLabel={isDark ? t("shell.themeToggleToLight") : t("shell.themeToggleToDark")}
          >
            <MaterialIcons name={isDark ? "light-mode" : "dark-mode"} size={24} color={colors.onSurface} />
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
