import { MaterialIcons } from "@expo/vector-icons";
import { DrawerToggleButton } from "@react-navigation/drawer";
import { Stack, router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable } from "react-native";

import { useAppTheme } from "../../../src/theme/AppThemeContext";

export default function WorkOrdersStackLayout() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  function workOrderBackHeaderLeft(tintColor: string) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/work-orders");
        }}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={{ marginLeft: 8, justifyContent: "center", alignItems: "center", minWidth: 40, minHeight: 40 }}
      >
        <MaterialIcons name="arrow-back" size={24} color={tintColor} />
      </Pressable>
    );
  }

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
      <Stack.Screen name="index" options={{ title: t("workOrders.appName") }} />
      <Stack.Screen
        name="new"
        options={{
          title: t("workOrders.createTitle"),
          headerLeft: ({ tintColor }) => workOrderBackHeaderLeft(tintColor ?? colors.onSurface),
          headerRight: undefined,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: t("workOrders.editTitle"),
          headerLeft: ({ tintColor }) => workOrderBackHeaderLeft(tintColor ?? colors.onSurface),
          headerRight: undefined,
        }}
      />
    </Stack>
  );
}
