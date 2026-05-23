import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

export type AudioRecordingResult = {
  uri: string;
  mimeType: string;
};

export type AudioRecordingSession = {
  stop: () => Promise<AudioRecordingResult>;
  cancel: () => void;
};

const MAX_RECORDING_MS = 90_000;

export function isAudioRecordingSupported(): boolean {
  return true;
}

export async function startAudioRecording(): Promise<AudioRecordingSession> {
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) throw new Error("permission_denied");

  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
  });

  const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await recorder.prepareToRecordAsync();
  recorder.record();

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  timeoutId = setTimeout(() => {
    if (recorder.isRecording) {
      void recorder.stop();
    }
  }, MAX_RECORDING_MS);

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };

  return {
    stop: async () => {
      cleanup();
      if (recorder.isRecording) {
        await recorder.stop();
      }
      const uri = recorder.uri;
      if (!uri) throw new Error("no_uri");
      return { uri, mimeType: "audio/m4a" };
    },
    cancel: () => {
      cleanup();
      if (recorder.isRecording) {
        void recorder.stop();
      }
    },
  };
}
