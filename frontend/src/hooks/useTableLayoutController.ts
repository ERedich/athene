import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  fetchTableLayoutDefaults,
  fetchTableLayoutDetail,
  fetchTableLayouts,
  isSameLayoutId,
  type TableLayoutDefaults,
  type TableLayoutListItem,
} from "../lib/tableLayoutApi";
import {
  sanitizeMonitoringTableLayoutPayload,
  type TableLayoutPayloadV1,
} from "../lib/tableLayouts/tableLayoutPayload";

export type TableLayoutController = {
  layouts: TableLayoutListItem[];
  bootstrapDone: boolean;
  activeLayoutId: string | null;
  activePayload: TableLayoutPayloadV1 | null;
  activeLayoutName: string | null;
  /** User's monitoring default layout (`userTableLayoutDefault`). */
  monitoringDefaultLayoutId: string | null;
  layoutControlled: boolean;
  headerSelectionId: string | null;
  reloadLayouts: () => Promise<void>;
  applyLayoutById: (layoutId: string | null) => Promise<void>;
  setActiveFromDetail: (id: string, name: string, payload: TableLayoutPayloadV1) => void;
};

export function useTableLayoutController(tableKey: string): TableLayoutController {
  const [layouts, setLayouts] = useState<TableLayoutListItem[]>([]);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [activeLayoutId, setActiveLayoutId] = useState<string | null>(null);
  const [activePayload, setActivePayload] = useState<TableLayoutPayloadV1 | null>(null);
  const [activeLayoutName, setActiveLayoutName] = useState<string | null>(null);
  const [monitoringDefaultLayoutId, setMonitoringDefaultLayoutId] = useState<string | null>(null);
  const defaultsRef = useRef<TableLayoutDefaults>({ monitoringLayoutId: null });

  const reloadLayouts = useCallback(async () => {
    const [rows, defaults] = await Promise.all([fetchTableLayouts(tableKey), fetchTableLayoutDefaults()]);
    defaultsRef.current = defaults;
    setMonitoringDefaultLayoutId(defaults.monitoringLayoutId);
    setLayouts(rows);
    return;
  }, [tableKey]);

  const setActiveFromDetail = useCallback((id: string, name: string, payload: TableLayoutPayloadV1) => {
    setActiveLayoutId(id);
    setActiveLayoutName(name);
    setActivePayload(sanitizeMonitoringTableLayoutPayload(payload));
  }, []);

  const applyLayoutById = useCallback(
    async (layoutId: string | null) => {
      if (!layoutId) {
        setActiveLayoutId(null);
        setActiveLayoutName(null);
        setActivePayload(null);
        return;
      }
      const d = await fetchTableLayoutDetail(layoutId);
      setActiveFromDetail(d.id, d.name, d.payload);
    },
    [setActiveFromDetail],
  );

  const bootstrap = useCallback(async () => {
    try {
      const [rows, defaults] = await Promise.all([fetchTableLayouts(tableKey), fetchTableLayoutDefaults()]);
      defaultsRef.current = defaults;
      setMonitoringDefaultLayoutId(defaults.monitoringLayoutId);
      setLayouts(rows);
      const defaultId = defaults.monitoringLayoutId;
      const match = defaultId ? rows.find((l) => isSameLayoutId(l.id, defaultId)) : undefined;
      if (match) {
        const d = await fetchTableLayoutDetail(match.id);
        setActiveFromDetail(d.id, d.name, d.payload);
      }
    } catch {
      setLayouts([]);
    } finally {
      setBootstrapDone(true);
    }
  }, [setActiveFromDetail, tableKey]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!bootstrapDone || !activeLayoutId) return;
    const stillListed = layouts.some((l) => isSameLayoutId(l.id, activeLayoutId));
    if (!stillListed) {
      setActiveLayoutId(null);
      setActiveLayoutName(null);
      setActivePayload(null);
    }
  }, [activeLayoutId, bootstrapDone, layouts]);

  const layoutControlled = activeLayoutId != null && activePayload != null;

  const headerSelectionId = useMemo(() => activeLayoutId, [activeLayoutId]);

  return {
    layouts,
    bootstrapDone,
    activeLayoutId,
    activePayload,
    activeLayoutName,
    monitoringDefaultLayoutId,
    layoutControlled,
    headerSelectionId,
    reloadLayouts,
    applyLayoutById,
    setActiveFromDetail,
  };
}
