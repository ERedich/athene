import { useNavigation } from "expo-router";
import { useLayoutEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "../../src/theme/AppThemeContext";

export default function HomeScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useAppTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, padding: 20, gap: 12, backgroundColor: colors.background },
        subtitle: { fontSize: 16, fontWeight: "600", color: colors.onSurface, marginBottom: 8 },
        hint: { fontSize: 14, lineHeight: 22, color: colors.onSurfaceVariant },
      }),
    [colors.background, colors.onSurface, colors.onSurfaceVariant],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("home.title"),
    });
  }, [navigation, t]);

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>{t("home.subtitle")}</Text>
      <Text style={styles.hint}>{t("drawer.hint")}</Text>
    </View>
  );
}
