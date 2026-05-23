import { useWhisperDictation, type WhisperDictationErrorCode } from "./useWhisperDictation";

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
  const dictation = useWhisperDictation({
    targetLocale,
    disabled,
    onResult: (text) => {
      const next = text.trim();
      if (!next) return;
      onAppend(next.slice(0, maxLength));
    },
  });

  return {
    supported: dictation.supported,
    listening: dictation.recording,
    interimTranscript: "",
    errorCode: dictation.errorCode as SpeechRecognitionErrorCode | null,
    localizing: dictation.processing,
    toggleListening: dictation.toggleRecording,
    stop: dictation.stop,
  };
}

export type SpeechRecognitionErrorCode = WhisperDictationErrorCode;
