export type SpeechRecognitionErrorCode =
  | "permission_denied"
  | "no_speech"
  | "aborted"
  | "error";

export function speechRecognitionLocale(uiLocale: string): string {
  return uiLocale.toLowerCase().startsWith("de") ? "de-DE" : "en-US";
}

export type UseSpeechRecognitionOptions = {
  locale: string;
  disabled?: boolean;
  onFinalTranscript: (text: string) => void;
  onInterimTranscript?: (text: string) => void;
};

export type UseSpeechRecognitionResult = {
  supported: boolean;
  listening: boolean;
  interimTranscript: string;
  errorCode: SpeechRecognitionErrorCode | null;
  toggleListening: () => void;
  stop: () => void;
};
