import { useCallback, useEffect, useRef, useState } from "react";

import { isAudioRecordingSupported, startAudioRecording } from "../lib/audioRecording";
import { apiFetch } from "../lib/api";

export type WhisperDictationErrorCode = "permission_denied" | "unsupported" | "transcribe_failed";

export type UseWhisperDictationOptions = {
  targetLocale: string;
  disabled?: boolean;
  onResult: (text: string) => void;
};

export function useWhisperDictation({ targetLocale, disabled = false, onResult }: UseWhisperDictationOptions) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorCode, setErrorCode] = useState<WhisperDictationErrorCode | null>(null);
  const sessionRef = useRef<Awaited<ReturnType<typeof startAudioRecording>> | null>(null);
  const processingRef = useRef(false);

  const supported = isAudioRecordingSupported();

  const stopSession = useCallback(() => {
    sessionRef.current?.cancel();
    sessionRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => () => stopSession(), [stopSession]);

  const uploadAndAppend = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (processingRef.current) return;
      processingRef.current = true;
      setProcessing(true);
      setErrorCode(null);
      try {
        const formData = new FormData();
        formData.append("audio", blob, `spoken.${mimeType.includes("webm") ? "webm" : "m4a"}`);
        formData.append("targetLocale", targetLocale);
        const res = await apiFetch("/api/assistant/transcribe-spoken", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          if (res.status === 503) throw new Error("not_configured");
          throw new Error("transcribe_failed");
        }
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (text) onResult(text);
      } catch (err) {
        const message = (err as Error).message;
        if (message === "not_configured" || message === "transcribe_failed") {
          setErrorCode("transcribe_failed");
        } else {
          setErrorCode("transcribe_failed");
        }
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [onResult, targetLocale],
  );

  const startRecording = useCallback(async () => {
    if (disabled || processing || recording || !supported) return;
    setErrorCode(null);
    try {
      const session = await startAudioRecording();
      sessionRef.current = session;
      setRecording(true);
    } catch {
      setErrorCode("permission_denied");
      stopSession();
    }
  }, [disabled, processing, recording, stopSession, supported]);

  const stopRecording = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    setRecording(false);
    try {
      const { blob, mimeType } = await session.stop();
      if (blob.size < 1) {
        setErrorCode("transcribe_failed");
        return;
      }
      await uploadAndAppend(blob, mimeType);
    } catch {
      setErrorCode("transcribe_failed");
    }
  }, [uploadAndAppend]);

  const toggleRecording = useCallback(() => {
    if (recording) void stopRecording();
    else void startRecording();
  }, [recording, startRecording, stopRecording]);

  const stop = useCallback(() => {
    if (recording) {
      sessionRef.current?.cancel();
      sessionRef.current = null;
      setRecording(false);
      return;
    }
    processingRef.current = false;
    setProcessing(false);
  }, [recording]);

  return {
    supported,
    recording,
    processing,
    errorCode,
    toggleRecording,
    stop,
  };
}
