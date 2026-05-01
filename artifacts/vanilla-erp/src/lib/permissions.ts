export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ACCOUNTANT: "ACCOUNTANT",
  LOGISTICS_MANAGER: "LOGISTICS_MANAGER",
  HR_MANAGER: "HR_MANAGER",
  COMMERCIAL: "COMMERCIAL",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export type Module = "dashboard" | "logistics" | "accounting" | "hr" | "admin" | "crm";

const MODULE_ACCESS: Record<Module, Role[]> = {
  dashboard: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT, ROLES.LOGISTICS_MANAGER, ROLES.HR_MANAGER, ROLES.COMMERCIAL],
  logistics: [ROLES.SUPER_ADMIN, ROLES.LOGISTICS_MANAGER],
  accounting: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT],
  hr: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER],
  admin: [ROLES.SUPER_ADMIN],
  crm: [ROLES.SUPER_ADMIN, ROLES.COMMERCIAL, ROLES.LOGISTICS_MANAGER],
};

export function canAccess(role: string, module: Module): boolean {
  return MODULE_ACCESS[module]?.includes(role as Role) ?? false;
}

export function getAccessibleModules(role: string): Module[] {
  return (Object.entries(MODULE_ACCESS) as [Module, Role[]][])
    .filter(([, roles]) => roles.includes(role as Role))
    .map(([mod]) => mod);
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administrateur",
  ACCOUNTANT: "Comptable",
  LOGISTICS_MANAGER: "Responsable Logistique",
  HR_MANAGER: "Responsable RH",
  COMMERCIAL: "Commercial",
};

export const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800",
  ACCOUNTANT: "bg-blue-100 text-blue-800",
  LOGISTICS_MANAGER: "bg-amber-100 text-amber-800",
  HR_MANAGER: "bg-green-100 text-green-800",
  COMMERCIAL: "bg-emerald-100 text-emerald-800",
};
