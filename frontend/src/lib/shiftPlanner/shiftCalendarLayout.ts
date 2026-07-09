import type { ShiftCalendarBlock } from "./shiftCalendarTypes";
import { timeToMinutes } from "./shiftDayTimelineLayout";

export function groupShiftsByDate(
  blocks: ShiftCalendarBlock[],
): Map<string, ShiftCalendarBlock[]> {
  const byDate = new Map<string, ShiftCalendarBlock[]>();
  for (const block of blocks) {
    const list = byDate.get(block.date) ?? [];
    list.push(block);
    byDate.set(block.date, list);
  }

  for (const [date, dayBlocks] of byDate) {
    dayBlocks.sort(
      (a, b) =>
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime) ||
        a.shiftName.localeCompare(b.shiftName),
    );
    byDate.set(date, dayBlocks);
  }

  return byDate;
}

export function normalizeColorHex(colorHex: string): string {
  const raw = colorHex.trim();
  return raw.startsWith("#") ? raw : `#${raw}`;
}

export function contrastTextOnBackground(colorHex: string): string {
  const raw = normalizeColorHex(colorHex);
  const match = /^#([0-9a-fA-F]{6})$/.exec(raw);
  if (!match) return "#ffffff";
  const hex = match[1];
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#0f1419" : "#ffffff";
}
