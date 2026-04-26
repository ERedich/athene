import type { AssetType } from "./api";

export const allowedAssetTypes: AssetType[] = ["site", "structure", "line", "maintenanceObject"];

export const parentTypeRules: Record<AssetType, AssetType[]> = {
  site: ["site"],
  structure: ["site", "structure"],
  line: ["site", "structure", "line"],
  maintenanceObject: ["site", "structure", "line", "maintenanceObject"],
};

export function allowedParentTypesFor(childType: AssetType): AssetType[] {
  return parentTypeRules[childType];
}
