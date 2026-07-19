import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { apiFetch } from "../lib/api";

type SweepStatus = {
  enabled: boolean;
  intervalMs: number | null;
  scheduleTime?: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  remainingMs: number | null;
};

type Props = {
  collapsed: boolean;
};

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function SidebarSweepTimer({ collapsed }: Props) {
  const { t } = useTranslation();
  const [nextRunAtMs, setNextRunAtMs] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/maintenance-plans/sweep-status");
      if (!res.ok) return;
      const data = (await res.json()) as SweepStatus;
      setEnabled(Boolean(data.enabled));
      if (data.nextRunAt) {
        const next = new Date(data.nextRunAt).getTime();
        if (!Number.isNaN(next)) {
          setNextRunAtMs(next);
          setRemainingMs(Math.max(0, next - Date.now()));
          return;
        }
      }
      setNextRunAtMs(null);
      setRemainingMs(data.remainingMs ?? null);
    } catch {
      // keep last known countdown
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const poll = window.setInterval(() => void refreshStatus(), 30_000);
    return () => window.clearInterval(poll);
  }, [refreshStatus]);

  useEffect(() => {
    if (nextRunAtMs === null) return;
    const tick = () => {
      const left = Math.max(0, nextRunAtMs - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        void refreshStatus();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [nextRunAtMs, refreshStatus]);

  if (!enabled || remainingMs === null) return null;

  const label = formatRemaining(remainingMs);
  const title = t("shell.sweepTimerTooltip", { time: label });

  if (collapsed) {
    return (
      <div
        className="mt-1 font-mono text-[9px] leading-none text-on-surface-variant tabular-nums"
        title={title}
        aria-label={title}
      >
        {label}
      </div>
    );
  }

  return (
    <div
      className="mt-1 font-mono text-[11px] leading-none text-on-surface-variant tabular-nums"
      title={title}
      aria-label={title}
    >
      {t("shell.sweepTimer", { time: label })}
    </div>
  );
}
