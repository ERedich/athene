import { DrawerToggleButton } from "@react-navigation/drawer";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { useAppTheme } from "../../../src/theme/AppThemeContext";

export default function BaumstrukturStackLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.onSurface,
        headerTitleStyle: { fontWeight: "700", color: colors.onSurface },
        contentStyle: { backgroundColor: colors.background },
        headerLeft: (props) => <DrawerToggleButton {...props} tintColor={colors.onSurface} />,
      }}
    >
      <Stack.Screen name="index" options={{ title: t("baumstruktur.appName") }} />
    </Stack>
  );
}
