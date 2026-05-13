import { DrawerToggleButton } from "@react-navigation/drawer";
import { Redirect } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { StatusBar } from "expo-status-bar";
import { Fragment } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AtheneAssistantProvider } from "../../src/assistant/AtheneAssistantContext";
import { AppDrawerContent } from "../../src/components/AppDrawerContent";
import { useAuth } from "../../src/auth/AuthContext";
import { useAppTheme } from "../../src/theme/AppThemeContext";

export default function ProtectedLayout() {
  const { user, loading } = useAuth();
  const { colors, isDark } = useAppTheme();

  if (loading) {
    return (
      <Fragment>
        <StatusBar style={isDark ? "light" : "dark"} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Fragment>
    );
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  return (
    <Fragment>
      <StatusBar style={isDark ? "light" : "dark"} />
      <AtheneAssistantProvider>
        <Drawer
          initialRouteName="home"
          drawerContent={(props) => <AppDrawerContent {...props} />}
          screenOptions={({ route }) => ({
            drawerActiveTintColor: colors.primary,
            drawerInactiveTintColor: colors.onSurfaceVariant,
            headerShown: route.name === "home",
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.onSurface,
            headerTitleStyle: { fontWeight: "700", fontSize: 17, color: colors.onSurface },
            drawerStyle: { backgroundColor: colors.surface },
            headerLeft: (props) =>
              route.name === "home" ? (
                <DrawerToggleButton {...props} tintColor={colors.onSurface} />
              ) : undefined,
          })}
        />
      </AtheneAssistantProvider>
    </Fragment>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});
