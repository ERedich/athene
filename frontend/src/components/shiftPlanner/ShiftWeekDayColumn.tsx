import type { ShiftCalendarBlock, ShiftMasterRow } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { ShiftAddBlock } from "./ShiftAddBlock";
import { ShiftBlockBar } from "./ShiftBlockBar";

type Props = {
  isoDate: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  blocks: ShiftCalendarBlock[];
  availableShifts: ShiftMasterRow[];
  draggingEmployeeId?: string | null;
  removingBlockId?: string | null;
  removingAssignmentId?: string | null;
  addingShiftId?: string | null;
  onRemoveBlock?: (block: ShiftCalendarBlock) => void;
  onAddShift?: (shift: ShiftMasterRow, isoDate: string) => void;
  onAssignEmployee?: (block: ShiftCalendarBlock, employeeId: string) => void;
  onUnassignEmployee?: (block: ShiftCalendarBlock, assignmentId: string) => void;
};

export function ShiftWeekDayColumn({
  isoDate,
  dayLabel,
  dateLabel,
  isToday,
  blocks,
  availableShifts,
  draggingEmployeeId,
  removingBlockId,
  removingAssignmentId,
  addingShiftId,
  onRemoveBlock,
  onAddShift,
  onAssignEmployee,
  onUnassignEmployee,
}: Props) {
  return (
    <div
      className={`app-shift-planner-day-col${isToday ? " app-shift-planner-day-col--today" : ""}`}
      role="gridcell"
      aria-label={`${dayLabel} ${dateLabel}`}
      data-date={isoDate}
    >
      <div className="app-shift-planner-day-shifts">
        {blocks.map((block) => (
          <ShiftBlockBar
            key={block.id}
            block={block}
            draggingEmployeeId={draggingEmployeeId}
            removing={removingBlockId === block.id}
            removingAssignmentId={removingAssignmentId}
            onRemove={onRemoveBlock}
            onAssignEmployee={onAssignEmployee}
            onUnassignEmployee={onUnassignEmployee}
          />
        ))}
        {onAddShift ? (
          <ShiftAddBlock
            isoDate={isoDate}
            availableShifts={availableShifts}
            addingShiftId={addingShiftId}
            onAddShift={onAddShift}
          />
        ) : null}
      </div>
    </div>
  );
}
