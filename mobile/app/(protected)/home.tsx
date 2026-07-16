import { useNavigation, useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { AtheneGreetingCard } from "../../src/components/dashboard/AtheneGreetingCard";
import { KpiStatCard } from "../../src/components/dashboard/KpiStatCard";
import { OrdersByTypeCard } from "../../src/components/dashboard/OrdersByTypeCard";
import { useAtheneBriefingQuery, useDashboardMetricsQuery } from "../../src/hooks/queries";
import { useAppTheme } from "../../src/theme/AppThemeContext";

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
  const { colors, space } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);

  const metricsQuery = useDashboardMetricsQuery();
  const briefingQuery = useAtheneBriefingQuery(i18n.language);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: {
          padding: space.md,
          gap: space.md,
          paddingBottom: space.lg,
        },
        row: {
          flexDirection: "row",
          gap: space.md,
        },
      }),
    [colors.background, space.lg, space.md],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t("home.title"),
    });
  }, [navigation, t]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([metricsQuery.refetch(), briefingQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [briefingQuery, metricsQuery]);

  const openWorkOrders = useCallback(() => {
    router.push("/work-orders");
  }, [router]);

  const metrics = metricsQuery.data;
  const metricsLoading = metricsQuery.isLoading;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <AtheneGreetingCard
        data={briefingQuery.data}
        loading={briefingQuery.isLoading}
        error={briefingQuery.isError}
        onRetry={() => void briefingQuery.refetch()}
      />

      <View style={styles.row}>
        <KpiStatCard
          title={t("dashboard.kpiMyOrders")}
          value={metrics?.myOrders.total ?? null}
          loading={metricsLoading}
          footer={
            metrics && !metrics.myOrders.employeeLinked ? t("dashboard.noEmployee") : null
          }
          onPress={openWorkOrders}
        />
        <KpiStatCard
          title={t("dashboard.kpiOpenActive")}
          value={metrics?.openActive.total ?? null}
          loading={metricsLoading}
          onPress={openWorkOrders}
        />
      </View>

      <OrdersByTypeCard
        total={metrics?.ordersByType.total ?? null}
        byType={metrics?.ordersByType.byType ?? []}
        loading={metricsLoading}
        onPress={openWorkOrders}
      />
    </ScrollView>
  );
}
