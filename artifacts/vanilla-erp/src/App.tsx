import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout/AppLayout";

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Suppliers from "@/pages/suppliers";
import Purchases from "@/pages/purchases";
import Lots from "@/pages/lots";
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
import AccountingInvoices from "@/pages/accounting/Invoices";
import AccountingPartners from "@/pages/accounting/Partners";
import AccountingBank from "@/pages/accounting/Bank";
import AccountingAssets from "@/pages/accounting/Assets";
import AccountingReports from "@/pages/accounting/Reports";
import UsersAdmin from "@/pages/admin/Users";

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
      <Route path="/suppliers" component={() => <ProtectedRoute component={Suppliers} />} />
      <Route path="/purchases" component={() => <ProtectedRoute component={Purchases} />} />
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
      <Route path="/accounting/invoices" component={() => <ProtectedRoute component={AccountingInvoices} />} />
      <Route path="/accounting/partners" component={() => <ProtectedRoute component={AccountingPartners} />} />
      <Route path="/accounting/bank" component={() => <ProtectedRoute component={AccountingBank} />} />
      <Route path="/accounting/assets" component={() => <ProtectedRoute component={AccountingAssets} />} />
      <Route path="/accounting/reports" component={() => <ProtectedRoute component={AccountingReports} />} />
      <Route path="/admin/users" component={() => <ProtectedRoute component={UsersAdmin} />} />
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
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
