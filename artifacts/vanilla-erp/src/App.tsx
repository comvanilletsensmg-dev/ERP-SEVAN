import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Suppliers from "@/pages/suppliers";
import SupplierDetail from "@/pages/suppliers/SupplierDetail";
import SupplierForm from "@/pages/suppliers/SupplierForm";
import Purchases from "@/pages/purchases";
import Lots from "@/pages/lots";
import LotDetail from "@/pages/lots/LotDetail";
import Clients from "@/pages/clients";
import Sales from "@/pages/sales";
import Accounting from "@/pages/accounting";
import Payments from "@/pages/payments";
import StockMovements from "@/pages/stock-movements";
import Employees from "@/pages/Employees";
import Leaves from "@/pages/Leaves";
import Attendance from "@/pages/Attendance";
import HrRequests from "@/pages/HrRequests";
import Payroll from "@/pages/Payroll";
import Bonuses from "@/pages/Bonuses";
import Candidates from "@/pages/Candidates";
import HrDashboard from "@/pages/hr/Dashboard";
import HrImport from "@/pages/hr/Import";
import AccountingInvoices from "@/pages/accounting/Invoices";
import AccountingPartners from "@/pages/accounting/Partners";
import TiersDetail from "@/pages/accounting/TiersDetail";
import AccountingBank from "@/pages/accounting/Bank";
import AccountingAssets from "@/pages/accounting/Assets";
import AssetDetail from "@/pages/accounting/AssetDetail";
import AccountingReports from "@/pages/accounting/Reports";
import FinancialDashboard from "@/pages/accounting/FinancialDashboard";
import ClosingPage from "@/pages/accounting/ClosingPage";
import UsersAdmin from "@/pages/admin/Users";
import ExecutiveDashboardPage from "@/pages/admin/ExecutiveDashboardPage";
import SecurityDashboardPage from "@/pages/admin/SecurityDashboardPage";
import CompanySettings from "@/pages/settings/Company";
import PlatformSettings from "@/pages/settings/Platform";
import LogisticsDashboardPage from "@/pages/logistics/LogisticsDashboardPage";
import LogisticsIntelligence from "@/pages/logistics/Intelligence";
import LogisticsImport from "@/pages/logistics/ImportLots";
import LogisticsImportProducts from "@/pages/logistics/ImportProducts";
import LogisticsLotsStatus from "@/pages/logistics/LotsStatus";
import LogisticsRisk from "@/pages/logistics/Risk";
import LogisticsAI from "@/pages/logistics/AI";
import LogisticsPlanning from "@/pages/logistics/Planning";
import CatalogueProduits from "@/pages/CatalogueProduits";
import CrmLeads from "@/pages/crm/Leads";
import CrmProspects from "@/pages/crm/Prospects";
import CrmProspectDetail from "@/pages/crm/ProspectDetail";
import CrmClients from "@/pages/crm/Clients";
import CrmClientDetail from "@/pages/crm/ClientDetail";
import CrmConversionAlerts from "@/pages/crm/ConversionAlerts";
import CrmDeals from "@/pages/crm/Deals";
import CrmInteractions from "@/pages/crm/Interactions";
import CrmQuotes from "@/pages/crm/Quotes";
import CrmTemplates from "@/pages/crm/Templates";
import CrmReminders from "@/pages/crm/Reminders";
import OperationDashboard from "@/pages/operations/OperationDashboard";
import OperationReport from "@/pages/operations/OperationReport";
import OperationHistory from "@/pages/operations/OperationHistory";
import ConsumablesPage from "@/pages/operations/Consumables";
import EquipmentStock from "@/pages/logistics/EquipmentStock";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background text-primary font-serif">Chargement ERP…</div>;

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
      <Route path="/suppliers/new" component={() => <ProtectedRoute component={SupplierForm} />} />
      <Route path="/suppliers/:id/edit" component={(params: any) => {
        const id = params?.params?.id ?? params?.id ?? "";
        const C = () => <SupplierForm id={id} />;
        return <ProtectedRoute component={C} />;
      }} />
      <Route path="/suppliers/:id" component={(params: any) => {
        const id = params?.params?.id ?? params?.id ?? "";
        const C = () => <SupplierDetail id={id} />;
        return <ProtectedRoute component={C} />;
      }} />
      <Route path="/suppliers" component={() => <ProtectedRoute component={Suppliers} />} />
      <Route path="/purchases" component={() => <ProtectedRoute component={Purchases} />} />
      <Route path="/lots/:id" component={(params: any) => {
        const C = () => <LotDetail id={params.id} />;
        return <ProtectedRoute component={C} />;
      }} />
      <Route path="/lots" component={() => <ProtectedRoute component={Lots} />} />
      <Route path="/clients" component={() => <ProtectedRoute component={Clients} />} />
      <Route path="/sales" component={() => <ProtectedRoute component={Sales} />} />
      <Route path="/accounting" component={() => <ProtectedRoute component={Accounting} />} />
      <Route path="/payments" component={() => <ProtectedRoute component={Payments} />} />
      <Route path="/stock-movements" component={() => <ProtectedRoute component={StockMovements} />} />
      <Route path="/hr/employees" component={() => <ProtectedRoute component={Employees} />} />
      <Route path="/hr/leaves" component={() => <ProtectedRoute component={Leaves} />} />
      <Route path="/hr/attendance" component={() => <ProtectedRoute component={Attendance} />} />
      <Route path="/hr/requests" component={() => <ProtectedRoute component={HrRequests} />} />
      <Route path="/hr/payroll" component={() => <ProtectedRoute component={Payroll} />} />
      <Route path="/hr/bonuses" component={() => <ProtectedRoute component={Bonuses} />} />
      <Route path="/hr/candidates" component={() => <ProtectedRoute component={Candidates} />} />
      <Route path="/hr/dashboard" component={() => <ProtectedRoute component={HrDashboard} />} />
      <Route path="/hr/import" component={() => <ProtectedRoute component={HrImport} />} />
      <Route path="/accounting/invoices" component={() => <ProtectedRoute component={AccountingInvoices} />} />
      <Route path="/accounting/partners" component={() => <ProtectedRoute component={AccountingPartners} />} />
      <Route path="/accounting/tiers/:id" component={(params: any) => {
        const id = params?.params?.id ?? params?.id ?? "";
        const C = () => <TiersDetail id={id} />;
        return <ProtectedRoute component={C} />;
      }} />
      <Route path="/accounting/bank" component={() => <ProtectedRoute component={AccountingBank} />} />
      <Route path="/accounting/assets/:id" component={(params: any) => {
        const id = params?.params?.id ?? params?.id ?? "";
        const C = () => <AssetDetail id={id} />;
        return <ProtectedRoute component={C} />;
      }} />
      <Route path="/accounting/assets" component={() => <ProtectedRoute component={AccountingAssets} />} />
      <Route path="/accounting/reports" component={() => <ProtectedRoute component={AccountingReports} />} />
      <Route path="/accounting/finance" component={() => <ProtectedRoute component={FinancialDashboard} />} />
      <Route path="/accounting/closing" component={() => <ProtectedRoute component={ClosingPage} />} />
      <Route path="/admin/dashboard" component={() => <ProtectedRoute component={ExecutiveDashboardPage} />} />
      <Route path="/admin/security" component={() => <ProtectedRoute component={SecurityDashboardPage} />} />
      <Route path="/admin/users" component={() => <ProtectedRoute component={UsersAdmin} />} />
      <Route path="/settings/company" component={() => <ProtectedRoute component={CompanySettings} />} />
      <Route path="/settings/platform" component={() => <ProtectedRoute component={PlatformSettings} />} />
      <Route path="/logistics/dashboard" component={() => <ProtectedRoute component={LogisticsDashboardPage} />} />
      <Route path="/logistics/intelligence" component={() => <ProtectedRoute component={LogisticsIntelligence} />} />
      <Route path="/logistics/import" component={() => <ProtectedRoute component={LogisticsImport} />} />
      <Route path="/logistics/import-products" component={() => <ProtectedRoute component={LogisticsImportProducts} />} />
      <Route path="/logistics/lots-status" component={() => <ProtectedRoute component={LogisticsLotsStatus} />} />
      <Route path="/logistics/risk" component={() => <ProtectedRoute component={LogisticsRisk} />} />
      <Route path="/logistics/ai" component={() => <ProtectedRoute component={LogisticsAI} />} />
      <Route path="/logistics/planning" component={() => <ProtectedRoute component={LogisticsPlanning} />} />
      <Route path="/catalogue" component={() => <ProtectedRoute component={CatalogueProduits} />} />
      <Route path="/crm/clients/:id" component={(params: any) => {
        const id = params?.params?.id ?? params?.id ?? "";
        const C = () => <CrmClientDetail id={id} />;
        return <ProtectedRoute component={C} />;
      }} />
      <Route path="/crm/clients" component={() => <ProtectedRoute component={CrmClients} />} />
      <Route path="/crm/conversion-alerts" component={() => <ProtectedRoute component={CrmConversionAlerts} />} />
      <Route path="/crm/prospects/:id" component={(params: any) => {
        const id = params?.params?.id ?? params?.id ?? "";
        const C = () => <CrmProspectDetail id={id} />;
        return <ProtectedRoute component={C} />;
      }} />
      <Route path="/crm/prospects" component={() => <ProtectedRoute component={CrmProspects} />} />
      <Route path="/crm/deals" component={() => <ProtectedRoute component={CrmDeals} />} />
      <Route path="/crm/leads" component={() => <ProtectedRoute component={CrmLeads} />} />
      <Route path="/crm/interactions" component={() => <ProtectedRoute component={CrmInteractions} />} />
      <Route path="/crm/quotes" component={() => <ProtectedRoute component={CrmQuotes} />} />
      <Route path="/crm/templates" component={() => <ProtectedRoute component={CrmTemplates} />} />
      <Route path="/crm/reminders" component={() => <ProtectedRoute component={CrmReminders} />} />
      <Route path="/operations/dashboard"   component={() => <ProtectedRoute component={OperationDashboard} />} />
      <Route path="/operations/report"      component={() => <ProtectedRoute component={OperationReport} />} />
      <Route path="/operations/history"     component={() => <ProtectedRoute component={OperationHistory} />} />
      <Route path="/operations/consumables" component={() => <ProtectedRoute component={ConsumablesPage} />} />
      <Route path="/logistics/stock" component={() => <ProtectedRoute component={EquipmentStock} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
          <SonnerToaster position="top-right" richColors />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
