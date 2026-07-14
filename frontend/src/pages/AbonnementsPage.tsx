import { Navigate } from "react-router-dom";

export function AbonnementsPage() {
  return <Navigate to="/mitteilungszentrale?kind=subscription" replace />;
}
