import { MaterialIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../auth/AuthContext";
import { pressedOpacity, PRESSED_OPACITY_CONTROL, PRESSED_OPACITY_STRONG } from "../../styles/pressableFeedback";
import { getLoginTokens, loginEffects, type LoginScheme } from "./loginDesign";

const logoSrc =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBXlSbGeVd1b9vDHIS0zNg4ubFbXhfrNfe4Sv5JV6MSBmxKHnDuAYEHdpbb1SszOZf-WOST12uDN6bqukD5ug4fnhMWR4DyDQjZdzbDbv4Lax_cuh_QhDRD2xflduAhgOm65cEe-EvtOnVp5j1xZbVM0sPb63506HqYsaNZCoes7Qg6Nbwdkivh60bcLUrmaLYx-uGDm4EcZAUUEsBH4trNrjulBpFWchVALjBrT2rzhNyhnq_YiPLHC-z9CTbM4-BtqgDzLsVrLJvT";

export function LoginScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { signIn } = useAuth();
  const [scheme, setScheme] = useState<LoginScheme>("light");
  const tokens = getLoginTokens(scheme);
  const isLight = scheme === "light";

  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLang = i18n.language.startsWith("de") ? "de" : "en";

  const onSubmit = useCallback(async () => {
    setError(null);
    const name = loginName.trim();
    if (!name || !password) {
      setError(t("login.errorRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const { ok, status } = await signIn(name, password, remember);
      if (!ok) {
        setError(status === 401 ? t("login.errorInvalid") : t("login.errorGeneric"));
        return;
      }
      router.replace("/home");
    } catch {
      setError(t("login.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }, [loginName, password, remember, router, signIn, t]);

  const bg = tokens.colors.background ?? tokens.colors.surface;
  const cardBg = isLight ? tokens.colors.surfaceContainerLowest : loginEffects.darkGlassBackground;
  const onSurface = tokens.colors.onSurface;
  const outline = tokens.colors.outline;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {!isLight ? <DarkAmbient /> : <LightAmbient />}

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Text style={[styles.refLabel, { color: outline, fontFamily: tokens.fonts.label }]}>
            Ref_001 // Core_System
          </Text>
          <View style={styles.topActions}>
            <Pressable
              onPress={() => setScheme(isLight ? "dark" : "light")}
              style={({ pressed }) => [styles.iconBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              accessibilityLabel={isLight ? t("login.themeDark") : t("login.themeLight")}
            >
              <MaterialIcons name={isLight ? "dark-mode" : "light-mode"} size={22} color={onSurface} />
            </Pressable>
            <Pressable
              onPress={() => void i18n.changeLanguage(activeLang === "de" ? "en" : "de")}
              style={({ pressed }) => [styles.langBtn, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
            >
              <Text style={[styles.langText, { color: onSurface, fontFamily: tokens.fonts.label }]}>
                {activeLang === "de" ? "DE" : "EN"}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.main}>
          <View style={styles.brandBlock}>
            <View style={styles.logoWrap}>
              {isLight ? (
                <>
                  <View style={[styles.cornerTL, { borderColor: tokens.colors.tertiary }]} />
                  <View style={[styles.cornerBR, { borderColor: tokens.colors.tertiary }]} />
                </>
              ) : null}
              <Image source={{ uri: logoSrc }} style={[styles.logo, isLight ? styles.logoLight : styles.logoDark]} />
            </View>
            <Text style={[styles.brandTitle, { color: onSurface, fontFamily: tokens.fonts.displayBold }]}>
              {t("login.brand")}
            </Text>
            <Text style={[styles.brandSub, { color: outline, fontFamily: tokens.fonts.label }]}>
              {t("login.tagline")}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: cardBg,
                borderRadius: tokens.radii.default,
                shadowColor: "#000",
                shadowOffset: tokens.cardShadow.offset,
                shadowOpacity: tokens.cardShadow.opacity,
                shadowRadius: tokens.cardShadow.radius,
                elevation: isLight ? 6 : 10,
                borderWidth: isLight ? 0 : StyleSheet.hairlineWidth,
                borderColor: isLight ? "transparent" : `${tokens.colors.outlineVariant}26`,
              },
            ]}
          >
            {!isLight ? <View style={[styles.cardAccent, { backgroundColor: tokens.colors.atheneOrange }]} /> : (
              <View style={[styles.cardAccent, { backgroundColor: tokens.colors.primary, opacity: 0.2 }]} />
            )}
            <View style={styles.cardInner}>
              {!isLight ? (
                <View style={styles.protocolRow}>
                  <MaterialIcons name="shield" size={16} color={tokens.colors.atheneOrange} />
                  <Text style={[styles.protocol, { color: tokens.colors.onSurfaceVariant, fontFamily: tokens.fonts.label }]}>
                    Protocol 01
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.cardTitle, { color: onSurface, fontFamily: tokens.fonts.displayBold }]}>
                {t("login.systemAccess")}
              </Text>
              {!isLight ? null : <View style={[styles.titleRule, { backgroundColor: tokens.colors.primary }]} />}

              <View style={styles.field}>
                <Text style={[styles.label, { color: outline, fontFamily: tokens.fonts.label }]}>
                  {t("login.operatorId")}
                </Text>
                <View style={[styles.inputWrap, { backgroundColor: isLight ? tokens.colors.surfaceContainerLow : `${tokens.colors.surfaceContainerHighest}80` }]}>
                  <View
                    style={[
                      styles.focusBar,
                      { backgroundColor: isLight ? tokens.colors.tertiary : tokens.colors.atheneOrange },
                    ]}
                  />
                  <TextInput
                    value={loginName}
                    onChangeText={setLoginName}
                    placeholder="AX-7721-OP"
                    placeholderTextColor={`${outline}66`}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, { color: onSurface, fontFamily: tokens.fonts.body }]}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={[styles.label, { color: outline, fontFamily: tokens.fonts.label }]}>
                  {t("login.password")}
                </Text>
                <View style={[styles.inputWrap, { backgroundColor: isLight ? tokens.colors.surfaceContainerLow : `${tokens.colors.surfaceContainerHighest}80` }]}>
                  <View
                    style={[
                      styles.focusBar,
                      { backgroundColor: isLight ? tokens.colors.tertiary : tokens.colors.atheneOrange },
                    ]}
                  />
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••••••"
                    placeholderTextColor={`${outline}66`}
                    secureTextEntry
                    style={[styles.input, { color: onSurface, fontFamily: tokens.fonts.body }]}
                  />
                </View>
              </View>

              <Pressable
                onPress={() => setRemember(!remember)}
                style={({ pressed }) => [styles.rememberRow, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
              >
                <View
                  style={[
                    styles.checkbox,
                    { borderColor: outline },
                    remember && {
                      backgroundColor: isLight ? tokens.colors.tertiary : tokens.colors.atheneOrange,
                    },
                  ]}
                >
                  {remember ? <MaterialIcons name="check" size={16} color={isLight ? "#ffffff" : "#000000"} /> : null}
                </View>
                <Text style={{ color: outline, fontFamily: tokens.fonts.label, fontSize: 11, opacity: 0.85 }}>
                  {t("login.remember")}
                </Text>
              </Pressable>

              {error ? (
                <View style={[styles.errorBox, { borderColor: tokens.colors.error }]}>
                  <Text style={{ color: tokens.colors.error, fontFamily: tokens.fonts.body }}>{error}</Text>
                </View>
              ) : null}

              {isLight ? (
                <Pressable
                  disabled={submitting}
                  onPress={() => void onSubmit()}
                  style={({ pressed }) => [pressedOpacity(pressed, PRESSED_OPACITY_STRONG)]}
                >
                  <LinearGradient
                    colors={[tokens.colors.primary, tokens.colors.primaryContainer]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cta}
                  >
                    {submitting ? (
                      <ActivityIndicator color={tokens.colors.onPrimary} />
                    ) : (
                      <>
                        <Text style={[styles.ctaText, { color: tokens.colors.onPrimary, fontFamily: tokens.fonts.displayBold }]}>
                          {t("login.submit")}
                        </Text>
                        <MaterialIcons name="arrow-forward" size={20} color={tokens.colors.onPrimary} />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              ) : (
                <Pressable
                  disabled={submitting}
                  onPress={() => void onSubmit()}
                  style={({ pressed }) => [
                    styles.ctaDark,
                    { backgroundColor: tokens.colors.atheneOrange },
                    pressedOpacity(pressed, PRESSED_OPACITY_STRONG),
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#000" />
                  ) : (
                    <>
                      <Text style={[styles.ctaText, { color: "#000", fontFamily: tokens.fonts.displayBold }]}>
                        {t("login.submit")}
                      </Text>
                      <MaterialIcons name="arrow-forward-ios" size={18} color="#000" />
                    </>
                  )}
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.linksRow}>
            <Text style={[styles.link, { color: isLight ? tokens.colors.tertiaryFixedVariant : tokens.colors.onSurfaceVariant }]}>
              {t("login.requestAccess")}
            </Text>
            <Text style={[styles.link, { color: outline }]}>{t("login.recovery")}</Text>
          </View>
        </View>

        <View style={[styles.footer, { borderTopColor: isLight ? `${tokens.colors.outlineVariant}33` : `${tokens.colors.outlineVariant}1a` }]}>
          <View>
            <Text style={[styles.footerMeta, { color: `${outline}88`, fontFamily: tokens.fonts.label }]}>{t("login.footerEnv")}</Text>
            <Text style={[styles.footerMeta, { color: `${outline}88`, fontFamily: tokens.fonts.label }]}>{t("login.footerTls")}</Text>
          </View>
          <View style={styles.footerRight}>
            <MaterialIcons name="verified-user" size={18} color={isLight ? tokens.colors.tertiary : tokens.colors.onSurfaceVariant} />
            <Text style={[styles.footerMeta, { color: outline, fontFamily: tokens.fonts.label }]}>{t("login.secureCore")}</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LightAmbient() {
  return (
    <>
      <View pointerEvents="none" style={[styles.glow, styles.glowTR]} />
      <View pointerEvents="none" style={[styles.glow, styles.glowBL]} />
    </>
  );
}

function DarkAmbient() {
  return (
    <>
      <View pointerEvents="none" style={[styles.darkOrb, { top: -80, left: -80, backgroundColor: "#FF4500" }]} />
      <View pointerEvents="none" style={[styles.darkOrb, { top: "35%", right: -120, width: 320, height: 320, backgroundColor: "#FF4500" }]} />
      <View pointerEvents="none" style={[styles.darkOrb, { bottom: -60, left: "20%", backgroundColor: "#a8e8ff", opacity: 0.08 }]} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 24 },
  glow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 200,
    backgroundColor: "rgba(255, 69, 0, 0.08)",
    opacity: 0.9,
  },
  glowTR: { top: "-8%", right: "-15%" },
  glowBL: { bottom: "-8%", left: "-15%" },
  darkOrb: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 200,
    opacity: 0.12,
  },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 12 },
  refLabel: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", opacity: 0.35 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { padding: 8 },
  langBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  langText: { fontSize: 11, fontWeight: "600", letterSpacing: 2 },
  main: { flex: 1, justifyContent: "center", paddingVertical: 32 },
  brandBlock: { alignItems: "center", marginBottom: 36 },
  logoWrap: { position: "relative", marginBottom: 12 },
  cornerTL: {
    position: "absolute",
    top: -6,
    left: -6,
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    opacity: 0.35,
    zIndex: 1,
  },
  cornerBR: {
    position: "absolute",
    bottom: -6,
    right: -6,
    width: 14,
    height: 14,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    opacity: 0.35,
    zIndex: 1,
  },
  logo: { width: 80, height: 80 },
  logoLight: { resizeMode: "contain" },
  logoDark: { resizeMode: "contain", opacity: 0.95 },
  brandTitle: { fontSize: 20, letterSpacing: 6, textTransform: "uppercase" },
  brandSub: { fontSize: 10, letterSpacing: 3, textTransform: "uppercase", opacity: 0.55, marginTop: 4 },
  card: { maxWidth: 400, width: "100%", alignSelf: "center", overflow: "hidden" },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
  cardInner: { padding: 24, paddingLeft: 28 },
  protocolRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  protocol: { fontSize: 10, letterSpacing: 2, textTransform: "uppercase" },
  cardTitle: { fontSize: 22, marginBottom: 4 },
  titleRule: { width: 48, height: 2, marginBottom: 20, marginTop: 8 },
  field: { marginBottom: 18 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6, marginLeft: 4 },
  inputWrap: { flexDirection: "row", alignItems: "stretch", minHeight: 48 },
  focusBar: { width: 2 },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 },
  rememberRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  checkbox: { width: 22, height: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  errorBox: { borderWidth: 1, padding: 10, marginBottom: 12, borderRadius: 4 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  ctaDark: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    marginTop: 8,
    borderRadius: 2,
  },
  ctaText: { fontSize: 13, letterSpacing: 2.4, textTransform: "uppercase" },
  linksRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    paddingHorizontal: 8,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  link: { fontSize: 10, fontWeight: "700", letterSpacing: 2, textTransform: "uppercase" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerMeta: { fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase" },
  footerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
});
