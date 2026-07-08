import { formatIsoDate } from "../calendar/calendarDates";
import { apiFetch } from "../api";
import type { ShiftCalendarBlock, ShiftMasterRow, ShiftWeekdayKey } from "./shiftCalendarTypes";
import { JS_DAY_TO_WEEKDAY_KEY, SHIFT_WEEKDAY_KEYS } from "./shiftCalendarTypes";

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatIsoDate(d);
}

export function weekdayKeyForDate(isoDate: string): ShiftWeekdayKey {
  const d = new Date(`${isoDate}T12:00:00`);
  return JS_DAY_TO_WEEKDAY_KEY[d.getDay()]! as ShiftWeekdayKey;
}

function normalizeTimeToHm(value: string): string {
  const parts = value.split(":");
  return `${parts[0]}:${parts[1]}`;
}

export function formatShiftTimeRange(startTime: string, endTime: string): string {
  return `${startTime} – ${endTime}`;
}

export function expandShiftsForWeek(
  shifts: ShiftMasterRow[],
  weekStartIso: string,
): ShiftCalendarBlock[] {
  const blocks: ShiftCalendarBlock[] = [];

  for (const shift of shifts) {
    if (!shift.isActive) continue;

    for (let i = 0; i < 7; i++) {
      const date = addDaysIso(weekStartIso, i);
      const weekdayKey = weekdayKeyForDate(date);
      if (!shift.weekdays.includes(weekdayKey)) continue;

      let startTime = normalizeTimeToHm(shift.startTime);
      let endTime = normalizeTimeToHm(shift.endTime);
      if (endTime <= startTime) {
        endTime = "24:00";
      }

      blocks.push({
        id: `${shift.id}:${date}`,
        date,
        shiftId: shift.id,
        shiftKey: shift.key,
        shiftName: shift.name,
        shortCode: shift.shortCode,
        colorHex: shift.colorHex,
        startTime,
        endTime,
        assignments: [],
      });
    }
  }

  blocks.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.shiftName.localeCompare(b.shiftName),
  );

  return blocks;
}

function buildShiftUpdatePayload(shift: ShiftMasterRow, weekdays: ShiftWeekdayKey[]) {
  const breakHours =
    typeof shift.breakHours === "number"
      ? shift.breakHours
      : Number.parseFloat(String(shift.breakHours)) || 0;

  return {
    key: shift.key,
    name: shift.name,
    siteId: shift.siteId,
    shortCode: shift.shortCode,
    colorHex: shift.colorHex,
    startTime: normalizeTimeToHm(shift.startTime),
    endTime: normalizeTimeToHm(shift.endTime),
    breakHours,
    weekdays,
    isActive: shift.isActive,
  };
}

async function saveShiftWeekdays(
  shift: ShiftMasterRow,
  weekdays: ShiftWeekdayKey[],
): Promise<boolean> {
  const res = await apiFetch(`/api/shifts/${shift.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildShiftUpdatePayload(shift, weekdays)),
  });
  return res.ok;
}

export function getShiftsAvailableForWeekday(
  shifts: ShiftMasterRow[],
  weekdayKey: ShiftWeekdayKey,
): ShiftMasterRow[] {
  return shifts
    .filter((shift) => shift.isActive && !shift.weekdays.includes(weekdayKey))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addShiftToWeekday(
  shift: ShiftMasterRow,
  weekdayKey: ShiftWeekdayKey,
): Promise<{ ok: true } | { ok: false; error: "save_failed" }> {
  const newWeekdays = [...shift.weekdays, weekdayKey].sort(
    (a, b) =>
      SHIFT_WEEKDAY_KEYS.indexOf(a as ShiftWeekdayKey) -
      SHIFT_WEEKDAY_KEYS.indexOf(b as ShiftWeekdayKey),
  );

  const saved = await saveShiftWeekdays(shift, newWeekdays);
  if (!saved) {
    return { ok: false, error: "save_failed" };
  }
  return { ok: true };
}

export async function removeShiftFromWeekday(
  shift: ShiftMasterRow,
  weekdayKey: ShiftWeekdayKey,
): Promise<{ ok: true } | { ok: false; error: "last_weekday" | "save_failed" }> {
  const newWeekdays = shift.weekdays.filter((w) => w !== weekdayKey);
  if (newWeekdays.length === 0) {
    return { ok: false, error: "last_weekday" };
  }

  const saved = await saveShiftWeekdays(shift, newWeekdays);
  if (!saved) {
    return { ok: false, error: "save_failed" };
  }

  return { ok: true };
}

export { addDaysIso };
