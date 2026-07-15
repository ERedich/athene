import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Reply, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LucideSpinner } from "../../icons/lucide";
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
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function formatBubbleTime(iso: string, locale: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(value);
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
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(value);
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

  const replyLabel = useMemo(() => {
    if (!replyTo) return null;
    return t("workOrders.messagesReplyingTo", { name: replyTo.authorUserName });
  }, [replyTo, t]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    await onSend(body, replyTo?.id ?? null);
    setDraft("");
    setReplyTo(null);
  }, [draft, onSend, replyTo, sending]);

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
    <div className="flex min-h-[20rem] flex-col">
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-2">
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
          messages.map((message, index) => {
            const isOwn = currentUserId != null && message.authorUserId === currentUserId;
            const prev = index > 0 ? messages[index - 1] : null;
            const showDaySeparator = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
            return (
              <div key={message.id} className="space-y-2">
                {showDaySeparator ? (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full bg-surface-container-high px-3 py-0.5 text-[11px] font-medium text-on-surface-variant">
                      {formatDayLabel(message.createdAt, i18n.language, t("workOrders.messagesToday"))}
                    </span>
                  </div>
                ) : null}
                <div className={`group flex ${isOwn ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`relative max-w-[75%] rounded-2xl px-3 py-2 text-sm text-on-surface shadow-sm ${
                      isOwn
                        ? "rounded-br-md bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)]"
                        : "rounded-bl-md bg-surface-container-highest"
                    }`}
                  >
                    {!isOwn ? (
                      <div className="mb-0.5 text-xs font-semibold text-[var(--color-primary)]">
                        {message.authorUserName}
                      </div>
                    ) : null}
                    {message.replyToMessageId && message.replyToAuthorUserName ? (
                      <div className="mb-1.5 rounded-md border-l-2 border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-on-surface)_6%,transparent)] px-2 py-1 text-xs text-on-surface-variant">
                        <div className="font-medium text-on-surface">{message.replyToAuthorUserName}</div>
                        {message.replyToBodyPreview ? (
                          <div className="line-clamp-2">{message.replyToBodyPreview}</div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="whitespace-pre-wrap break-words pr-8">{message.body}</div>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      {!isOwn ? (
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant opacity-0 transition-opacity hover:bg-[color-mix(in_srgb,var(--color-on-surface)_8%,transparent)] hover:text-[var(--color-primary)] group-hover:opacity-100 focus-visible:opacity-100"
                          aria-label={t("workOrders.messagesReply")}
                          title={t("workOrders.messagesReply")}
                          onClick={() => setReplyTo(message)}
                        >
                          <Reply className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        </button>
                      ) : null}
                      <time
                        className="text-[11px] leading-none text-on-surface-variant"
                        dateTime={message.createdAt}
                      >
                        {formatBubbleTime(message.createdAt, i18n.language)}
                      </time>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 pt-3">
        {replyTo ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border-l-2 border-[var(--color-primary)] bg-surface-container-highest px-2 py-1.5 text-xs text-on-surface-variant">
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
        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={t("workOrders.messagesPlaceholder")}
            rows={1}
            className="box-border max-h-28 min-h-10 w-full min-w-0 resize-none rounded-2xl border border-[color-mix(in_srgb,var(--color-on-surface)_18%,transparent)] bg-surface-container-highest px-3 py-2.5 text-sm text-on-surface outline-none focus:border-[var(--color-primary)]"
            disabled={sending}
          />
          <button
            type="button"
            className="box-border inline-flex h-10 w-10 max-w-10 min-w-10 items-center justify-center justify-self-end rounded-full bg-[var(--color-primary)] text-white transition-opacity disabled:opacity-45"
            aria-label={t("workOrders.messagesSend")}
            title={t("workOrders.messagesSend")}
            disabled={sending || !draft.trim()}
            onClick={() => {
              void handleSend();
            }}
          >
            {sending ? (
              <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
