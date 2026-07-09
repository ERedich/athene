import { addDaysIso } from "./shiftCalendarExpand";
import type { ShiftCalendarBlock } from "./shiftCalendarTypes";

export function assignmentDateForBlock(
  block: Pick<ShiftCalendarBlock, "date" | "segmentKind">,
): string {
  if (block.segmentKind === "morning") {
    return addDaysIso(block.date, -1);
  }
  return block.date;
}

export function shiftBlockQueryParams(block: ShiftCalendarBlock): string {
  const params = new URLSearchParams();
  params.set("shiftId", block.shiftId);
  params.set("date", block.date);
  if (block.segmentKind) {
    params.set("segmentKind", block.segmentKind);
  }
  return params.toString();
}
