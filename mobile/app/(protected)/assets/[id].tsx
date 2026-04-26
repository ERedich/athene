import { useLocalSearchParams } from "expo-router";

import { AssetEditor } from "../../../src/screens/assets/AssetEditor";

export default function AssetEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AssetEditor assetId={String(id)} />;
}
