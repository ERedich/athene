import type { ShiftAssignment, ShiftCalendarBlock } from "./shiftCalendarTypes";

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

  return blocks.map((block) => ({
    ...block,
    assignments: (byBlockKey.get(`${block.shiftId}:${block.date}`) ?? []).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName),
    ),
  }));
}

export function buildBlocksWithAssignments(
  blocks: Omit<ShiftCalendarBlock, "assignments">[],
  assignments: ShiftAssignment[],
): ShiftCalendarBlock[] {
  return attachAssignmentsToBlocks(blocks, assignments);
}
