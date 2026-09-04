import { useMemo, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { OverlayPanel } from "primereact/overlaypanel";

import { formatShiftTimeRange, addDaysIso } from "../../lib/shiftPlanner/shiftCalendarExpand";
import { contrastTextOnBackground, normalizeColorHex } from "../../lib/shiftPlanner/shiftCalendarLayout";
import {
  isShiftEmployeeDrag,
  readShiftEmployeeDragData,
  setShiftEmployeeDragData,
} from "../../lib/shiftPlanner/shiftPlannerDrag";
import { canAssignEmployeeOnDate } from "../../lib/shiftPlanner/shiftPlannerDates";
import type { ShiftCalendarBlock } from "../../lib/shiftPlanner/shiftCalendarTypes";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import { ShiftAssignedEmployee } from "./ShiftAssignedEmployee";

const MAX_VISIBLE_BLOCK_ASSIGNMENTS = 2;

type PositionStyle = {
  topPx: number;
  heightPx: number;
};

type Props = {
  block: ShiftCalendarBlock;
  layoutMode?: "timeline" | "stacked";
  positionStyle?: PositionStyle;
  compact?: boolean;
  draggingEmployeeId?: string | null;
  removing?: boolean;
  removingAssignmentId?: string | null;
  onRemove?: (block: ShiftCalendarBlock) => void;
  onAssignEmployee?: (block: ShiftCalendarBlock, employeeId: string) => void;
  onRequestRollout?: (
    block: ShiftCalendarBlock,
    employeeId: string,
    event: React.SyntheticEvent,
  ) => void;
  onUnassignEmployee?: (block: ShiftCalendarBlock, assignmentId: string) => void;
  selectedBlockId?: string | null;
  onSelectBlock?: (block: ShiftCalendarBlock) => void;
  onOpenInfo?: (block: ShiftCalendarBlock) => void;
  onOpenShiftOverview?: (block: ShiftCalendarBlock, event: React.MouseEvent) => void;
  onAssignedEmployeeDragStart?: (employeeId: string, block: ShiftCalendarBlock) => void;
  onAssignedEmployeeDragEnd?: () => void;
};

export function ShiftBlockBar({
  block,
  layoutMode = "timeline",
  positionStyle,
  compact = false,
  draggingEmployeeId,
  removing = false,
  removingAssignmentId,
  onRemove,
  onAssignEmployee,
  onRequestRollout,
  onUnassignEmployee,
  selectedBlockId,
  onSelectBlock,
  onOpenInfo,
  onOpenShiftOverview,
  onAssignedEmployeeDragStart,
  onAssignedEmployeeDragEnd,
}: Props) {
  const { t, i18n } = useTranslation();
  const panelRef = useRef<OverlayPanel>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [isDropDenied, setIsDropDenied] = useState(false);
  const isStacked = layoutMode === "stacked";
  const textColor = contrastTextOnBackground(block.colorHex);
  const timeLabel = formatShiftTimeRange(block.startTime, block.endTime);
  const assignmentDate =
    block.segmentKind === "morning" ? addDaysIso(block.date, -1) : block.date;
  const assignmentAllowed = canAssignEmployeeOnDate(assignmentDate);
  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date(`${block.date}T12:00:00`)),
    [block.date, i18n.language],
  );
  const visibleAssignments = useMemo(
    () => block.assignments.slice(0, MAX_VISIBLE_BLOCK_ASSIGNMENTS),
    [block.assignments],
  );
  const hiddenAssignmentCount = Math.max(0, block.assignments.length - MAX_VISIBLE_BLOCK_ASSIGNMENTS);
  const isSelected = selectedBlockId === block.id;
  const continuesBefore = !isStacked && (block.continuesBefore ?? false);
  const continuesAfter = !isStacked && (block.continuesAfter ?? false);
  const radiusTop = continuesBefore ? "0" : "0.25rem";
  const radiusBottom = continuesAfter ? "0" : "0.25rem";
  const showDetails = isStacked || !compact;

  const handleMoreClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onSelectBlock?.(block);
    panelRef.current?.toggle(e);
  };

  const handleInfoClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onSelectBlock?.(block);
    onOpenInfo?.(block);
  };

  const handleBlockClick = (e: React.MouseEvent) => {
    if (draggingEmployeeId) return;
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      onOpenShiftOverview?.(block, e);
      return;
    }
    onSelectBlock?.(block);
  };

  const handleBlockContextMenu = (e: React.MouseEvent) => {
    // Ctrl+click on macOS can surface as contextmenu; treat as overview trigger.
    if (!(e.ctrlKey || e.metaKey)) return;
    if (draggingEmployeeId) return;
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.stopPropagation();
    onOpenShiftOverview?.(block, e);
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!onAssignEmployee && !onRequestRollout) return;
    if (!isShiftEmployeeDrag(e.dataTransfer, draggingEmployeeId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!assignmentAllowed) {
      setIsDropTarget(false);
      setIsDropDenied(true);
      return;
    }
    setIsDropDenied(false);
    setIsDropTarget(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDropTarget(false);
    setIsDropDenied(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropTarget(false);
    setIsDropDenied(false);
    if (!onAssignEmployee && !onRequestRollout) return;

    if (!assignmentAllowed) {
      const employeeId = readShiftEmployeeDragData(e.dataTransfer, draggingEmployeeId) ?? "";
      if (layoutMode === "timeline" && onRequestRollout && employeeId) {
        onRequestRollout(block, employeeId, e);
      } else if (employeeId) {
        onAssignEmployee?.(block, employeeId);
      }
      return;
    }

    const employeeId = readShiftEmployeeDragData(e.dataTransfer, draggingEmployeeId);
    if (!employeeId) return;

    if (layoutMode === "timeline" && onRequestRollout) {
      onRequestRollout(block, employeeId, e);
      return;
    }

    onAssignEmployee?.(block, employeeId);
  };

  const timelineStyle = positionStyle
    ? {
        top: positionStyle.topPx,
        height: positionStyle.heightPx,
        borderTopLeftRadius: radiusTop,
        borderTopRightRadius: radiusTop,
        borderBottomLeftRadius: radiusBottom,
        borderBottomRightRadius: radiusBottom,
      }
    : undefined;

  return (
    <>
      <div
        className={`app-shift-planner-block${isStacked ? " app-shift-planner-block--stacked" : ""}${!isStacked && compact ? " app-shift-planner-block--compact" : ""}${continuesBefore ? " app-shift-planner-block--continues-before" : ""}${continuesAfter ? " app-shift-planner-block--continues-after" : ""}${isSelected ? " app-shift-planner-block--selected" : ""}${isDropTarget ? " app-shift-planner-block--drop-target" : ""}${isDropDenied ? " app-shift-planner-block--drop-denied" : ""}`}
        style={{
          ...timelineStyle,
          ["--shift-block-bg" as string]: normalizeColorHex(block.colorHex),
          color: textColor,
        }}
        title={`${block.shiftName} · ${timeLabel}`}
        onClick={handleBlockClick}
        onContextMenu={handleBlockContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className="app-shift-planner-block__info"
          style={{ color: textColor }}
          aria-label={t("schichtplaner.shiftInfo", { name: block.shiftName })}
          title={t("schichtplaner.shiftInfo", { name: block.shiftName })}
          onClick={handleInfoClick}
        >
          <Info className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
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
        {showDetails ? (
          <>
            <span className="app-shift-planner-block__time">{timeLabel}</span>
            {block.assignments.length > 0 ? (
              <div className="app-shift-planner-block__assignments">
                {visibleAssignments.map((assignment) => (
                  <ShiftAssignedEmployee
                    key={assignment.id}
                    assignment={assignment}
                    removing={removingAssignmentId === assignment.id}
                    draggable={Boolean(onAssignedEmployeeDragStart)}
                    isDragging={draggingEmployeeId === assignment.employeeId}
                    onRemove={
                      onUnassignEmployee
                        ? (a) => onUnassignEmployee(block, a.id)
                        : undefined
                    }
                    onDragStart={
                      onAssignedEmployeeDragStart
                        ? (employeeId) => onAssignedEmployeeDragStart(employeeId, block)
                        : undefined
                    }
                    onDragEnd={onAssignedEmployeeDragEnd}
                  />
                ))}
                {hiddenAssignmentCount > 0 ? (
                  <button
                    type="button"
                    className="app-shift-planner-assigned-employee-more"
                    title={t("schichtplaner.openAssignedEmployees", {
                      shift: block.shiftName,
                      date: dateLabel,
                    })}
                    aria-label={t("schichtplaner.openAssignedEmployees", {
                      shift: block.shiftName,
                      date: dateLabel,
                    })}
                    onClick={handleMoreClick}
                  >
                    ...
                  </button>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <OverlayPanel
        ref={panelRef}
        appendTo={overlayAppendTo}
        className="app-shift-planner-assignments-panel"
      >
        <p className="app-shift-planner-assignments-panel__title">
          {t("schichtplaner.assignedEmployeesTitle")}
        </p>
        <p className="app-shift-planner-assignments-panel__meta">
          {t("schichtplaner.assignedEmployeesSubtitle", {
            shift: block.shiftName,
            time: timeLabel,
            date: dateLabel,
          })}
        </p>
        {block.assignments.length === 0 ? (
          <p className="app-shift-planner-assignments-panel__empty">
            {t("schichtplaner.assignedEmployeesEmpty")}
          </p>
        ) : (
          <ul className="app-shift-planner-assignments-panel__list">
            {block.assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="app-shift-planner-assignments-panel__item"
                draggable={Boolean(onAssignedEmployeeDragStart)}
                onDragStart={(e) => {
                  if (!onAssignedEmployeeDragStart) {
                    e.preventDefault();
                    return;
                  }
                  setShiftEmployeeDragData(e.dataTransfer, assignment.employeeId);
                  onAssignedEmployeeDragStart(assignment.employeeId, block);
                }}
                onDragEnd={() => onAssignedEmployeeDragEnd?.()}
              >
                <span className="app-shift-planner-assignments-panel__key">{assignment.employeeKey}</span>
                <span className="app-shift-planner-assignments-panel__name">{assignment.employeeName}</span>
              </li>
            ))}
          </ul>
        )}
      </OverlayPanel>
    </>
  );
}
