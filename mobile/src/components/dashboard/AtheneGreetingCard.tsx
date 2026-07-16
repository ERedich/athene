import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ImageBackground,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { useAuth } from "../../auth/AuthContext";
import type { AtheneBriefing } from "../../types/api";
import {
  PERIOD_GREETING_KEY,
  PERIOD_IMAGE_TONE,
  resolvePeriodOfDay,
  type PeriodOfDay,
} from "../../lib/dashboardPeriod";
import { HapticPressable } from "../HapticPressable";
import { PRESSED_OPACITY_CONTROL, pressedOpacity } from "../../styles/pressableFeedback";
import { useAppTheme } from "../../theme/AppThemeContext";

const PERIOD_IMAGE: Record<PeriodOfDay, ImageSourcePropType> = {
  morning: require("../../../assets/dashboard/greeting/morning.jpg"),
  afternoon: require("../../../assets/dashboard/greeting/afternoon.jpg"),
  evening: require("../../../assets/dashboard/greeting/night.jpg"),
};

type Props = {
  data: AtheneBriefing | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

export function AtheneGreetingCard({ data, loading, error, onRetry }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { radii, space } = useAppTheme();
  const period = useMemo(() => resolvePeriodOfDay(), []);
  const imageTone = PERIOD_IMAGE_TONE[period];
  const textOnImage = imageTone === "dark" ? "#f8fafc" : "#0f172a";
  const mutedOnImage = imageTone === "dark" ? "rgba(248,250,252,0.78)" : "rgba(15,23,42,0.72)";
  const skeletonBg = imageTone === "dark" ? "rgba(248,250,252,0.18)" : "rgba(15,23,42,0.12)";

  const greeting = t(PERIOD_GREETING_KEY[period], { name: user?.name ?? "" });

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          borderRadius: radii.md,
          overflow: "hidden",
          minHeight: 280,
        },
        image: {
          flex: 1,
          minHeight: 280,
        },
        imageStyle: {
          borderRadius: radii.md,
        },
        body: {
          flex: 1,
          padding: space.md,
          gap: space.md,
          justifyContent: "space-between",
        },
        title: {
          fontSize: 22,
          fontWeight: "700",
          color: textOnImage,
          letterSpacing: -0.3,
        },
        sections: { gap: space.sm },
        sectionTitle: {
          fontSize: 11,
          fontWeight: "700",
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: mutedOnImage,
          marginBottom: 2,
        },
        summary: {
          fontSize: 13,
          lineHeight: 18,
          color: textOnImage,
        },
        skeleton: { gap: 8 },
        skeletonLine: {
          height: 12,
          borderRadius: 4,
          backgroundColor: skeletonBg,
          width: "100%",
        },
        skeletonShort: { width: "62%" },
        errorBox: { gap: space.sm },
        errorText: {
          fontSize: 13,
          lineHeight: 18,
          color: textOnImage,
        },
        retry: {
          alignSelf: "flex-start",
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: radii.sm,
          backgroundColor: imageTone === "dark" ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.12)",
        },
        retryText: {
          fontSize: 13,
          fontWeight: "600",
          color: textOnImage,
        },
        stats: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: space.sm,
          marginTop: space.xs,
        },
        stat: {
          minWidth: "45%",
          flexGrow: 1,
          flexBasis: "40%",
        },
        statLabel: {
          fontSize: 11,
          fontWeight: "600",
          color: mutedOnImage,
        },
        statValue: {
          fontSize: 18,
          fontWeight: "700",
          color: textOnImage,
          marginTop: 2,
        },
        loadingWrap: {
          paddingVertical: space.md,
          alignItems: "flex-start",
        },
      }),
    [
      imageTone,
      mutedOnImage,
      radii.md,
      radii.sm,
      skeletonBg,
      space.md,
      space.sm,
      space.xs,
      textOnImage,
    ],
  );

  return (
    <View style={styles.card}>
      <ImageBackground source={PERIOD_IMAGE[period]} style={styles.image} imageStyle={styles.imageStyle}>
        <LinearGradient
          colors={
            imageTone === "dark"
              ? ["rgba(15,23,42,0.55)", "rgba(15,23,42,0.82)"]
              : ["rgba(255,255,255,0.55)", "rgba(255,255,255,0.88)"]
          }
          style={styles.body}
        >
          <View style={{ gap: space.md }}>
            <Text style={styles.title}>{greeting}</Text>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={textOnImage} />
                <View style={[styles.skeleton, { marginTop: space.sm }]}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonShort]} />
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonShort]} />
                </View>
              </View>
            ) : error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{t("dashboard.greetingBriefingError")}</Text>
                <HapticPressable
                  onPress={onRetry}
                  style={({ pressed }) => [styles.retry, pressedOpacity(pressed, PRESSED_OPACITY_CONTROL)]}
                >
                  <Text style={styles.retryText}>{t("dashboard.retry")}</Text>
                </HapticPressable>
              </View>
            ) : (
              <View style={styles.sections}>
                <View>
                  <Text style={styles.sectionTitle}>{t("dashboard.greetingNews")}</Text>
                  <Text style={styles.summary}>{data?.news}</Text>
                </View>
                <View>
                  <Text style={styles.sectionTitle}>{t("dashboard.greetingLookback")}</Text>
                  <Text style={styles.summary}>{data?.lookback}</Text>
                </View>
                <View>
                  <Text style={styles.sectionTitle}>{t("dashboard.greetingOutlook")}</Text>
                  <Text style={styles.summary}>{data?.outlook}</Text>
                </View>
              </View>
            )}
          </View>

          {data && !loading && !error ? (
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t("dashboard.greetingStatCreated")}</Text>
                <Text style={styles.statValue}>{data.counts.created24h}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t("dashboard.greetingStatCompleted")}</Text>
                <Text style={styles.statValue}>{data.counts.completed24h}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t("dashboard.greetingStatBookings")}</Text>
                <Text style={styles.statValue}>{data.counts.bookings24h}</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>{t("dashboard.greetingStatMaintenance")}</Text>
                <Text style={styles.statValue}>{data.counts.maintenanceNext48h}</Text>
              </View>
            </View>
          ) : null}
        </LinearGradient>
      </ImageBackground>
    </View>
  );
}
