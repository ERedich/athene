export type InspectionRoundActivity = {
  id?: string;
  pos: number;
  name: string;
  assetId: string | null;
  assetKey?: string | null;
  assetName?: string | null;
  inspectionPointId: string | null;
  inspectionPointKey?: string | null;
  inspectionPointName?: string | null;
};

export type InspectionRound = {
  id: string;
  key: string;
  name: string;
  siteId: string;
  siteKey: string;
  siteName: string;
  siteColorHex: string;
  assetId: string | null;
  assetKey: string | null;
  assetName: string | null;
  activityCount: number;
  activities: InspectionRoundActivity[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type InspectionRoundActivityForm = {
  localId: string;
  pos: string;
  name: string;
  assetId: string;
  assetKey: string;
  inspectionPointId: string;
};

export type InspectionRoundFormState = {
  key: string;
  name: string;
  siteId: string;
  assetId: string;
  assetKey: string;
  activities: InspectionRoundActivityForm[];
};

export function emptyInspectionRoundForm(siteId = ""): InspectionRoundFormState {
  return {
    key: "",
    name: "",
    siteId,
    assetId: "",
    assetKey: "",
    activities: [],
  };
}

export function formatPosDisplay(pos: number | string): string {
  const n = typeof pos === "number" ? pos : Number.parseInt(String(pos).trim(), 10);
  if (!Number.isFinite(n) || n < 1) return "0001";
  return String(Math.min(9999, Math.trunc(n))).padStart(4, "0");
}

export function inspectionRoundToFormState(row: InspectionRound): InspectionRoundFormState {
  return {
    key: row.key,
    name: row.name,
    siteId: row.siteId,
    assetId: row.assetId ?? "",
    assetKey: row.assetKey ?? "",
    activities: (row.activities ?? []).map((a) => ({
      localId: a.id ?? crypto.randomUUID(),
      pos: formatPosDisplay(a.pos),
      name: a.name,
      assetId: a.assetId ?? "",
      assetKey: a.assetKey ?? "",
      inspectionPointId: a.inspectionPointId ?? "",
    })),
  };
}

export function newActivityForm(pos = 1): InspectionRoundActivityForm {
  return {
    localId: crypto.randomUUID(),
    pos: formatPosDisplay(pos),
    name: "",
    assetId: "",
    assetKey: "",
    inspectionPointId: "",
  };
}
