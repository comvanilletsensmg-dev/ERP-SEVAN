import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLogout, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { usePlatformSettings } from "@/hooks/use-platform-settings";
import {
  LayoutDashboard, Users, ShoppingCart, Package, Globe, TrendingUp,
  BookOpen, LogOut, CreditCard, ArrowLeftRight, UserCheck, CalendarDays,
  ClipboardList, MessageSquare, Banknote, Award, UserPlus, FileText,
  Building2, Landmark, BarChart3, Layers, ShieldCheck, Cpu, BellRing, Mail,
  Target, Activity, AlertTriangle, Upload, Workflow, ShieldAlert, Brain, Settings,
  Factory, LockKeyhole,
} from "lucide-react";
import { canAccess, ROLE_LABELS } from "@/lib/permissions";

const logisticsNav = [
  { label: "Dashboard Logistique", href: "/logistics/dashboard",       icon: LayoutDashboard },
  { label: "Planning & Export",   href: "/logistics/planning",        icon: Workflow },
  { label: "Fournisseurs",        href: "/suppliers",                 icon: Users },
  { label: "Achats",              href: "/purchases",                 icon: ShoppingCart },
  { label: "Lots",                href: "/lots",                      icon: Package },
  { label: "Statuts vanille",     href: "/logistics/lots-status",     icon: Target },
  { label: "Lots à risque",       href: "/logistics/risk",            icon: ShieldAlert },
  { label: "IA Vanille",          href: "/logistics/ai",              icon: Brain },
  { label: "Mouvements stock",    href: "/stock-movements",           icon: ArrowLeftRight },
  { label: "Intelligence IA",       href: "/logistics/intelligence",      icon: Cpu },
  { label: "Import Produits",       href: "/logistics/import-products",   icon: Upload },
  { label: "Catalogue Produits",    href: "/catalogue",                    icon: Package },
];

const accountingNav = [
  { label: "Dashboard Financier", href: "/accounting/finance",    icon: TrendingUp },
  { label: "Clôture Mensuelle",   href: "/accounting/closing",    icon: LockKeyhole },
  { label: "Paiements",           href: "/payments",              icon: CreditCard },
  { label: "Journal",             href: "/accounting",            icon: BookOpen },
  { label: "Factures",            href: "/accounting/invoices",   icon: FileText },
  { label: "Tiers",               href: "/accounting/partners",   icon: Building2 },
  { label: "Rapprochement",       href: "/accounting/bank",       icon: Landmark },
  { label: "Immobilisations",     href: "/accounting/assets",     icon: Layers },
  { label: "Rapports",            href: "/accounting/reports",    icon: BarChart3 },
];

const hrNav = [
  { label: "Dashboard RH",      href: "/hr/dashboard",  icon: BarChart3 },
  { label: "Employés",          href: "/hr/employees",  icon: UserCheck },
  { label: "Import Employés",   href: "/hr/import",     icon: Upload },
  { label: "Congés",            href: "/hr/leaves",     icon: CalendarDays },
  { label: "Pointage",          href: "/hr/attendance", icon: ClipboardList },
  { label: "Demandes RH",       href: "/hr/requests",   icon: MessageSquare },
  { label: "Paie",              href: "/hr/payroll",    icon: Banknote },
  { label: "Primes Production", href: "/hr/bonuses",    icon: Award },
  { label: "Recrutement",       href: "/hr/candidates", icon: UserPlus },
];

const crmNav = [
  { label: "Prospects",         href: "/crm/prospects",    icon: Globe },
  { label: "Deals / Pipeline",  href: "/crm/deals",        icon: Target },
  { label: "Clients CRM",       href: "/crm/clients",      icon: Building2 },
  { label: "Ventes",            href: "/sales",             icon: TrendingUp },
  { label: "Devis",             href: "/crm/quotes",        icon: FileText },
  { label: "Activités",         href: "/crm/interactions",  icon: Activity },
  { label: "Templates email",   href: "/crm/templates",     icon: Mail },
  { label: "Relances",          href: "/crm/reminders",     icon: BellRing },
  { label: "Catalogue Produits", href: "/catalogue",          icon: Package },
];

const operationsNav = [
  { label: "Dashboard Opérations", href: "/operations/dashboard", icon: Factory },
  { label: "Rapport journalier",   href: "/operations/report",    icon: ClipboardList },
  { label: "Historique",           href: "/operations/history",   icon: BarChart3 },
  { label: "Consommables",         href: "/operations/consumables",icon: Package },
];

const adminNav = [
  { label: "Centre de gouvernance", href: "/admin/dashboard",    icon: LayoutDashboard },
  { label: "Security Center",       href: "/admin/security",     icon: ShieldAlert },
  { label: "Utilisateurs",          href: "/admin/users",        icon: ShieldCheck },
  { label: "Config. ERP",           href: "/settings/platform",  icon: Settings },
  { label: "Config. Société",       href: "/settings/company",   icon: Building2 },
];

