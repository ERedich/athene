import { useCallback, useEffect, useRef, useState } from "react";
import Voice from "@react-native-voice/voice";

import {
  speechRecognitionLocale,
  type SpeechRecognitionErrorCode,
  type UseSpeechRecognitionOptions,
  type UseSpeechRecognitionResult,
} from "./speechRecognitionTypes";
import { isVoiceNativeLinked } from "./voiceNativeModule";

const noopStop = async () => undefined;

export function useSpeechRecognition({
  locale,
  disabled = false,
  onFinalTranscript,
  onInterimTranscript,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const nativeLinked = isVoiceNativeLinked();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorCode, setErrorCode] = useState<SpeechRecognitionErrorCode | null>(null);

  const listeningRef = useRef(false);
  const onFinalRef = useRef(onFinalTranscript);
  const onInterimRef = useRef(onInterimTranscript);

  onFinalRef.current = onFinalTranscript;
  onInterimRef.current = onInterimTranscript;

  const stop = useCallback(async () => {
    listeningRef.current = false;
    setListening(false);
    setInterimTranscript("");
    if (!nativeLinked) return;
    try {
      await Voice.cancel();
    } catch {
      try {
        await Voice.stop();
      } catch {
        /* ignore */
      }
    }
  }, [nativeLinked]);

  const start = useCallback(async () => {
    if (disabled || !supported || !nativeLinked) return;
    setErrorCode(null);
    setInterimTranscript("");
    try {
      await Voice.start(speechRecognitionLocale(locale));
      listeningRef.current = true;
      setListening(true);
    } catch {
      setErrorCode("error");
      listeningRef.current = false;
      setListening(false);
    }
  }, [disabled, locale, nativeLinked, supported]);

  const toggleListening = useCallback(() => {
    if (listeningRef.current) {
      void stop();
      return;
    }
    void start();
  }, [start, stop]);

  useEffect(() => {
    if (!nativeLinked) {
      setSupported(false);
      return undefined;
    }

    let cancelled = false;
    void Voice.isAvailable()
      .then((available) => {
        if (!cancelled) setSupported(available === 1);
      })
      .catch(() => {
        if (!cancelled) setSupported(false);
      });

    Voice.onSpeechResults = (event) => {
      const text = event.value?.[0]?.trim();
      if (text) onFinalRef.current(text);
      setInterimTranscript("");
    };

    Voice.onSpeechPartialResults = (event) => {
      const partial = event.value?.[0]?.trim() ?? "";
      setInterimTranscript(partial);
      onInterimRef.current?.(partial);
    };

    Voice.onSpeechError = (event) => {
      const message = event.error?.message ?? "";
      if (/permission|denied|not allowed/i.test(message)) {
        setErrorCode("permission_denied");
      } else {
        setErrorCode("error");
      }
      listeningRef.current = false;
      setListening(false);
      setInterimTranscript("");
    };

    Voice.onSpeechEnd = () => {
      if (!listeningRef.current) return;
      listeningRef.current = false;
      setListening(false);
      setInterimTranscript("");
    };

    return () => {
      cancelled = true;
      listeningRef.current = false;
      void Voice.destroy()
        .then(() => Voice.removeAllListeners())
        .catch(() => Voice.removeAllListeners());
    };
  }, [nativeLinked]);

  useEffect(() => {
    if (disabled && listeningRef.current) {
      void stop();
    }
  }, [disabled, stop]);

  useEffect(() => () => void stop(), [stop]);

  if (!nativeLinked) {
    return {
      supported: false,
      listening: false,
      interimTranscript: "",
      errorCode: null,
      toggleListening: () => undefined,
      stop: noopStop,
    };
  }

  return {
    supported,
    listening,
    interimTranscript,
    errorCode,
    toggleListening,
    stop,
  };
}
