import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/**
 * Open a locally cached document on native platforms.
 * Uses the system share / open-with sheet — Linking.openURL(file://) is blocked on iOS/Android.
 */
export async function openNativeLocalDocument(
  localUri: string,
  options?: { mimeType?: string | null; displayName?: string | null },
): Promise<void> {
  if (Platform.OS === "web") {
    throw new Error("use_web_open");
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error("sharing_unavailable");
  }
  await Sharing.shareAsync(localUri, {
    mimeType: options?.mimeType?.trim() || undefined,
    dialogTitle: options?.displayName?.trim() || undefined,
  });
}

export function isImageMime(mimeType: string | null | undefined): boolean {
  return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
}
