import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth";
import { AppShellLayout } from "./layout/AppShellLayout";
import { AppParametersPage } from "./pages/AppParametersPage";
import { AssetsPage } from "./pages/AssetsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { ClassificationsPage } from "./pages/ClassificationsPage";
import { CostCentersPage } from "./pages/CostCentersPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { WorkOrdersPage } from "./pages/WorkOrdersPage";
import { WorkgroupsPage } from "./pages/WorkgroupsPage";
import { SitesPage } from "./pages/SitesPage";
import { TableViewerPage } from "./pages/TableViewerPage";
import { TranslationsPage } from "./pages/TranslationsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { UsersPage } from "./pages/UsersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShellLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="workorders" element={<WorkOrdersPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="cost-centers" element={<CostCentersPage />} />
          <Route path="classifications" element={<ClassificationsPage />} />
          <Route path="workgroups" element={<WorkgroupsPage />} />
          <Route path="app-parameters" element={<AppParametersPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="table-viewer" element={<TableViewerPage />} />
          <Route path="translations" element={<TranslationsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
