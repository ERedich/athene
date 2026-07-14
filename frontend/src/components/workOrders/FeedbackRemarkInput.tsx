import { Mic } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { LucideSpinner } from "../../icons/lucide";
import { useLocalizedSpeechInput } from "../../hooks/useLocalizedSpeechInput";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  minHeightClass?: string;
};

const MAX_LEN = 2000;

export function FeedbackRemarkInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
  required = false,
  minHeightClass = "min-h-28",
}: Props) {
  const { t, i18n } = useTranslation();

  const appendText = useCallback(
    (text: string) => {
      const next = value.trim() ? `${value.trimEnd()} ${text}` : text;
      onChange(next.slice(0, MAX_LEN));
    },
    [onChange, value],
  );

  const speech = useLocalizedSpeechInput({
    targetLocale: i18n.language,
    disabled,
    onAppend: appendText,
    maxLength: MAX_LEN,
  });

  const voiceErrorMessage = () => {
    if (!speech.errorCode) return null;
    if (speech.errorCode === "permission_denied") return t("assistant.voicePermissionDenied");
    if (speech.errorCode === "transcribe_failed") return t("assistant.voiceTranscribeFailed");
    if (speech.errorCode === "unsupported") return t("assistant.voiceNotSupported");
    return t("assistant.voiceError");
  };

  return (
    <div className="space-y-2 col-span-2 md:col-span-6">
      <label htmlFor={id} className="block text-[11px] text-outline uppercase tracking-[0.1em]">
        {label}
        {required ? (
          <span className="app-required-marker" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      <div className="flex items-stretch gap-2">
        <textarea
          id={id}
          value={value}
          maxLength={MAX_LEN}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            speech.listening && speech.interimTranscript ? speech.interimTranscript : undefined
          }
          className={`min-w-0 flex-1 p-inputtext p-component resize-y ${minHeightClass}`}
          disabled={disabled}
        />
        {speech.supported ? (
          <div className="relative flex w-[4.5rem] shrink-0 self-stretch">
            {speech.listening ? (
              <span
                className="app-feedback-voice-pulse-ring pointer-events-none absolute inset-0 rounded-sm border-2 border-[var(--color-primary)]"
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              className={`flex h-full w-full flex-1 items-center justify-center rounded-sm border border-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)] text-on-surface-variant transition-colors hover:text-[var(--color-primary)] disabled:opacity-50 ${
                speech.listening || speech.localizing
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]"
                  : ""
              }`}
              aria-label={
                speech.listening ? t("assistant.stopListening") : t("workOrders.feedbackVoiceInput")
              }
              title={speech.listening ? t("assistant.stopListening") : t("workOrders.feedbackVoiceInput")}
              aria-pressed={speech.listening}
              disabled={disabled || speech.localizing}
              onClick={speech.toggleListening}
            >
              {speech.localizing ? (
                <LucideSpinner className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              ) : (
                <Mic className="h-6 w-6 shrink-0" strokeWidth={1.75} aria-hidden />
              )}
            </button>
          </div>
        ) : null}
      </div>
      {speech.listening ? (
        <p className="text-xs text-[var(--color-primary)]" aria-live="polite">
          {t("assistant.listening")}
        </p>
      ) : null}
      {speech.localizing ? (
        <p className="text-xs text-on-surface-variant" aria-live="polite">
          {t("workOrders.feedbackVoiceTranscribing")}
        </p>
      ) : null}
      {voiceErrorMessage() ? (
        <p className="text-xs text-red-500" role="alert">
          {voiceErrorMessage()}
        </p>
      ) : null}
      <div className="text-xs text-on-surface-variant text-right">
        {t("workOrders.descriptionCounter", { count: value.length, max: MAX_LEN })}
      </div>
    </div>
  );
}
