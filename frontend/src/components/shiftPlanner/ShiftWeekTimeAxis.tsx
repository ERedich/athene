import { DAY_TRACK_HEIGHT_PX } from "../../lib/shiftPlanner/shiftDayTimelineLayout";

const AXIS_HOURS = [0, 6, 12, 18] as const;

export function ShiftWeekTimeAxis() {
  return (
    <div
      className="app-shift-planner-time-axis"
      style={{ height: DAY_TRACK_HEIGHT_PX }}
      aria-hidden
    >
      <div className="app-shift-planner-time-axis__track">
        {AXIS_HOURS.map((hour) => (
          <span
            key={hour}
            className="app-shift-planner-time-axis__label"
            style={{ top: `${(hour / 24) * 100}%` }}
          >
            {hour}
          </span>
        ))}
      </div>
    </div>
  );
}
