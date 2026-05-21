import { useCallback, useRef, useState } from "react";

import { useSpeechRecognition } from "../assistant/useSpeechRecognition";
import type { SpeechRecognitionErrorCode } from "../assistant/speechRecognitionTypes";
import { apiFetch } from "../lib/api";

export type UseLocalizedSpeechInputOptions = {
  targetLocale: string;
  disabled?: boolean;
  onAppend: (text: string) => void;
  maxLength?: number;
};

export function useLocalizedSpeechInput({
  targetLocale,
  disabled = false,
  onAppend,
  maxLength = 2000,
}: UseLocalizedSpeechInputOptions) {
  const [localizing, setLocalizing] = useState(false);
  const localizingRef = useRef(false);

  const localizeAndAppend = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed || localizingRef.current) return;
      localizingRef.current = true;
      setLocalizing(true);
      try {
        const res = await apiFetch("/api/assistant/localize-spoken-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, targetLocale }),
        });
        if (!res.ok) throw new Error("localize_failed");
        const data = (await res.json()) as { text?: string };
        const localized = (data.text ?? trimmed).trim();
        if (!localized) return;
        onAppend(localized.slice(0, maxLength));
      } catch {
        onAppend(trimmed.slice(0, maxLength));
      } finally {
        localizingRef.current = false;
        setLocalizing(false);
      }
    },
    [maxLength, onAppend, targetLocale],
  );

  const speech = useSpeechRecognition({
    locale: targetLocale,
    disabled: disabled || localizing,
    onFinalTranscript: (text) => {
      void localizeAndAppend(text);
    },
  });

  return {
    supported: speech.supported,
    listening: speech.listening,
    interimTranscript: speech.interimTranscript,
    errorCode: speech.errorCode as SpeechRecognitionErrorCode | null,
    localizing,
    toggleListening: speech.toggleListening,
    stop: speech.stop,
  };
}
