import { endOfDay, startOfDay } from "./calendarDates";
import type { CalendarEvent, CalendarEventKind } from "./calendarTypes";
import { CALENDAR_LANE_GAP_PX, CALENDAR_LANE_HEIGHT_PX } from "./calendarTypes";

export const DAY_TIMELINE_MINUTES = 24 * 60;
export const DAY_TIMELINE_TRACK_MIN_WIDTH_PX = 48 * 60;

export type CalendarTimelineSegment = {
  eventId: string;
  kind: CalendarEventKind;
  title: string;
  startMinute: number;
  endMinute: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  laneIndex: number;
  orderType?: string;
  siteColorHex?: string;
  meta?: Record<string, unknown>;
};

type SegmentDraft = Omit<CalendarTimelineSegment, "laneIndex">;

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function minutesFromDayStart(instant: Date, dayStart: Date): number {
  return Math.max(0, Math.min(DAY_TIMELINE_MINUTES, (instant.getTime() - dayStart.getTime()) / 60_000));
}

export function layoutDayTimelineEvents(
  events: CalendarEvent[],
  day: Date,
): CalendarTimelineSegment[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();

  const drafts: SegmentDraft[] = [];

  for (const ev of events) {
    const startMs = ev.start.getTime();
    const endMs = ev.end.getTime();
    if (endMs < dayStartMs || startMs > dayEndMs) continue;

    const visibleStartMs = Math.max(startMs, dayStartMs);
    const visibleEndMs = Math.min(endMs, dayEndMs);
    const startMinute = minutesFromDayStart(new Date(visibleStartMs), dayStart);
    const endMinute = Math.max(startMinute + 1, minutesFromDayStart(new Date(visibleEndMs), dayStart));

    const meta = ev.meta ?? {};
    drafts.push({
      eventId: ev.id,
      kind: ev.kind,
      title: ev.title,
      continuesBefore: startMs < dayStartMs,
      continuesAfter: endMs > dayEndMs,
      startMinute,
      endMinute,
      orderType: typeof meta.orderType === "string" ? meta.orderType : undefined,
      siteColorHex: typeof meta.siteColorHex === "string" ? meta.siteColorHex : undefined,
      meta,
    });
  }

  const sorted = [...drafts].sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      b.endMinute - b.startMinute - (a.endMinute - a.startMinute) ||
      a.title.localeCompare(b.title),
  );

  const lanes: { start: number; end: number }[][] = [];
  const result: CalendarTimelineSegment[] = [];

  for (const seg of sorted) {
    let laneIndex = 0;
    while (true) {
      if (!lanes[laneIndex]) lanes[laneIndex] = [];
      const conflict = lanes[laneIndex].some((o) =>
        rangesOverlap(seg.startMinute, seg.endMinute, o.start, o.end),
      );
      if (!conflict) {
        lanes[laneIndex].push({ start: seg.startMinute, end: seg.endMinute });
        result.push({ ...seg, laneIndex });
        break;
      }
      laneIndex++;
    }
  }

  return result;
}

export function timelineTrackHeight(maxLaneIndex: number): number {
  const laneCount = maxLaneIndex + 1;
  if (laneCount <= 0) return CALENDAR_LANE_HEIGHT_PX + 8;
  return (
    laneCount * CALENDAR_LANE_HEIGHT_PX +
    Math.max(0, laneCount - 1) * CALENDAR_LANE_GAP_PX +
    8
  );
}

export function maxTimelineLaneIndex(segments: CalendarTimelineSegment[]): number {
  if (segments.length === 0) return -1;
  return Math.max(...segments.map((s) => s.laneIndex));
}

export function timelineSegmentStyle(segment: CalendarTimelineSegment): {
  left: string;
  width: string;
  top: number;
} {
  const leftPct = (segment.startMinute / DAY_TIMELINE_MINUTES) * 100;
  const widthPct = ((segment.endMinute - segment.startMinute) / DAY_TIMELINE_MINUTES) * 100;
  return {
    left: `${leftPct}%`,
    width: `${Math.max(widthPct, 100 / DAY_TIMELINE_MINUTES)}%`,
    top: segment.laneIndex * (CALENDAR_LANE_HEIGHT_PX + CALENDAR_LANE_GAP_PX),
  };
}
