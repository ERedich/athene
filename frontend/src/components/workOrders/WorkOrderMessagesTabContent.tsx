import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Mic, Reply, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LucideSpinner } from "../../icons/lucide";
import { useWhisperDictation, type WhisperDictationErrorCode } from "../../hooks/useWhisperDictation";
import { apiFetch } from "../../lib/api";
import type { WorkOrderMessage } from "../../lib/notificationCenter";

type WorkOrderMessagesTabContentProps = {
  messages: WorkOrderMessage[];
  loading: boolean;
  sending: boolean;
  currentUserId: string | null;
  onSend: (body: string, replyToMessageId?: string | null) => Promise<void>;
};

function dayKey(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatMessageTimestamp(iso: string, locale: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(value);
}

function formatDayLabel(iso: string, locale: string, todayLabel: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return iso;
  const today = new Date();
  if (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  ) {
    return todayLabel;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(value);
}

function isImageMime(mime: string | null | undefined): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

function MessageDocumentImage({
  workOrderId,
  documentId,
  mimeType,
  displayName,
}: {
  workOrderId: string;
  documentId: string;
  mimeType: string | null;
  displayName: string | null;
}) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImageMime(mimeType)) return;
    let revoked: string | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(
          `/api/work-orders/${workOrderId}/documents/${documentId}/content`,
        );
        if (!res.ok) throw new Error("content");
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setSrc(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [documentId, mimeType, workOrderId]);

  if (!isImageMime(mimeType)) {
    return (
      <div className="mb-1.5 text-xs text-on-surface-variant">
        {displayName || t("workOrders.messagesAttachment")}
      </div>
    );
  }

  if (failed) {
    return (
      <div className="mb-1.5 text-xs text-on-surface-variant">
        {displayName || t("workOrders.messagesAttachment")}
      </div>
    );
  }

  if (!src) {
    return (
      <div className="mb-1.5 flex h-28 items-center justify-center rounded-sm bg-[color-mix(in_srgb,var(--color-on-surface)_6%,transparent)]">
        <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1.5 block overflow-hidden rounded-sm"
    >
      <img
        src={src}
        alt={displayName || t("workOrders.messagesPhotoAlt")}
        className="max-h-56 w-full object-cover"
      />
    </a>
  );
}

export function WorkOrderMessagesTabContent({
  messages,
  loading,
  sending,
  currentUserId,
  onSend,
}: WorkOrderMessagesTabContentProps) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<WorkOrderMessage | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const appendTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setDraft((prev) => (prev.trim() ? `${prev.trimEnd()} ${trimmed}` : trimmed));
  }, []);

  const speech = useWhisperDictation({
    targetLocale: i18n.language,
    disabled: sending,
    onResult: appendTranscript,
  });

  const voiceErrorMessage = useCallback(
    (code: WhisperDictationErrorCode | null) => {
      if (!code) return null;
      if (code === "permission_denied") return t("assistant.voicePermissionDenied");
      if (code === "transcribe_failed") return t("assistant.voiceTranscribeFailed");
      if (code === "unsupported") return t("assistant.voiceNotSupported");
      return t("assistant.voiceError");
    },
    [t],
  );

  const replyLabel = useMemo(() => {
    if (!replyTo) return null;
    return t("workOrders.messagesReplyingTo", { name: replyTo.authorUserName });
  }, [replyTo, t]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending || speech.processing) return;
    speech.stop();
    await onSend(body, replyTo?.id ?? null);
    setDraft("");
    setReplyTo(null);
  }, [draft, onSend, replyTo, sending, speech.processing, speech.stop]);

  const onComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
            <span>{t("workOrders.messagesLoading")}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full min-h-[12rem] items-center justify-center text-sm text-on-surface-variant">
            {t("workOrders.messagesEmpty")}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message, index) => {
              const isOwn = currentUserId != null && message.authorUserId === currentUserId;
              const prev = index > 0 ? messages[index - 1] : null;
              const showDayDivider = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
              return (
                <div key={message.id} className="flex flex-col gap-3">
                  {showDayDivider ? (
                    <div
                      className="flex items-center gap-3 py-1"
                      role="separator"
                      aria-label={formatDayLabel(
                        message.createdAt,
                        i18n.language,
                        t("workOrders.messagesToday"),
                      )}
                    >
                      <div
                        className="h-px min-w-0 flex-1 bg-[color-mix(in_srgb,var(--color-on-surface)_18%,transparent)]"
                        aria-hidden
                      />
                      <time
                        className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant"
                        dateTime={dayKey(message.createdAt)}
                      >
                        {formatDayLabel(
                          message.createdAt,
                          i18n.language,
                          t("workOrders.messagesToday"),
                        )}
                      </time>
                      <div
                        className="h-px min-w-0 flex-1 bg-[color-mix(in_srgb,var(--color-on-surface)_18%,transparent)]"
                        aria-hidden
                      />
                    </div>
                  ) : null}
                  <article
                    className={`group relative rounded-sm px-3 py-2 text-sm text-on-surface ${
                      isOwn
                        ? "ml-8 bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)]"
                        : "mr-8 bg-surface-container-highest"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-widest text-on-surface-variant">
                      <span>{isOwn ? t("assistant.you") : message.authorUserName}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        {!isOwn ? (
                          <button
                            type="button"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-on-surface-variant opacity-0 transition-opacity hover:bg-[color-mix(in_srgb,var(--color-on-surface)_8%,transparent)] hover:text-[var(--color-primary)] group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={t("workOrders.messagesReply")}
                            title={t("workOrders.messagesReply")}
                            onClick={() => setReplyTo(message)}
                          >
                            <Reply className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                          </button>
                        ) : null}
                        <time
                          className="normal-case tracking-normal"
                          dateTime={message.createdAt}
                        >
                          {formatMessageTimestamp(message.createdAt, i18n.language)}
                        </time>
                      </div>
                    </div>
                    {message.replyToMessageId && message.replyToAuthorUserName ? (
                      <div className="mb-1.5 rounded-sm border-l-2 border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-on-surface)_6%,transparent)] px-2 py-1 text-xs text-on-surface-variant">
                        <div className="font-medium text-on-surface">{message.replyToAuthorUserName}</div>
                        {message.replyToBodyPreview ? (
                          <div className="line-clamp-2">{message.replyToBodyPreview}</div>
                        ) : null}
                      </div>
                    ) : null}
                    {message.documentId ? (
                      <MessageDocumentImage
                        workOrderId={message.workOrderId}
                        documentId={message.documentId}
                        mimeType={message.documentMimeType}
                        displayName={message.documentDisplayName}
                      />
                    ) : null}
                    {message.body.trim() ? (
                      <div className="whitespace-pre-wrap break-words">{message.body}</div>
                    ) : null}
                  </article>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 pt-3">
        {replyTo ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-sm border-l-2 border-[var(--color-primary)] bg-surface-container-highest px-2 py-1.5 text-xs text-on-surface-variant">
            <span className="min-w-0 truncate">{replyLabel}</span>
            <button
              type="button"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-on-surface-variant hover:text-[var(--color-primary)]"
              aria-label={t("workOrders.messagesCancelReply")}
              title={t("workOrders.messagesCancelReply")}
              onClick={() => setReplyTo(null)}
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ) : (
          <div className="mb-2 text-[11px] text-on-surface-variant">{t("workOrders.messagesDefaultRecipients")}</div>
        )}
        <label className="sr-only" htmlFor="work-order-message-input">
          {t("workOrders.messagesPlaceholder")}
        </label>
        <textarea
          id="work-order-message-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={t("workOrders.messagesPlaceholder")}
          className="min-h-[90px] w-full resize-none rounded-sm border border-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)] bg-surface-container-highest p-3 text-sm text-on-surface outline-none focus:border-[var(--color-primary)]"
          disabled={sending || speech.processing}
        />
        {speech.recording ? (
          <p className="mt-1 text-xs text-[var(--color-primary)]" aria-live="polite">
            {t("assistant.listening")}
          </p>
        ) : null}
        {speech.processing ? (
          <p className="mt-1 text-xs text-on-surface-variant" aria-live="polite">
            {t("assistant.voiceTranscribing")}
          </p>
        ) : null}
        {voiceErrorMessage(speech.errorCode) ? (
          <p className="mt-1 text-xs text-red-500" role="alert">
            {voiceErrorMessage(speech.errorCode)}
          </p>
        ) : null}
        <div
          className={`mt-2 grid gap-2 ${speech.supported ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {speech.supported ? (
            <button
              type="button"
              className={`inline-flex h-9 w-full items-center justify-center gap-2 rounded-sm border border-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)] text-sm font-semibold text-on-surface-variant transition-colors hover:text-[var(--color-primary)] disabled:opacity-50 ${
                speech.recording || speech.processing
                  ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-[var(--color-primary)]"
                  : ""
              }`}
              aria-label={
                speech.recording ? t("assistant.stopListening") : t("assistant.startListening")
              }
              title={
                speech.recording ? t("assistant.stopListening") : t("assistant.startListening")
              }
              aria-pressed={speech.recording}
              disabled={sending || speech.processing}
              onClick={speech.toggleRecording}
            >
              {speech.processing ? (
                <LucideSpinner className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              ) : (
                <Mic className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              )}
              <span>{t("assistant.voiceInput")}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-sm bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
            aria-label={t("workOrders.messagesSend")}
            title={t("workOrders.messagesSend")}
            disabled={sending || speech.processing || !draft.trim()}
            onClick={() => {
              void handleSend();
            }}
          >
            {sending ? (
              <LucideSpinner className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            ) : (
              <Send className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            )}
            <span>{t("workOrders.messagesSend")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
