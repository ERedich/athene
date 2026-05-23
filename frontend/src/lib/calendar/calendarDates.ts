import type { CalendarViewMode, WeekStartsOn } from "./calendarTypes";
import { DEFAULT_WEEK_STARTS_ON } from "./calendarTypes";

export type CalendarDayCell = {
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  isoKey: string;
};

export type CalendarWeekRow = {
  weekStart: Date;
  days: CalendarDayCell[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

/** ISO 8601 calendar week (Kalenderwoche), 1–53. */
export function getISOWeekNumber(date: Date): number {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function isoWeekNumberForWeekStart(weekStart: Date): number {
  return getISOWeekNumber(addDays(weekStart, 3));
}

export function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWeekStart(d: Date, weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON): Date {
  const day = d.getDay();
  const diff = (day + 7 - weekStartsOn) % 7;
  return startOfDay(addDays(d, -diff));
}

function buildWeekRow(weekStart: Date, month: number | null, today: Date): CalendarWeekRow {
  const days: CalendarDayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    days.push({
      date,
      inMonth: month === null ? true : date.getMonth() === month,
      isToday: date.getTime() === today.getTime(),
      isoKey: formatIsoDate(date),
    });
  }
  return { weekStart: new Date(weekStart), days };
}

export function buildMonthGrid(
  anchorDate: Date,
  weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON,
): CalendarWeekRow[] {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();
  const firstOfMonth = startOfDay(new Date(year, month, 1));
  const lastOfMonth = startOfDay(new Date(year, month + 1, 0));
  const today = startOfDay(new Date());
  const weeks: CalendarWeekRow[] = [];
  let cursor = getWeekStart(firstOfMonth, weekStartsOn);

  while (weeks.length < 6) {
    weeks.push(buildWeekRow(cursor, month, today));
    const lastDay = weeks[weeks.length - 1].days[6].date;
    cursor = addDays(cursor, 7);
    if (weeks.length >= 4 && lastDay.getTime() >= lastOfMonth.getTime()) {
      break;
    }
  }

  return weeks;
}

export function buildWeekGrid(
  anchorDate: Date,
  weekStartsOn: WeekStartsOn = DEFAULT_WEEK_STARTS_ON,
): CalendarWeekRow[] {
  const weekStart = getWeekStart(anchorDate, weekStartsOn);
  const today = startOfDay(new Date());
  return [buildWeekRow(weekStart, null, today)];
}

export function getVisibleRange(weeks: CalendarWeekRow[]): { rangeStart: Date; rangeEnd: Date } {
  const first = weeks[0].days[0].date;
  const last = weeks[weeks.length - 1].days[6].date;
  return { rangeStart: first, rangeEnd: endOfDay(last) };
}

export function dayIndexInWeek(day: Date, weekStart: Date): number {
  return Math.round((startOfDay(day).getTime() - weekStart.getTime()) / MS_PER_DAY);
}

export function getDayRange(anchorDate: Date): { rangeStart: Date; rangeEnd: Date } {
  const day = startOfDay(anchorDate);
  return { rangeStart: day, rangeEnd: endOfDay(day) };
}

export function eventIntersectsDay(eventStart: Date, eventEnd: Date, day: Date): boolean {
  const { rangeStart, rangeEnd } = getDayRange(day);
  return eventEnd.getTime() >= rangeStart.getTime() && eventStart.getTime() <= rangeEnd.getTime();
}

export function formatPeriodTitle(
  anchorDate: Date,
  viewMode: CalendarViewMode,
  locale: string,
): string {
  if (viewMode === "month") {
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(anchorDate);
  }
  if (viewMode === "day") {
    return new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(anchorDate);
  }
  const weekStart = getWeekStart(anchorDate);
  const weekEnd = addDays(weekStart, 6);
  const fmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const startStr = new Intl.DateTimeFormat(locale, fmt).format(weekStart);
  const endFmt: Intl.DateTimeFormatOptions =
    weekStart.getFullYear() === weekEnd.getFullYear()
      ? weekEnd.getMonth() === weekStart.getMonth()
        ? { day: "numeric" }
        : { day: "numeric", month: "short" }
      : { day: "numeric", month: "short", year: "numeric" };
  const endStr = new Intl.DateTimeFormat(locale, endFmt).format(weekEnd);
  const yearSuffix =
    weekStart.getFullYear() === weekEnd.getFullYear() ? ` ${weekStart.getFullYear()}` : "";
  return `${startStr} – ${endStr}${yearSuffix}`;
}

export function shiftAnchorDate(
  anchorDate: Date,
  viewMode: CalendarViewMode,
  direction: -1 | 1,
): Date {
  const d = new Date(anchorDate);
  if (viewMode === "month") {
    d.setMonth(d.getMonth() + direction);
  } else if (viewMode === "week") {
    d.setDate(d.getDate() + direction * 7);
  } else {
    d.setDate(d.getDate() + direction);
  }
  return d;
}
