import type { ReactElement, ReactNode } from "react";
import { Column } from "primereact/column";
import type { DataTableSortMeta } from "primereact/datatable";

import {
  columnStyleFromPayload,
  frozenAlignForColumn,
  getMonitoringColumnDef,
  visibleColumnIdsFromPayload,
  type TableLayoutPayloadV1,
} from "../../lib/tableLayouts/tableLayoutPayload";
import type { WorkOrder } from "../../lib/workOrderTypes";

export type MonitoringColumnRenderCtx = {
  t: (key: string) => string;
  isPreloadMode: boolean;
  layoutControlled: boolean;
  orderNumberBody: (row: WorkOrder) => ReactNode;
  originalWoBody: (row: WorkOrder) => ReactNode;
  statusBody: (row: WorkOrder) => ReactNode;
  statusCellClassName: (row: WorkOrder) => string | undefined;
  referencesBody: (row: WorkOrder) => ReactNode;
  typeLabel: (value: WorkOrder["orderType"]) => string;
  formatShortDt: (iso: string) => string;
  durationBody: (row: WorkOrder) => ReactNode;
  startStopBody: (row: WorkOrder) => ReactNode;
};

export function buildMultiSortMeta(payload: TableLayoutPayloadV1): DataTableSortMeta[] {
  return payload.sort.map((s) => ({ field: s.field, order: s.order }));
}

export function renderMonitoringWorkOrdersColumns(
  payload: TableLayoutPayloadV1,
  ctx: MonitoringColumnRenderCtx,
): ReactNode[] {
  const visibleIds = visibleColumnIdsFromPayload(payload);

  return visibleIds
    .map((columnId) => {
    const def = getMonitoringColumnDef(columnId);
    if (!def) return null;
    const frozenSide = frozenAlignForColumn(payload, columnId);
    const style = columnStyleFromPayload(payload, columnId, def);
    const header = ctx.t(def.headerKey);
    const sortable = ctx.layoutControlled ? false : def.sortable && !ctx.isPreloadMode;
    const columnKey = def.columnKey ?? def.field ?? columnId;

    const common = {
      columnKey,
      header,
      sortable,
      style,
      frozen: frozenSide != null,
      ...(frozenSide ? { alignFrozen: frozenSide } : {}),
    };

    if (columnId === "orderNumber") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) => ctx.orderNumberBody(row)}
        />
      );
    }
    if (columnId === "originalWoOrderNumber") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) => ctx.originalWoBody(row)}
        />
      );
    }
    if (columnId === "maintenancePlanKey") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) =>
            row.maintenancePlanKey
              ? `${row.maintenancePlanKey}${row.maintenancePlanName ? ` — ${row.maintenancePlanName}` : ""}`
              : "—"
          }
        />
      );
    }
    if (columnId === "name") {
      return <Column key={columnId} {...common} field={def.field} />;
    }
    if (columnId === "status") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) => ctx.statusBody(row)}
          bodyClassName={(row: WorkOrder) => ctx.statusCellClassName(row) ?? ""}
        />
      );
    }
    if (columnId === "assetName") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) => `${row.assetKey} - ${row.assetName}`}
        />
      );
    }
    if (columnId === "costCenterName") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) => `${row.costCenterKey} - ${row.costCenterName}`}
        />
      );
    }
    if (columnId === "classificationName") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) =>
            row.classificationId ? `${row.classificationKey} - ${row.classificationName ?? ""}` : "—"
          }
        />
      );
    }
    if (columnId === "workgroupKey") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) =>
            row.workgroupKey ? `${row.workgroupKey} - ${row.workgroupName ?? ""}` : "—"
          }
        />
      );
    }
    if (columnId === "documentCount") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) => ctx.referencesBody(row)}
        />
      );
    }
    if (columnId === "orderType") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) => ctx.typeLabel(row.orderType)}
        />
      );
    }
    if (columnId === "plannedStart" || columnId === "plannedEnd") {
      return (
        <Column
          key={columnId}
          {...common}
          field={def.field}
          body={(row: WorkOrder) => ctx.formatShortDt(row[columnId as "plannedStart" | "plannedEnd"])}
          className="whitespace-nowrap"
        />
      );
    }
    if (columnId === "plannedDuration") {
      return (
        <Column key={columnId} {...common} body={(row: WorkOrder) => ctx.durationBody(row)} />
      );
    }
    if (columnId === "startStop") {
      return (
        <Column key={columnId} {...common} body={(row: WorkOrder) => ctx.startStopBody(row)} />
      );
    }

    return null;
  })
    .filter((col): col is ReactElement => col != null);
}
