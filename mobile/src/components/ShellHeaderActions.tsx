import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

type Props = {
  /** Optional actions (e.g. New, Delete). Theme, language, and sign-out live in the drawer menu. */
  extra?: ReactNode;
};

export function ShellHeaderActions({ extra }: Props) {
  if (!extra) return null;
  return <View style={styles.row}>{extra}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingEnd: 12,
  },
});
