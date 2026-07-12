import { addDays, dayIndexInWeek, endOfDay, startOfDay } from "./calendarDates";
import type { CalendarEvent, CalendarEventKind } from "./calendarTypes";
import {
  CALENDAR_DAY_HEADER_PX,
  CALENDAR_LANE_GAP_PX,
  CALENDAR_LANE_HEIGHT_PX,
  CALENDAR_MONTH_OVERFLOW_LANE_INDEX,
} from "./calendarTypes";

const DAY_MINUTES = 24 * 60;

export type CalendarEventSegment = {
  eventId: string;
  kind: CalendarEventKind;
  title: string;
  colStart: number;
  colSpan: number;
  /** 0–1 position within the first visible day column (ignored when continuesBefore). */
  startDayFraction: number;
  /** 0–1 position within the last visible day column (ignored when continuesAfter). */
  endDayFraction: number;
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

function dayFraction(instant: Date, day: Date): number {
  const dayStart = startOfDay(day);
  const minutes = (instant.getTime() - dayStart.getTime()) / 60_000;
  return Math.max(0, Math.min(1, minutes / DAY_MINUTES));
}

type SegmentRangeInput = Pick<
  CalendarEventSegment,
  "colStart" | "colSpan" | "continuesBefore" | "continuesAfter" | "startDayFraction" | "endDayFraction"
>;

/** Half-open interval in week-day units (0 = week start midnight). */
export function segmentWeekRange(seg: SegmentRangeInput): { start: number; end: number } {
  const lastCol = seg.colStart + seg.colSpan - 1;
  return {
    start: seg.colStart + (seg.continuesBefore ? 0 : seg.startDayFraction),
    end: lastCol + (seg.continuesAfter ? 1 : seg.endDayFraction),
  };
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
    const continuesBefore = startMs < weekStartMs;
    const continuesAfter = endMs > weekEndMs;

    const meta = ev.meta ?? {};
    drafts.push({
      eventId: ev.id,
      kind: ev.kind,
      title: ev.title,
      colStart,
      colSpan,
      startDayFraction: continuesBefore ? 0 : dayFraction(visibleStart, visibleStart),
      endDayFraction: continuesAfter ? 1 : dayFraction(visibleEnd, visibleEnd),
      continuesBefore,
      continuesAfter,
      orderType: typeof meta.orderType === "string" ? meta.orderType : undefined,
      siteColorHex: typeof meta.siteColorHex === "string" ? meta.siteColorHex : undefined,
      meta,
    });
  }

  const sorted = [...drafts].sort((a, b) => {
    const aRange = segmentWeekRange(a);
    const bRange = segmentWeekRange(b);
    return (
      aRange.start - bRange.start ||
      bRange.end - bRange.start - (aRange.end - aRange.start) ||
      a.title.localeCompare(b.title)
    );
  });

  const lanes: { start: number; end: number }[][] = [];
  const segments: CalendarEventSegment[] = [];
  let overflowCount = 0;

  const laneLimit = maxEventLanes ?? Number.POSITIVE_INFINITY;

  for (const seg of sorted) {
    const segRange = segmentWeekRange(seg);
    let laneIndex = 0;
    let placed = false;
    while (laneIndex < laneLimit) {
      if (!lanes[laneIndex]) lanes[laneIndex] = [];
      const conflict = lanes[laneIndex].some((o) =>
        rangesOverlap(segRange.start, segRange.end, o.start, o.end),
      );
      if (!conflict) {
        lanes[laneIndex].push(segRange);
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
  const { start, end } = segmentWeekRange(segment);
  const leftPct = (start / 7) * 100;
  let widthPct = ((end - start) / 7) * 100;
  const minWidthPct = 100 / (7 * DAY_MINUTES);
  if (widthPct < minWidthPct) widthPct = minWidthPct;

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
