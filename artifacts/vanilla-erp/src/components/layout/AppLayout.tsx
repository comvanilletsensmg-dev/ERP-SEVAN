import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  Globe,
  TrendingUp,
  BookOpen,
  LogOut,
  CreditCard,
  ArrowLeftRight,
  UserCheck,
  CalendarDays,
  ClipboardList,
  MessageSquare,
  Banknote,
  Award,
  UserPlus,
} from "lucide-react";

const mainNav = [
  { label: "Tableau de bord", href: "/dashboard", icon: LayoutDashboard },
  { label: "Fournisseurs",     href: "/suppliers",       icon: Users },
  { label: "Achats",           href: "/purchases",       icon: ShoppingCart },
  { label: "Lots",             href: "/lots",            icon: Package },
  { label: "Clients",          href: "/clients",         icon: Globe },
  { label: "Ventes",           href: "/sales",           icon: TrendingUp },
  { label: "Paiements",        href: "/payments",        icon: CreditCard },
  { label: "Mouvements stock", href: "/stock-movements", icon: ArrowLeftRight },
  { label: "Comptabilité",     href: "/accounting",      icon: BookOpen },
];

const hrNav = [
  { label: "Employés",         href: "/hr/employees",  icon: UserCheck },
  { label: "Congés",           href: "/hr/leaves",     icon: CalendarDays },
  { label: "Pointage",         href: "/hr/attendance", icon: ClipboardList },
  { label: "Demandes RH",      href: "/hr/requests",   icon: MessageSquare },
  { label: "Paie",             href: "/hr/payroll",    icon: Banknote },
  { label: "Primes Production",href: "/hr/bonuses",    icon: Award },
  { label: "Recrutement",      href: "/hr/candidates", icon: UserPlus },
];

function NavItem({ href, label, icon: Icon, location }: { href: string; label: string; icon: React.ElementType; location: string }) {
  const isActive = location === href || (href !== "/dashboard" && location.startsWith(href));
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const logout = useLogout();

  const handleLogout = async () => {
    await logout.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/login");
  };

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border hidden md:flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-serif font-bold tracking-tight text-sidebar-primary">Vanilla ERP</h1>
          <p className="text-xs text-sidebar-foreground/70 mt-1">Madagascar Operations</p>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto pb-4">
          {mainNav.map((item) => (
            <NavItem key={item.href} {...item} location={location} />
          ))}

          <div className="pt-4 pb-1">
            <p className="px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Ressources Humaines</p>
          </div>
          {hrNav.map((item) => (
            <NavItem key={item.href} {...item} location={location} />
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="mb-4 px-2">
            <p className="text-sm font-medium">{user?.email}</p>
            <p className="text-xs text-sidebar-foreground/70 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
