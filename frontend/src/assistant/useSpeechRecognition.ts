import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultList = {
  length: number;
  [index: number]: { isFinal: boolean; [index: number]: { transcript: string } };
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

export type SpeechRecognitionErrorCode =
  | "permission_denied"
  | "no_speech"
  | "aborted"
  | "error";

export function speechRecognitionLocale(uiLocale: string): string {
  return uiLocale.toLowerCase().startsWith("de") ? "de-DE" : "en-US";
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
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

function mapSpeechError(error: string): SpeechRecognitionErrorCode {
  if (error === "not-allowed" || error === "service-not-allowed") return "permission_denied";
  if (error === "no-speech") return "no_speech";
  if (error === "aborted") return "aborted";
  return "error";
}

export function useSpeechRecognition({
  locale,
  disabled = false,
  onFinalTranscript,
  onInterimTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const supported = isSpeechRecognitionSupported();
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorCode, setErrorCode] = useState<SpeechRecognitionErrorCode | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const listeningRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  const onInterimRef = useRef(onInterimTranscript);

  onFinalRef.current = onFinalTranscript;
  onInterimRef.current = onInterimTranscript;

  const stop = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setInterimTranscript("");
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        recognition.abort();
      } catch {
        try {
          recognition.stop();
        } catch {
          /* ignore */
        }
      }
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor || disabled) return;

    setErrorCode(null);
    setInterimTranscript("");

    const recognition = new Ctor();
    recognition.lang = speechRecognitionLocale(locale);
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const trimmed = transcript.trim();
          if (trimmed) onFinalRef.current(trimmed);
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript(interim.trim());
      onInterimRef.current?.(interim.trim());
    };

    recognition.onerror = (event) => {
      const code = mapSpeechError(event.error);
      if (code !== "aborted" && code !== "no_speech") {
        setErrorCode(code);
      }
      if (code === "permission_denied") {
        listeningRef.current = false;
        setListening(false);
      }
    };

    recognition.onend = () => {
      if (!listeningRef.current) {
        setInterimTranscript("");
        return;
      }
      try {
        recognition.start();
      } catch {
        listeningRef.current = false;
        setListening(false);
        setInterimTranscript("");
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    setListening(true);

    try {
      recognition.start();
    } catch {
      listeningRef.current = false;
      setListening(false);
      setErrorCode("error");
    }
  }, [disabled, locale]);

  const toggleListening = useCallback(() => {
    if (listeningRef.current) {
      stop();
      return;
    }
    start();
  }, [start, stop]);

  useEffect(() => {
    if (disabled && listeningRef.current) {
      stop();
    }
  }, [disabled, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    supported,
    listening,
    interimTranscript,
    errorCode,
    toggleListening,
    stop,
  };
}
