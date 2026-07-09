import type { ShiftAssignment, ShiftCalendarBlock } from "./shiftCalendarTypes";
import { addDaysIso } from "./shiftCalendarExpand";

function assignmentDateForBlock(block: Pick<ShiftCalendarBlock, "date" | "shiftId" | "segmentKind">): string {
  if (block.segmentKind === "morning") {
    return addDaysIso(block.date, -1);
  }
  return block.date;
}

export function attachAssignmentsToBlocks(
  blocks: Omit<ShiftCalendarBlock, "assignments">[],
  assignments: ShiftAssignment[],
): ShiftCalendarBlock[] {
  const byBlockKey = new Map<string, ShiftAssignment[]>();

  for (const assignment of assignments) {
    const key = `${assignment.shiftId}:${assignment.assignmentDate}`;
    const list = byBlockKey.get(key) ?? [];
    list.push(assignment);
    byBlockKey.set(key, list);
  }

  return blocks.map((block) => {
    const assignmentDate = assignmentDateForBlock(block);
    return {
      ...block,
      assignments: (byBlockKey.get(`${block.shiftId}:${assignmentDate}`) ?? []).sort((a, b) =>
        a.employeeName.localeCompare(b.employeeName),
      ),
    };
  });
}

export function buildBlocksWithAssignments(
  blocks: Omit<ShiftCalendarBlock, "assignments">[],
  assignments: ShiftAssignment[],
): ShiftCalendarBlock[] {
  return attachAssignmentsToBlocks(blocks, assignments);
}
