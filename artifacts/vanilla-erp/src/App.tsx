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

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background text-primary font-serif">Loading ERP...</div>;

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
