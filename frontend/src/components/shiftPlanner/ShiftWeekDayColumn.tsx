import type { ShiftCalendarBlock } from "../../lib/shiftPlanner/shiftCalendarTypes";
import {
  COMPACT_BLOCK_HEIGHT_PX,
  DAY_TRACK_HEIGHT_PX,
  shiftBlockPositionStyle,
} from "../../lib/shiftPlanner/shiftDayTimelineLayout";
import type { ShiftPlannerViewMode } from "../../lib/shiftPlanner/shiftPlannerViewMode";
import { ShiftBlockBar } from "./ShiftBlockBar";
import { ShiftDayNowMarker } from "./ShiftDayNowMarker";

type Props = {
  isoDate: string;
  dayLabel: string;
  dateLabel: string;
  isToday: boolean;
  isSelectedDay?: boolean;
  viewMode: ShiftPlannerViewMode;
  blocks: ShiftCalendarBlock[];
  draggingEmployeeId?: string | null;
  removingBlockId?: string | null;
  removingAssignmentId?: string | null;
  onRemoveBlock?: (block: ShiftCalendarBlock) => void;
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
  onAssignedEmployeeDragStart?: (employeeId: string, block: ShiftCalendarBlock) => void;
  onAssignedEmployeeDragEnd?: () => void;
};

export function ShiftWeekDayColumn({
  isoDate,
  dayLabel,
  dateLabel,
  isToday,
  isSelectedDay = false,
  viewMode,
  blocks,
  draggingEmployeeId,
  removingBlockId,
  removingAssignmentId,
  onRemoveBlock,
  onAssignEmployee,
  onRequestRollout,
  onUnassignEmployee,
  selectedBlockId,
  onSelectBlock,
  onOpenInfo,
  onAssignedEmployeeDragStart,
  onAssignedEmployeeDragEnd,
}: Props) {
  const isSimple = viewMode === "simple";

  return (
    <div
      className={`app-shift-planner-day-col${isToday ? " app-shift-planner-day-col--today" : ""}${isSelectedDay ? " app-shift-planner-day-col--selected" : ""}${isSimple ? " app-shift-planner-day-col--simple" : ""}`}
      role="gridcell"
      aria-label={`${dayLabel} ${dateLabel}`}
      data-date={isoDate}
    >
      {isSimple ? (
        <div className="app-shift-planner-day-shifts">
          {blocks.map((block) => (
            <ShiftBlockBar
              key={block.id}
              block={block}
              layoutMode="stacked"
              draggingEmployeeId={draggingEmployeeId}
              removing={removingBlockId === block.id}
              removingAssignmentId={removingAssignmentId}
              onRemove={onRemoveBlock}
              onAssignEmployee={onAssignEmployee}
              onUnassignEmployee={onUnassignEmployee}
              selectedBlockId={selectedBlockId}
              onSelectBlock={onSelectBlock}
              onOpenInfo={onOpenInfo}
              onAssignedEmployeeDragStart={onAssignedEmployeeDragStart}
              onAssignedEmployeeDragEnd={onAssignedEmployeeDragEnd}
            />
          ))}
        </div>
      ) : (
        <div
          className="app-shift-planner-day-track"
          style={{ height: DAY_TRACK_HEIGHT_PX }}
        >
          <div className="app-shift-planner-day-hour-grid" aria-hidden>
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="app-shift-planner-day-hour-grid__line" />
            ))}
          </div>
          {isToday ? <ShiftDayNowMarker /> : null}
          <div className="app-shift-planner-day-blocks">
            {blocks.map((block) => {
              const positionStyle = shiftBlockPositionStyle(block.startTime, block.endTime);
              const isMorningSegment = block.segmentKind === "morning";
              return (
                <ShiftBlockBar
                  key={block.id}
                  block={block}
                  layoutMode="timeline"
                  positionStyle={positionStyle}
                  compact={positionStyle.heightPx < COMPACT_BLOCK_HEIGHT_PX}
                  draggingEmployeeId={draggingEmployeeId}
                  removing={removingBlockId === block.id}
                  removingAssignmentId={removingAssignmentId}
                  onRemove={isMorningSegment ? undefined : onRemoveBlock}
                  onRequestRollout={onRequestRollout}
                  onUnassignEmployee={onUnassignEmployee}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={onSelectBlock}
                  onOpenInfo={onOpenInfo}
                  onAssignedEmployeeDragStart={onAssignedEmployeeDragStart}
                  onAssignedEmployeeDragEnd={onAssignedEmployeeDragEnd}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
