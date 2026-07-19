import { Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "./auth/RequireAuth";
import { AppShellLayout } from "./layout/AppShellLayout";
import { AppParametersPage } from "./pages/AppParametersPage";
import { AssetsPage } from "./pages/AssetsPage";
import { AuditLogPage } from "./pages/AuditLogPage";
import { BaumstrukturPage } from "./pages/BaumstrukturPage";
import { ClassificationsPage } from "./pages/ClassificationsPage";
import { CostCentersPage } from "./pages/CostCentersPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { SparePartsPage } from "./pages/SparePartsPage";
import { WarehousesPage } from "./pages/WarehousesPage";
import { StorageLocationsPage } from "./pages/StorageLocationsPage";
import { EmployeesPage } from "./pages/EmployeesPage";
import { CalculatorPage } from "./pages/CalculatorPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { MonitoringPage } from "./pages/MonitoringPage";
import { KalendarPage } from "./pages/KalendarPage";
import { OrderCreationPage } from "./pages/OrderCreationPage";
import { WorkOrdersPage } from "./pages/WorkOrdersPage";
import { WorkgroupsPage } from "./pages/WorkgroupsPage";
import { ShiftsPage } from "./pages/ShiftsPage";
import { ShiftPlannerPage } from "./pages/ShiftPlannerPage";
import { SitesPage } from "./pages/SitesPage";
import { TableViewerPage } from "./pages/TableViewerPage";
import { TranslationsPage } from "./pages/TranslationsPage";
import { SearchPresetsPage } from "./pages/SearchPresetsPage";
import { TransactionsPage } from "./pages/TransactionsPage";
import { UsersPage } from "./pages/UsersPage";
import { MitteilungszentralePage } from "./pages/MitteilungszentralePage";
import { AbonnementsPage } from "./pages/AbonnementsPage";
import { KpiBuilderPage } from "./pages/KpiBuilderPage";
import { MaintenancePlansPage } from "./pages/MaintenancePlansPage";
import { InspectionRoundsPage } from "./pages/InspectionRoundsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShellLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="calculator" element={<CalculatorPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="baumstruktur" element={<BaumstrukturPage />} />
          <Route path="workorders" element={<WorkOrdersPage />} />
          <Route path="auftragserstellung" element={<OrderCreationPage />} />
          <Route path="kalendar" element={<KalendarPage />} />
          <Route path="schichtplaner" element={<ShiftPlannerPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route path="suchkonfig" element={<SearchPresetsPage />} />
          <Route path="kpi-builder" element={<KpiBuilderPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="employees" element={<EmployeesPage />} />
          <Route path="cost-centers" element={<CostCentersPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="storage-locations" element={<StorageLocationsPage />} />
          <Route path="spare-parts" element={<SparePartsPage />} />
          <Route path="classifications" element={<ClassificationsPage />} />
          <Route path="workgroups" element={<WorkgroupsPage />} />
          <Route path="shifts" element={<ShiftsPage />} />
          <Route path="maintenance-plans" element={<MaintenancePlansPage />} />
          <Route path="inspection-rounds" element={<InspectionRoundsPage />} />
          <Route path="app-parameters" element={<AppParametersPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="table-viewer" element={<TableViewerPage />} />
          <Route path="translations" element={<TranslationsPage />} />
          <Route path="mitteilungszentrale" element={<MitteilungszentralePage />} />
          <Route path="abonnements" element={<AbonnementsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
