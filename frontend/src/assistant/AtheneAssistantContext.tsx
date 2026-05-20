import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LucideSpinner } from "../icons/lucide";
import { apiFetch } from "../lib/api";

export type AtheneUiContext = {
  type: "workOrder" | "asset" | "monitoring" | "sparePart" | "warehouse" | "app" | "unknown";
  id?: string;
  label?: string;
  data?: unknown;
};

type AtheneMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  locale: string | null;
  clientContext: AtheneUiContext | null;
  createdAt: string;
};

type AtheneAssistantContextValue = {
  busy: boolean;
  open: () => void;
  close: () => void;
  openWithContext: (context: AtheneUiContext) => void;
};

const AtheneAssistantContext = createContext<AtheneAssistantContextValue | null>(null);

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutEdges = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  return (
    lines[index]?.includes("|") &&
    lines[index + 1]?.includes("|") &&
    isMarkdownTableSeparator(lines[index + 1])
  );
}

function renderInlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function renderMessageContent(content: string) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  const paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="m-0 whitespace-pre-wrap leading-relaxed">
        {renderInlineText(paragraph.join("\n"))}
      </p>,
    );
    paragraph.length = 0;
  };

  for (let i = 0; i < lines.length; i += 1) {
    if (isMarkdownTableStart(lines, i)) {
      flushParagraph();
      const headers = splitMarkdownTableRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitMarkdownTableRow(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push(
        <div key={`table-${blocks.length}`} className="my-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    className="border border-[color-mix(in_srgb,var(--color-on-surface)_18%,transparent)] bg-surface-container-highest px-2 py-1 font-semibold text-on-surface"
                  >
                    {renderInlineText(header)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {headers.map((_, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border border-[color-mix(in_srgb,var(--color-on-surface)_14%,transparent)] px-2 py-1 align-top text-on-surface"
                    >
                      {renderInlineText(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    paragraph.push(lines[i]);
  }

  flushParagraph();
  return <div className="space-y-2">{blocks}</div>;
}

const ASSISTANT_DRAWER_MS = 280;

export function AtheneAssistantProvider({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelIn, setPanelIn] = useState(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AtheneMessage[]>([]);
  const [uiContext, setUiContext] = useState<AtheneUiContext | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadedRef = useRef(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);

  const revealNewestMessage = useCallback(() => {
    window.requestAnimationFrame(() => {
      const el = messagesScrollRef.current;
      if (!el) return;
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const revealOffset = Math.min(120, maxScrollTop);
      if (revealOffset <= 0) {
        el.scrollTo({ top: 0 });
        return;
      }
      el.scrollTop = revealOffset;
      window.requestAnimationFrame(() => {
        el.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  }, []);

  const loadConversation = useCallback(async () => {
    try {
      const res = await apiFetch("/api/assistant");
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as { messages?: AtheneMessage[] };
      setMessages(data.messages ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void loadConversation();
  }, [loadConversation]);

  useEffect(() => {
    if (visible) {
      setPanelMounted(true);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setPanelIn(true));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setPanelIn(false);
  }, [visible]);

  const onPanelTransitionEnd = useCallback((event: TransitionEvent<HTMLElement>) => {
    if (event.propertyName !== "transform") return;
    if (!visibleRef.current) {
      setPanelMounted(false);
    }
  }, []);

  const open = useCallback(() => {
    setVisible(true);
    void loadConversation();
  }, [loadConversation]);

  const close = useCallback(() => setVisible(false), []);

  const openWithContext = useCallback(
    (context: AtheneUiContext) => {
      setUiContext(context);
      setVisible(true);
      void loadConversation();
    },
    [loadConversation],
  );

  const send = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const message = input.trim();
      if (!message || busy) return;
      setBusy(true);
      setInput("");
      try {
        const res = await apiFetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            locale: i18n.language,
            uiContext,
          }),
        });
        if (!res.ok) throw new Error("send_failed");
        const data = (await res.json()) as {
          userMessage?: AtheneMessage;
          assistantMessage?: AtheneMessage;
        };
        setMessages((cur) => [
          ...(data.assistantMessage ? [data.assistantMessage] : []),
          ...(data.userMessage ? [data.userMessage] : []),
          ...cur,
        ]);
        revealNewestMessage();
        setLoadError(false);
      } catch {
        setMessages((cur) => [
          {
            id: `local-${Date.now()}`,
            role: "assistant",
            content: t("assistant.sendError"),
            locale: i18n.language,
            clientContext: uiContext,
            createdAt: new Date().toISOString(),
          },
          ...cur,
        ]);
        revealNewestMessage();
      } finally {
        setBusy(false);
      }
    },
    [busy, i18n.language, input, revealNewestMessage, t, uiContext],
  );

  const value = useMemo<AtheneAssistantContextValue>(
    () => ({ busy, open, close, openWithContext }),
    [busy, close, open, openWithContext],
  );

  const uiContextKindLabel =
    uiContext?.type === "workOrder"
      ? t("assistant.contextWorkOrder")
      : uiContext?.type === "asset"
        ? t("assistant.contextAsset")
        : uiContext?.type === "monitoring"
          ? t("assistant.contextMonitoring")
          : uiContext?.type === "sparePart"
            ? t("assistant.contextSparePart")
            : uiContext?.type === "warehouse"
              ? t("assistant.contextWarehouse")
              : null;

  const formatMessageTimestamp = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  return (
    <AtheneAssistantContext.Provider value={value}>
      {children}
      {panelMounted ? (
        <div className="fixed inset-0 z-[1000] flex justify-end" role="presentation">
          <div
            className={`absolute inset-0 bg-black/35 transition-opacity ease-out ${
              panelIn ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDuration: `${ASSISTANT_DRAWER_MS}ms` }}
            aria-hidden
            onMouseDown={() => close()}
          />
          <section
            className={`relative z-10 ml-auto flex h-full w-[60vw] max-w-[60vw] shrink-0 flex-col bg-surface-container-low shadow-2xl transition-transform ease-out ${
              panelIn ? "translate-x-0" : "translate-x-full"
            }`}
            style={{ transitionDuration: `${ASSISTANT_DRAWER_MS}ms` }}
            aria-label={t("assistant.title")}
            onMouseDown={(event) => event.stopPropagation()}
            onTransitionEnd={onPanelTransitionEnd}
          >
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="m-0 font-mono text-base font-semibold text-on-surface">
                  {t("assistant.title")}
                </h2>
                <p className="m-0 truncate text-xs text-on-surface-variant">
                  {uiContextKindLabel && uiContext?.label ? (
                    <>
                      <strong className="font-bold text-on-surface">{uiContextKindLabel}</strong>
                      <span>: {uiContext.label}</span>
                    </>
                  ) : (
                    t("assistant.globalContext")
                  )}
                </p>
              </div>
              <button
                type="button"
                className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-on-surface-variant hover:text-[var(--color-primary)]"
                aria-label={t("assistant.close")}
                title={t("assistant.close")}
                onClick={close}
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </header>

            <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
              {loadError ? (
                <div className="rounded-sm bg-red-500/10 px-3 py-2 text-sm text-red-500">
                  {t("assistant.loadError")}
                </div>
              ) : null}
              {messages.length === 0 ? (
                <div className="rounded-sm bg-surface-container-highest px-3 py-2 text-sm text-on-surface-variant">
                  {t("assistant.empty")}
                </div>
              ) : null}
              <div className="flex flex-col gap-3">
                {busy ? (
                  <div className="mr-8 flex items-center gap-2 rounded-sm bg-surface-container-highest px-3 py-2 text-sm text-on-surface">
                    <LucideSpinner className="h-4 w-4 text-[var(--color-primary)]" strokeWidth={1.75} />
                    <span>{t("assistant.thinking")}</span>
                  </div>
                ) : null}
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={`rounded-sm px-3 py-2 text-sm ${
                      message.role === "user"
                        ? "ml-8 bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] text-on-surface"
                        : "mr-8 bg-surface-container-highest text-on-surface"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-widest text-on-surface-variant">
                      <span>{message.role === "user" ? t("assistant.you") : "Athene"}</span>
                      <time className="shrink-0 normal-case tracking-normal" dateTime={message.createdAt}>
                        {formatMessageTimestamp(message.createdAt)}
                      </time>
                    </div>
                    {renderMessageContent(message.content)}
                  </article>
                ))}
              </div>
            </div>

            <form className="border-t border-white/10 p-3" onSubmit={send}>
              <label className="sr-only" htmlFor="athene-assistant-input">
                {t("assistant.inputLabel")}
              </label>
              <textarea
                id="athene-assistant-input"
                className="min-h-[90px] w-full resize-none rounded-sm border border-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)] bg-surface-container-highest p-3 text-sm text-on-surface outline-none focus:border-[var(--color-primary)]"
                value={input}
                placeholder={t("assistant.placeholder")}
                disabled={busy}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="text-xs text-on-surface-variant hover:text-[var(--color-primary)]"
                  onClick={() => setUiContext(null)}
                >
                  {t("assistant.clearContext")}
                </button>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-2 rounded-sm bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={busy || !input.trim()}
                >
                  {busy ? (
                    <LucideSpinner className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  ) : (
                    <Send className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  )}
                  <span>{t("assistant.send")}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AtheneAssistantContext.Provider>
  );
}

export function useAtheneAssistant(): AtheneAssistantContextValue {
  const ctx = useContext(AtheneAssistantContext);
  if (!ctx) {
    throw new Error("useAtheneAssistant must be used within AtheneAssistantProvider");
  }
  return ctx;
}
