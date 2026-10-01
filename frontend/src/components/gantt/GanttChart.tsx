import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { GanttTask } from "../../lib/projects/projectTypes";

type Props = {
  tasks: GanttTask[];
  minDate: string;
  maxDate: string;
  onTaskClick?: (task: GanttTask) => void;
  onTaskDoubleClick?: (task: GanttTask) => void;
};

const DAY_WIDTH = 32;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 56;
const LEFT_PANEL_WIDTH = 320;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function diffDays(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function taskColor(task: GanttTask): string {
  if (task.taskType === "milestone") return "#f59e0b";
  switch (task.status) {
    case "completed":
      return "#22c55e";
    case "in_progress":
      return "#f97316";
    case "cancelled":
      return "#ef4444";
    default:
      return "#6b7280";
  }
}

function priorityIcon(priority: string): string {
  switch (priority) {
    case "critical":
      return "pi-exclamation-triangle text-red-500";
    case "high":
      return "pi-arrow-up text-orange-500";
    case "low":
      return "pi-arrow-down text-blue-500";
    default:
      return "";
  }
}

export function GanttChart({
  tasks,
  minDate,
  maxDate,
  onTaskClick,
  onTaskDoubleClick,
}: Props) {
  const { t, i18n } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

  const langDe = i18n.language?.toLowerCase().startsWith("de");

  const chartStart = useMemo(() => {
    const d = new Date(minDate);
    d.setDate(d.getDate() - 7);
    return d;
  }, [minDate]);

  const chartEnd = useMemo(() => {
    const d = new Date(maxDate);
    d.setDate(d.getDate() + 14);
    return d;
  }, [maxDate]);

  const totalDays = useMemo(() => diffDays(chartStart, chartEnd), [chartStart, chartEnd]);

  const months = useMemo(() => {
    const result: { label: string; startDay: number; days: number }[] = [];
    let current = new Date(chartStart);
    let dayOffset = 0;

    while (current <= chartEnd) {
      const monthStart = dayOffset;
      const year = current.getFullYear();
      const month = current.getMonth();
      const label = current.toLocaleDateString(langDe ? "de-DE" : "en-US", {
        month: "short",
        year: "numeric",
      });

      let daysInMonth = 0;
      while (current <= chartEnd && current.getMonth() === month && current.getFullYear() === year) {
        daysInMonth++;
        current = addDays(current, 1);
        dayOffset++;
      }

      result.push({ label, startDay: monthStart, days: daysInMonth });
    }

    return result;
  }, [chartStart, chartEnd, langDe]);

  const days = useMemo(() => {
    const result: { date: Date; dayOfWeek: number; isWeekend: boolean; isToday: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let current = new Date(chartStart);
    while (current <= chartEnd) {
      const dayOfWeek = current.getDay();
      result.push({
        date: new Date(current),
        dayOfWeek,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        isToday: current.getTime() === today.getTime(),
      });
      current = addDays(current, 1);
    }
    return result;
  }, [chartStart, chartEnd]);

  const getTaskPosition = useCallback(
    (task: GanttTask) => {
      const start = new Date(task.plannedStart);
      const end = task.plannedEnd ? new Date(task.plannedEnd) : addDays(start, 1);
      const startOffset = diffDays(chartStart, start);
      const duration = diffDays(start, end);
      return {
        left: startOffset * DAY_WIDTH,
        width: Math.max(duration * DAY_WIDTH, task.taskType === "milestone" ? 16 : DAY_WIDTH),
      };
    },
    [chartStart],
  );

  const formatDate = useCallback(
    (date: Date) => {
      const pad = (n: number) => String(n).padStart(2, "0");
      if (langDe) {
        return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
      }
      return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
    },
    [langDe],
  );

  return (
    <div className="flex h-full overflow-hidden">
      <div
        className="flex flex-col border-r border-surface-200 dark:border-surface-700"
        style={{ width: LEFT_PANEL_WIDTH, minWidth: LEFT_PANEL_WIDTH }}
      >
        <div
          className="flex items-end border-b border-surface-200 bg-surface-100 px-3 text-xs font-semibold uppercase tracking-wide text-surface-600 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-400"
          style={{ height: HEADER_HEIGHT }}
        >
          <span className="pb-2">{t("projects.tasksLabel")}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className={`flex cursor-pointer items-center border-b border-surface-100 px-3 transition-colors hover:bg-surface-50 dark:border-surface-800 dark:hover:bg-surface-700 ${
                hoveredTaskId === task.id ? "bg-surface-50 dark:bg-surface-700" : ""
              }`}
              style={{ height: ROW_HEIGHT }}
              onMouseEnter={() => setHoveredTaskId(task.id)}
              onMouseLeave={() => setHoveredTaskId(null)}
              onClick={() => onTaskClick?.(task)}
              onDoubleClick={() => onTaskDoubleClick?.(task)}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {task.taskType === "milestone" ? (
                  <i className="pi pi-flag text-amber-500" />
                ) : (
                  <i className="pi pi-check-square text-surface-400" />
                )}
                <span className="truncate text-sm">
                  <span className="font-mono text-xs text-surface-500">{task.key}</span>{" "}
                  {task.name}
                </span>
                {priorityIcon(task.priority) && (
                  <i className={`pi ${priorityIcon(task.priority)} text-xs`} />
                )}
              </div>
              {task.workOrderCount > 0 && (
                <span className="ml-2 rounded-full bg-cyan-100 px-1.5 py-0.5 text-xs text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300">
                  {task.workOrderCount}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto">
        <div style={{ width: totalDays * DAY_WIDTH, minWidth: "100%" }}>
          <div
            className="sticky top-0 z-10 border-b border-surface-200 bg-surface-100 dark:border-surface-700 dark:bg-surface-800"
            style={{ height: HEADER_HEIGHT }}
          >
            <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
              {months.map((month, i) => (
                <div
                  key={i}
                  className="flex items-center justify-center border-r border-surface-200 text-xs font-semibold text-surface-600 dark:border-surface-700 dark:text-surface-400"
                  style={{ width: month.days * DAY_WIDTH }}
                >
                  {month.label}
                </div>
              ))}
            </div>
            <div className="flex" style={{ height: HEADER_HEIGHT / 2 }}>
              {days.map((day, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-center border-r text-xs ${
                    day.isToday
                      ? "bg-primary text-white"
                      : day.isWeekend
                        ? "bg-surface-200 text-surface-500 dark:bg-surface-700"
                        : "border-surface-200 text-surface-500 dark:border-surface-700"
                  }`}
                  style={{ width: DAY_WIDTH }}
                >
                  {day.date.getDate()}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            {days.map((day, i) => (
              <div
                key={i}
                className={`absolute top-0 border-r ${
                  day.isToday
                    ? "border-primary"
                    : day.isWeekend
                      ? "bg-surface-50 dark:bg-surface-800/50"
                      : "border-surface-100 dark:border-surface-800"
                }`}
                style={{
                  left: i * DAY_WIDTH,
                  width: DAY_WIDTH,
                  height: tasks.length * ROW_HEIGHT,
                }}
              />
            ))}

            {tasks.map((task, rowIndex) => {
              const { left, width } = getTaskPosition(task);
              const color = taskColor(task);

              return (
                <div
                  key={task.id}
                  className="absolute flex items-center"
                  style={{
                    top: rowIndex * ROW_HEIGHT,
                    height: ROW_HEIGHT,
                  }}
                >
                  {task.taskType === "milestone" ? (
                    <div
                      className={`cursor-pointer transition-transform hover:scale-110 ${
                        hoveredTaskId === task.id ? "scale-110" : ""
                      }`}
                      style={{
                        position: "absolute",
                        left: left + width / 2 - 8,
                        top: ROW_HEIGHT / 2 - 8,
                      }}
                      title={`${task.key}: ${task.name}\n${formatDate(new Date(task.plannedStart))}`}
                      onClick={() => onTaskClick?.(task)}
                      onDoubleClick={() => onTaskDoubleClick?.(task)}
                      onMouseEnter={() => setHoveredTaskId(task.id)}
                      onMouseLeave={() => setHoveredTaskId(null)}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16">
                        <polygon
                          points="8,0 16,8 8,16 0,8"
                          fill={color}
                          stroke="white"
                          strokeWidth="1"
                        />
                      </svg>
                    </div>
                  ) : (
                    <div
                      className={`absolute cursor-pointer rounded transition-all hover:brightness-110 ${
                        hoveredTaskId === task.id ? "brightness-110 ring-2 ring-primary" : ""
                      }`}
                      style={{
                        left,
                        width,
                        height: ROW_HEIGHT - 12,
                        top: 6,
                        backgroundColor: color,
                      }}
                      title={`${task.key}: ${task.name}\n${formatDate(new Date(task.plannedStart))} - ${task.plannedEnd ? formatDate(new Date(task.plannedEnd)) : "..."}\n${t("projects.task.progress")}: ${task.progress}%`}
                      onClick={() => onTaskClick?.(task)}
                      onDoubleClick={() => onTaskDoubleClick?.(task)}
                      onMouseEnter={() => setHoveredTaskId(task.id)}
                      onMouseLeave={() => setHoveredTaskId(null)}
                    >
                      {task.progress > 0 && (
                        <div
                          className="absolute left-0 top-0 h-full rounded-l bg-black/20"
                          style={{ width: `${task.progress}%` }}
                        />
                      )}
                      {width > 60 && (
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 truncate text-xs font-medium text-white">
                          {task.name}
                        </span>
                      )}
                    </div>
                  )}

                  {task.dependencies.map((dep) => {
                    const predTask = tasks.find((t) => t.id === dep.predecessorTaskId);
                    if (!predTask) return null;
                    const predRow = tasks.indexOf(predTask);
                    if (predRow === -1) return null;

                    const predPos = getTaskPosition(predTask);
                    const predEnd = predPos.left + predPos.width;
                    const taskStart = left;

                    const startY = predRow * ROW_HEIGHT + ROW_HEIGHT / 2;
                    const endY = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

                    return (
                      <svg
                        key={dep.id}
                        className="pointer-events-none absolute left-0 top-0 overflow-visible"
                        style={{ width: 1, height: 1 }}
                      >
                        <path
                          d={`M ${predEnd} ${startY} L ${predEnd + 10} ${startY} L ${predEnd + 10} ${endY} L ${taskStart} ${endY}`}
                          fill="none"
                          stroke="#94a3b8"
                          strokeWidth="1.5"
                          markerEnd="url(#arrowhead)"
                        />
                        <defs>
                          <marker
                            id="arrowhead"
                            markerWidth="6"
                            markerHeight="6"
                            refX="5"
                            refY="3"
                            orient="auto"
                          >
                            <polygon points="0 0, 6 3, 0 6" fill="#94a3b8" />
                          </marker>
                        </defs>
                      </svg>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
