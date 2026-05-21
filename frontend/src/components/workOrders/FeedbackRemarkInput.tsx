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
    return t("assistant.voiceError");
  };

  return (
    <div className="space-y-2 col-span-2 md:col-span-6">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="block text-[11px] text-outline uppercase tracking-[0.1em]">
          {label}
          {required ? (
            <span className="app-required-marker" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {speech.supported ? (
          <button
            type="button"
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)] text-on-surface-variant transition-colors hover:text-[var(--color-primary)] disabled:opacity-50 ${
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
              <LucideSpinner className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <Mic className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        ) : null}
      </div>
      <textarea
        id={id}
        value={value}
        maxLength={MAX_LEN}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          speech.listening && speech.interimTranscript ? speech.interimTranscript : undefined
        }
        className={`w-full p-inputtext p-component resize-y ${minHeightClass}`}
        disabled={disabled}
      />
      {speech.listening ? (
        <p className="text-xs text-[var(--color-primary)]" aria-live="polite">
          {t("assistant.listening")}
        </p>
      ) : null}
      {speech.localizing ? (
        <p className="text-xs text-on-surface-variant" aria-live="polite">
          {t("workOrders.feedbackVoiceLocalizing")}
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
