import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useAuth } from "../src/auth/AuthContext";
import { LoginScreen } from "../src/screens/login/LoginScreen";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/home");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ad2c00" />
      </View>
    );
  }

  if (user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#ad2c00" />
      </View>
    );
  }

  return <LoginScreen />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f7f9fc" },
});
