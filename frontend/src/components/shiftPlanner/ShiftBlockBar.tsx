import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatShiftTimeRange } from "../../lib/shiftPlanner/shiftCalendarExpand";
import { contrastTextOnBackground } from "../../lib/shiftPlanner/shiftCalendarLayout";
import {
  isShiftEmployeeDrag,
  readShiftEmployeeDragData,
} from "../../lib/shiftPlanner/shiftPlannerDrag";
import type { ShiftCalendarBlock } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { ShiftAssignedEmployee } from "./ShiftAssignedEmployee";

type Props = {
  block: ShiftCalendarBlock;
  draggingEmployeeId?: string | null;
  removing?: boolean;
  removingAssignmentId?: string | null;
  onRemove?: (block: ShiftCalendarBlock) => void;
  onAssignEmployee?: (block: ShiftCalendarBlock, employeeId: string) => void;
  onUnassignEmployee?: (block: ShiftCalendarBlock, assignmentId: string) => void;
};

export function ShiftBlockBar({
  block,
  draggingEmployeeId,
  removing = false,
  removingAssignmentId,
  onRemove,
  onAssignEmployee,
  onUnassignEmployee,
}: Props) {
  const { t } = useTranslation();
  const [isDropTarget, setIsDropTarget] = useState(false);
  const textColor = contrastTextOnBackground(block.colorHex);
  const timeLabel = formatShiftTimeRange(block.startTime, block.endTime);

  const handleDragOver = (e: React.DragEvent) => {
    if (!onAssignEmployee) return;
    if (!isShiftEmployeeDrag(e.dataTransfer, draggingEmployeeId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDropTarget(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDropTarget(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropTarget(false);
    if (!onAssignEmployee) return;
    const employeeId = readShiftEmployeeDragData(e.dataTransfer, draggingEmployeeId);
    if (!employeeId) return;
    onAssignEmployee(block, employeeId);
  };

  return (
    <div
      className={`app-shift-planner-block${isDropTarget ? " app-shift-planner-block--drop-target" : ""}`}
      style={{
        backgroundColor: block.colorHex,
        color: textColor,
      }}
      title={`${block.shiftName} · ${timeLabel}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {onRemove ? (
        <button
          type="button"
          className="app-shift-planner-block__remove"
          style={{ color: textColor }}
          aria-label={t("schichtplaner.removeShift", { name: block.shiftName })}
          title={t("schichtplaner.removeShift", { name: block.shiftName })}
          disabled={removing}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(block);
          }}
        >
          <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
      <span className="app-shift-planner-block__code">{block.shortCode}</span>
      <span className="app-shift-planner-block__time">{timeLabel}</span>
      {block.assignments.length > 0 ? (
        <div className="app-shift-planner-block__assignments">
          {block.assignments.map((assignment) => (
            <ShiftAssignedEmployee
              key={assignment.id}
              assignment={assignment}
              removing={removingAssignmentId === assignment.id}
              onRemove={
                onUnassignEmployee
                  ? (a) => onUnassignEmployee(block, a.id)
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
