import { useCallback, useEffect, useRef, useState, type AnimationEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";

import { AtheneWordmark } from "../../components/AtheneWordmark";

const DEFAULT_DURATION_MS = 10_000;
const EXIT_MS = 280;
const TIMER_RADIUS = 9;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

export type AtheneFieldTipProps = {
  message: ReactNode;
  onYes: () => void;
  onNo: () => void;
  /** Called when the auto-dismiss countdown reaches zero (defaults to onNo). */
  onTimeout?: () => void;
  /** How long the tip stays visible before auto-dismiss. Default 10s. */
  durationMs?: number;
  yesLabel?: string;
  noLabel?: string;
  className?: string;
};

type ExitAction = "yes" | "no" | "timeout";

/**
 * Floating Athene hint above a form field. Reusable by work-order create agents.
 * Auto-dismisses after {@link durationMs}; top-right arc shrinks from 360° to 0°.
 * Leave is animated before the parent callback runs.
 */
export function AtheneFieldTip({
  message,
  onYes,
  onNo,
  onTimeout,
  durationMs = DEFAULT_DURATION_MS,
  yesLabel,
  noLabel,
  className,
}: AtheneFieldTipProps) {
  const { t } = useTranslation();
  const yes = yesLabel ?? t("assistant.agents.yes");
  const no = noLabel ?? t("assistant.agents.no");
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const [exitAction, setExitAction] = useState<ExitAction | null>(null);
  const finishedRef = useRef(false);
  const onYesRef = useRef(onYes);
  const onNoRef = useRef(onNo);
  const onTimeoutRef = useRef(onTimeout ?? onNo);
  onYesRef.current = onYes;
  onNoRef.current = onNo;
  onTimeoutRef.current = onTimeout ?? onNo;

  const beginExit = useCallback((action: ExitAction) => {
    setExitAction((cur) => cur ?? action);
  }, []);

  const finishExit = useCallback((action: ExitAction) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (action === "yes") onYesRef.current();
    else if (action === "timeout") onTimeoutRef.current();
    else onNoRef.current();
  }, []);

  useEffect(() => {
    if (exitAction) return;
    setRemainingMs(durationMs);
    const endsAt = Date.now() + durationMs;
    let raf = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const left = Math.max(0, endsAt - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        beginExit("timeout");
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [beginExit, durationMs, exitAction]);

  useEffect(() => {
    if (!exitAction) return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      finishExit(exitAction);
      return;
    }
    const id = window.setTimeout(() => finishExit(exitAction), EXIT_MS + 40);
    return () => window.clearTimeout(id);
  }, [exitAction, finishExit]);

  const onExitAnimationEnd = useCallback(
    (e: AnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      if (!exitAction) return;
      finishExit(exitAction);
    },
    [exitAction, finishExit],
  );

  const progress = Math.min(1, Math.max(0, remainingMs / durationMs));
  const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const dashOffset = TIMER_CIRCUMFERENCE * (1 - progress);
  const exiting = exitAction != null;

  return (
    <div
      role="status"
      className={`app-athene-field-tip${exiting ? " app-athene-field-tip--exit" : ""} ${className ?? ""}`.trim()}
      onAnimationEnd={onExitAnimationEnd}
    >
      <div className="app-athene-field-tip__head">
        <span className="app-athene-field-tip__avatar" aria-hidden>
          <Star className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <AtheneWordmark
          brand={t("login.brand")}
          className="font-mono text-xs font-semibold tracking-tight"
        />
        <div
          className="app-athene-field-tip__timer"
          title={t("assistant.agents.tipTimer", { seconds: remainingSec })}
          aria-label={t("assistant.agents.tipTimer", { seconds: remainingSec })}
        >
          <svg viewBox="0 0 24 24" className="app-athene-field-tip__timer-svg" aria-hidden>
            <circle
              className="app-athene-field-tip__timer-track"
              cx="12"
              cy="12"
              r={TIMER_RADIUS}
              fill="none"
              strokeWidth="2.25"
            />
            <circle
              className="app-athene-field-tip__timer-arc"
              cx="12"
              cy="12"
              r={TIMER_RADIUS}
              fill="none"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeDasharray={TIMER_CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 12 12)"
            />
          </svg>
        </div>
      </div>
      <p className="app-athene-field-tip__message">{message}</p>
      <div className="app-athene-field-tip__actions">
        <button
          type="button"
          className="app-athene-field-tip__link"
          disabled={exiting}
          onClick={() => beginExit("yes")}
        >
          {yes}
        </button>
        <span className="app-athene-field-tip__sep" aria-hidden>
          /
        </span>
        <button
          type="button"
          className="app-athene-field-tip__link"
          disabled={exiting}
          onClick={() => beginExit("no")}
        >
          {no}
        </button>
      </div>
    </div>
  );
}
