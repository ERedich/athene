import { useEffect, useState } from "react";

import { currentTimeTrackTopPx } from "../../lib/shiftPlanner/shiftDayTimelineLayout";

const UPDATE_MS = 60_000;

export function ShiftDayNowMarker() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, UPDATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="app-shift-planner-day-now"
      style={{ top: currentTimeTrackTopPx(now) }}
      aria-hidden
    />
  );
}
