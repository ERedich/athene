import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth";
import { AppShellLayout } from "./layout/AppShellLayout";
import { AppParametersPage } from "./pages/AppParametersPage";
import { AssetsPage } from "./pages/AssetsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { ClassificationsPage } from "./pages/ClassificationsPage";
import { CostCentersPage } from "./pages/CostCentersPage";
import { SparePartsPage } from "./pages/SparePartsPage";
import { WarehousesPage } from "./pages/WarehousesPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { KalendarPage } from "./pages/KalendarPage";
import { WorkOrdersPage } from "./pages/WorkOrdersPage";
import { WorkgroupsPage } from "./pages/WorkgroupsPage";
import { SitesPage } from "./pages/SitesPage";
import { TableViewerPage } from "./pages/TableViewerPage";
import { TranslationsPage } from "./pages/TranslationsPage";
import { SearchPresetsPage } from "./pages/SearchPresetsPage";
import { TableLayoutsPage } from "./pages/TableLayoutsPage";
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
          <Route path="kalendar" element={<KalendarPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route path="suchkonfig" element={<SearchPresetsPage />} />
          <Route path="tabellen-layouts" element={<TableLayoutsPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="cost-centers" element={<CostCentersPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="spare-parts" element={<SparePartsPage />} />
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
