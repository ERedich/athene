import { useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { APP_PARAM_KEY_WO_MODAL_VIEW } from "./appParameterKeys";

const WORK_ORDER_FULLSCREEN_ROUTE_SEGMENTS = new Set(["workorders", "monitoring"]);

/** Routes where GN-WOMD can switch between modal and full-page work order view. */
export function isWorkOrderFullscreenRoute(pathname: string): boolean {
  const seg = pathname.replace(/\/+$/, "").split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  return WORK_ORDER_FULLSCREEN_ROUTE_SEGMENTS.has(seg);
}

/** GN-WOMD: when true, work orders open in a modal on eligible routes. Default true when unset. */
export function useWorkOrderModalViewEnabled(): boolean {
  const { appParameterBooleans } = useAuth();
  return appParameterBooleans[APP_PARAM_KEY_WO_MODAL_VIEW] !== false;
}

/** Modal on eligible routes only when GN-WOMD is enabled; always modal elsewhere. */
export function useWorkOrderUsesModalPresentation(): boolean {
  const { pathname } = useLocation();
  const modalViewEnabled = useWorkOrderModalViewEnabled();
  if (!isWorkOrderFullscreenRoute(pathname)) return true;
  return modalViewEnabled;
}
