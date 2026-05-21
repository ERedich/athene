import { NativeModules, Platform } from "react-native";

/**
 * @react-native-voice/voice requires a dev build with native code linked.
 * In Expo Go the native bridge is null and Voice.isAvailable() throws.
 */
export function isVoiceNativeLinked(): boolean {
  if (Platform.OS === "web") return false;
  const modules = NativeModules as Record<string, unknown>;
  const voice = modules.Voice ?? modules.RNVoice;
  return voice != null && typeof voice === "object";
}
