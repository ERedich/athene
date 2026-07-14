import { useCallback, useMemo, useState } from "react";
import { Reply, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";

import { LucideSpinner, lucidePrimeBtnIcon } from "../../icons/lucide";
import type { WorkOrderMessage } from "../../lib/notificationCenter";

type WorkOrderMessagesTabContentProps = {
  messages: WorkOrderMessage[];
  loading: boolean;
  sending: boolean;
  currentUserId: string | null;
  onSend: (body: string, replyToMessageId?: string | null) => Promise<void>;
};

function formatMessageTimestamp(iso: string, locale: string): { date: string; time: string } {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) {
    return { date: iso, time: "" };
  }
  return {
    date: new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(value),
    time: new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(value),
  };
}

function MessageTimestamp({
  createdAt,
  dateLabel,
  timeLabel,
  locale,
}: {
  createdAt: string;
  dateLabel: string;
  timeLabel: string;
  locale: string;
}) {
  const { date, time } = formatMessageTimestamp(createdAt, locale);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[11px] text-on-surface-variant">
      <span>
        {dateLabel}: {date}
      </span>
      <span>
        {timeLabel}: {time}
      </span>
    </div>
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

  const replyLabel = useMemo(() => {
    if (!replyTo) return null;
    return t("workOrders.messagesReplyingTo", { name: replyTo.authorUserName });
  }, [replyTo, t]);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    await onSend(body, replyTo?.id ?? null);
    setDraft("");
    setReplyTo(null);
  }, [draft, onSend, replyTo]);

  return (
    <div className="flex min-h-[20rem] flex-col gap-4 pt-1">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <LucideSpinner className="h-4 w-4" strokeWidth={1.75} />
            <span>{t("workOrders.messagesLoading")}</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-on-surface-variant">{t("workOrders.messagesEmpty")}</div>
        ) : (
          messages.map((message) => {
            const isOwn = currentUserId != null && message.authorUserId === currentUserId;
            return (
              <div
                key={message.id}
                className={`rounded-sm border border-solid px-3 py-2 ${
                  isOwn ? "border-primary/30 bg-primary/5" : "app-wo-detail-outline-border bg-surface-container-lowest"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                  <div className="text-sm font-medium">{message.authorUserName}</div>
                  <MessageTimestamp
                    createdAt={message.createdAt}
                    dateLabel={t("workOrders.messagesDate")}
                    timeLabel={t("workOrders.messagesTime")}
                    locale={i18n.language}
                  />
                </div>
                {message.replyToMessageId && message.replyToAuthorUserName ? (
                  <div className="mb-2 rounded-sm border-l-2 border-primary/40 bg-surface-container-high/60 px-2 py-1 text-xs text-on-surface-variant">
                    <div className="font-medium">{message.replyToAuthorUserName}</div>
                    {message.replyToCreatedAt ? (
                      <MessageTimestamp
                        createdAt={message.replyToCreatedAt}
                        dateLabel={t("workOrders.messagesDate")}
                        timeLabel={t("workOrders.messagesTime")}
                        locale={i18n.language}
                      />
                    ) : null}
                    {message.replyToBodyPreview ? <div>{message.replyToBodyPreview}</div> : null}
                  </div>
                ) : null}
                <div className="whitespace-pre-wrap text-sm">{message.body}</div>
                {!isOwn ? (
                  <div className="mt-2 flex justify-end">
                    <Button
                      type="button"
                      text
                      size="small"
                      className="!h-7 !min-h-7 !px-2"
                      icon={<Reply className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                      label={t("workOrders.messagesReply")}
                      onClick={() => setReplyTo(message)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-outline-variant/30 pt-3">
        {replyTo ? (
          <div className="flex items-center justify-between gap-2 rounded-sm bg-surface-container-high px-2 py-1 text-xs text-on-surface-variant">
            <span>{replyLabel}</span>
            <Button
              type="button"
              text
              size="small"
              className="!h-6 !min-h-6 !px-2"
              label={t("workOrders.messagesCancelReply")}
              onClick={() => setReplyTo(null)}
            />
          </div>
        ) : (
          <div className="text-xs text-on-surface-variant">{t("workOrders.messagesDefaultRecipients")}</div>
        )}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("workOrders.messagesPlaceholder")}
          rows={3}
          className="w-full resize-y rounded-sm border border-solid border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
          disabled={sending}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            icon={<Send className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            label={t("workOrders.messagesSend")}
            loading={sending}
            disabled={sending || !draft.trim()}
            onClick={() => {
              void handleSend();
            }}
          />
        </div>
      </div>
    </div>
  );
}