const EXACT_MATCH_PATHS = ["/dashboard", "/accounting", "/accounting/finance", "/accounting/closing"];

function NavItem({ href, label, icon: Icon, location, badge }: {
  href: string; label: string; icon: React.ElementType; location: string; badge?: number;
}) {
  const isActive = location === href || (!EXACT_MATCH_PATHS.includes(href) && location.startsWith(href + "/"));
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
      <span className="truncate flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-amber-400 text-white text-[10px] font-bold px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function NavSection({ title, items, location }: { title: string; items: { label: string; href: string; icon: React.ElementType }[]; location: string }) {
  return (
    <>
      <div className="pt-4 pb-1">
        <p className="px-3 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">{title}</p>
      </div>
      {items.map(item => <NavItem key={item.href} {...item} location={location} />)}
    </>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const logout = useLogout();
  const role = user?.role ?? "";

  // Fetch company settings for logo + name
  const { data: companySettings } = useQuery<{ companyName: string; logoUrl?: string | null } | null>({
    queryKey: ["company-settings"],
    queryFn: async () => {
      const r = await fetch("/api/settings", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Platform settings — branding, title, favicon, CSS vars
  const { settings: platformSettings } = usePlatformSettings();

  useEffect(() => {
    const erpName = platformSettings["erp_name"] ?? "Vanilla ERP";
    const primaryColor = platformSettings["primary_color"] ?? "";
    const accentColor = platformSettings["accent_color"] ?? "";
    const faviconUrl = platformSettings["favicon_url"] ?? "";

    if (erpName) document.title = erpName;

    if (/^#[0-9A-Fa-f]{6}$/.test(primaryColor))
      document.documentElement.style.setProperty("--brand-primary", primaryColor);
    if (/^#[0-9A-Fa-f]{6}$/.test(accentColor))
      document.documentElement.style.setProperty("--brand-accent", accentColor);

    if (faviconUrl) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "icon");
        document.head.appendChild(link);
      }
      link.setAttribute("href", faviconUrl);
    }
  }, [platformSettings]);

  // Fetch pending conversion alert count
  const { data: alertCount } = useQuery<{ pending: number }>({
    queryKey: ["crm-alert-count"],
    queryFn: async () => {
      const r = await fetch("/api/crm/conversion-alerts/count", { credentials: "include" });
      if (!r.ok) return { pending: 0 };
      return r.json();
    },
    refetchInterval: 60_000,
    enabled: canAccess(role, "crm"),
  });

  const pendingAlerts = alertCount?.pending ?? 0;

  const handleLogout = async () => {
    await logout.mutateAsync();
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    setLocation("/login");
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border hidden md:flex flex-col h-screen">
        <div className="p-4 shrink-0 flex items-center gap-3">
          {companySettings?.logoUrl ? (
            <img
              src={companySettings.logoUrl}
              alt="Logo"
              className="h-10 w-10 object-contain rounded-lg bg-white/10 p-0.5 shrink-0"
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-base font-serif font-bold tracking-tight text-sidebar-primary truncate leading-tight">
              {companySettings?.companyName ?? "Vanilla ERP"}
            </h1>
            <p className="text-xs text-sidebar-foreground/70 truncate">
              {platformSettings["platform_tagline"] ?? "Madagascar Operations"}
            </p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto pb-4">
          <NavItem href="/dashboard" label="Tableau de bord" icon={LayoutDashboard} location={location} />

          {canAccess(role, "logistics") && (
            <NavSection title="Logistique" items={logisticsNav} location={location} />
          )}

          {canAccess(role, "accounting") && (
            <NavSection title="Comptabilité" items={accountingNav} location={location} />
          )}

          {canAccess(role, "hr") && (
            <NavSection title="Ressources Humaines" items={hrNav} location={location} />
          )}

          {canAccess(role, "operations") && (
            <NavSection title="Opérations" items={operationsNav} location={location} />
          )}

          {canAccess(role, "crm") && (
            <>
              <NavSection title="Commercial / CRM" items={crmNav} location={location} />
              <NavItem
                href="/crm/conversion-alerts"
                label="Alertes conversion"
                icon={AlertTriangle}
                location={location}
                badge={pendingAlerts}
              />
            </>
          )}

          {canAccess(role, "admin") && (
            <NavSection title="Administration" items={adminNav} location={location} />
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border shrink-0">
          <div className="mb-4 px-2">
            <p className="text-sm font-medium truncate">{user?.name ?? user?.email}</p>
            <p className="text-xs text-sidebar-foreground/70">{ROLE_LABELS[role] ?? role}</p>
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
