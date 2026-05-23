import { addDays, dayIndexInWeek, endOfDay } from "./calendarDates";
import type { CalendarEvent, CalendarEventKind } from "./calendarTypes";
import {
  CALENDAR_DAY_HEADER_PX,
  CALENDAR_LANE_GAP_PX,
  CALENDAR_LANE_HEIGHT_PX,
  CALENDAR_MONTH_OVERFLOW_LANE_INDEX,
} from "./calendarTypes";

export type CalendarEventSegment = {
  eventId: string;
  kind: CalendarEventKind;
  title: string;
  colStart: number;
  colSpan: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  laneIndex: number;
  orderType?: string;
  siteColorHex?: string;
  meta?: Record<string, unknown>;
};

export type WeekEventsLayoutResult = {
  segments: CalendarEventSegment[];
  overflowCount: number;
};

type SegmentDraft = Omit<CalendarEventSegment, "laneIndex">;

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function layoutWeekEvents(
  events: CalendarEvent[],
  weekStart: Date,
  maxEventLanes?: number,
): WeekEventsLayoutResult {
  const weekEnd = endOfDay(addDays(weekStart, 6));
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime();

  const drafts: SegmentDraft[] = [];

  for (const ev of events) {
    const startMs = ev.start.getTime();
    const endMs = ev.end.getTime();
    if (endMs < weekStartMs || startMs > weekEndMs) continue;

    const visibleStart = new Date(Math.max(startMs, weekStartMs));
    const visibleEnd = new Date(Math.min(endMs, weekEndMs));
    const colStart = dayIndexInWeek(visibleStart, weekStart);
    const colEnd = dayIndexInWeek(visibleEnd, weekStart);
    const colSpan = Math.max(1, colEnd - colStart + 1);

    const meta = ev.meta ?? {};
    drafts.push({
      eventId: ev.id,
      kind: ev.kind,
      title: ev.title,
      colStart,
      colSpan,
      continuesBefore: startMs < weekStartMs,
      continuesAfter: endMs > weekEndMs,
      orderType: typeof meta.orderType === "string" ? meta.orderType : undefined,
      siteColorHex: typeof meta.siteColorHex === "string" ? meta.siteColorHex : undefined,
      meta,
    });
  }

  const sorted = [...drafts].sort(
    (a, b) => a.colStart - b.colStart || b.colSpan - a.colSpan || a.title.localeCompare(b.title),
  );

  const lanes: { start: number; end: number }[][] = [];
  const segments: CalendarEventSegment[] = [];
  let overflowCount = 0;

  const laneLimit = maxEventLanes ?? Number.POSITIVE_INFINITY;

  for (const seg of sorted) {
    const segEnd = seg.colStart + seg.colSpan;
    let laneIndex = 0;
    let placed = false;
    while (laneIndex < laneLimit) {
      if (!lanes[laneIndex]) lanes[laneIndex] = [];
      const conflict = lanes[laneIndex].some((o) =>
        rangesOverlap(seg.colStart, segEnd, o.start, o.end),
      );
      if (!conflict) {
        lanes[laneIndex].push({ start: seg.colStart, end: segEnd });
        segments.push({ ...seg, laneIndex });
        placed = true;
        break;
      }
      laneIndex++;
    }
    if (!placed) overflowCount++;
  }

  return { segments, overflowCount };
}

export function weekRowContentHeight(
  maxLaneIndex: number,
  options?: { showOverflowRow?: boolean },
): number {
  let laneCount = maxLaneIndex + 1;
  if (options?.showOverflowRow) {
    laneCount = Math.max(laneCount, CALENDAR_MONTH_OVERFLOW_LANE_INDEX + 1);
  }
  if (laneCount <= 0) return CALENDAR_DAY_HEADER_PX + 8;
  return (
    CALENDAR_DAY_HEADER_PX +
    laneCount * CALENDAR_LANE_HEIGHT_PX +
    Math.max(0, laneCount - 1) * CALENDAR_LANE_GAP_PX +
    8
  );
}

export function laneTopPx(laneIndex: number): number {
  return CALENDAR_DAY_HEADER_PX + laneIndex * (CALENDAR_LANE_HEIGHT_PX + CALENDAR_LANE_GAP_PX);
}

/** Horizontal inset between day columns (must match CSS; margins would overflow on column 7). */
const EVENT_BAR_COLUMN_GAP_PX = 1;

export function segmentBarStyle(segment: CalendarEventSegment): {
  left: string;
  width: string;
  top: number;
} {
  const leftPct = (segment.colStart / 7) * 100;
  const widthPct = (segment.colSpan / 7) * 100;
  const padL = segment.continuesBefore ? 0 : EVENT_BAR_COLUMN_GAP_PX;
  const padR = segment.continuesAfter ? 0 : EVENT_BAR_COLUMN_GAP_PX;
  return {
    left: `calc(${leftPct}% + ${padL}px)`,
    width: `calc(${widthPct}% - ${padL + padR}px)`,
    top: laneTopPx(segment.laneIndex),
  };
}

export function maxLaneIndexForWeek(segments: CalendarEventSegment[]): number {
  if (segments.length === 0) return -1;
  return Math.max(...segments.map((s) => s.laneIndex));
}
