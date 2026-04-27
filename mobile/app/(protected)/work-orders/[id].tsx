import { useLocalSearchParams } from "expo-router";

import { WorkOrderEditor } from "../../../src/screens/work-orders/WorkOrderEditor";

export default function WorkOrderEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkOrderEditor orderId={String(id)} />;
}
