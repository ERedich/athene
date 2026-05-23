export type AudioRecordingSession = {
  stop: () => Promise<{ blob: Blob; mimeType: string }>;
  cancel: () => void;
};

const MAX_RECORDING_MS = 90_000;

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function isAudioRecordingSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext && window.location.hostname !== "localhost") return false;
  return Boolean(navigator.mediaDevices && typeof MediaRecorder !== "undefined" && pickMimeType());
}

export async function startAudioRecording(): Promise<AudioRecordingSession> {
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error("unsupported");

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopResolve: ((value: { blob: Blob; mimeType: string }) => void) | null = null;
  let stopReject: ((reason?: unknown) => void) | null = null;

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
    stream.getTracks().forEach((t) => t.stop());
  };

  const finish = () => {
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
  };

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  recorder.onerror = () => {
    cleanup();
    stopReject?.(new Error("recording_failed"));
  };

  recorder.onstop = () => {
    cleanup();
    const blob = new Blob(chunks, { type: mimeType });
    stopResolve?.({ blob, mimeType });
  };

  recorder.start(250);
  timeoutId = setTimeout(() => finish(), MAX_RECORDING_MS);

  return {
    stop: () =>
      new Promise((resolve, reject) => {
        stopResolve = resolve;
        stopReject = reject;
        finish();
      }),
    cancel: () => {
      cleanup();
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
