import { formatIsoDate } from "../calendar/calendarDates";
import type { ShiftCalendarBlock } from "./shiftCalendarTypes";

export const DAY_MINUTES = 24 * 60;
export const DAY_TRACK_HEIGHT_PX = 48 * 24;
export const MIN_BLOCK_HEIGHT_PX = 28;
export const COMPACT_BLOCK_HEIGHT_PX = 52;

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatIsoDate(d);
}

export function timeToMinutes(time: string): number {
  if (time === "24:00") return DAY_MINUTES;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function shiftBlockPositionStyle(
  startTime: string,
  endTime: string,
): { topPx: number; heightPx: number } {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const topPx = (startMin / DAY_MINUTES) * DAY_TRACK_HEIGHT_PX;
  const heightPx = Math.max(
    ((endMin - startMin) / DAY_MINUTES) * DAY_TRACK_HEIGHT_PX,
    MIN_BLOCK_HEIGHT_PX,
  );
  return { topPx, heightPx };
}

export function currentTimeTrackTopPx(date: Date): number {
  const minutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  return (minutes / DAY_MINUTES) * DAY_TRACK_HEIGHT_PX;
}

function isOvernightShift(startTime: string, endTime: string): boolean {
  return timeToMinutes(endTime) <= timeToMinutes(startTime);
}

export function splitOvernightSegments(
  blocks: ShiftCalendarBlock[],
  weekStartIso: string,
): ShiftCalendarBlock[] {
  const weekEndIso = addDaysIso(weekStartIso, 6);
  const result: ShiftCalendarBlock[] = [];

  for (const block of blocks) {
    if (!isOvernightShift(block.startTime, block.endTime)) {
      result.push({
        ...block,
        segmentKind: "full",
        continuesBefore: false,
        continuesAfter: false,
      });
      continue;
    }

    result.push({
      ...block,
      endTime: "24:00",
      segmentKind: "evening",
      continuesBefore: false,
      continuesAfter: true,
    });

    const nextDate = addDaysIso(block.date, 1);
    if (nextDate <= weekEndIso) {
      result.push({
        ...block,
        id: `${block.shiftId}:${nextDate}:morning`,
        date: nextDate,
        startTime: "00:00",
        endTime: block.endTime,
        segmentKind: "morning",
        continuesBefore: true,
        continuesAfter: false,
        assignments: [],
      });
    }
  }

  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
      a.shiftName.localeCompare(b.shiftName),
  );
}
