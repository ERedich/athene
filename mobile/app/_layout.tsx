import "react-native-gesture-handler";

import {
  Manrope_400Regular,
  useFonts as useManropeFonts,
} from "@expo-google-fonts/manrope";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
  useFonts as useSpaceFonts,
} from "@expo-google-fonts/space-grotesk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

import { AuthProvider } from "../src/auth/AuthProvider";
import "../src/i18n";
import { AppThemeProvider } from "../src/theme/AppThemeContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000 },
  },
});

export default function RootLayout() {
  const [spaceLoaded] = useSpaceFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });
  const [manropeLoaded] = useManropeFonts({
    Manrope_400Regular,
  });
  const loaded = spaceLoaded && manropeLoaded;

  useEffect(() => {
    if (!loaded && __DEV__) {
      // Fonts loading
    }
  }, [loaded]);

  if (!loaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f7f9fc" }}>
        <ActivityIndicator size="large" color="#ad2c00" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AppThemeProvider>
        <AuthProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(protected)" />
          </Stack>
        </AuthProvider>
      </AppThemeProvider>
    </QueryClientProvider>
  );
}
