export type CalendarEventKind = "workOrder";

export type CalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  start: Date;
  end: Date;
  laneKey?: string;
  meta?: Record<string, unknown>;
};

export type CalendarViewMode = "month" | "week" | "day";

/** Monday = 1 */
export type WeekStartsOn = 0 | 1;

export const DEFAULT_WEEK_STARTS_ON: WeekStartsOn = 1;

export const CALENDAR_LANE_HEIGHT_PX = 22;
export const CALENDAR_LANE_GAP_PX = 2;
export const CALENDAR_DAY_HEADER_PX = 28;

/** Visible event bar rows per week in month view (lanes 0 … 4). */
export const CALENDAR_MONTH_MAX_EVENT_LANES = 5;
/** Reserved row index for the month overflow hint (6th row). */
export const CALENDAR_MONTH_OVERFLOW_LANE_INDEX = 5;
