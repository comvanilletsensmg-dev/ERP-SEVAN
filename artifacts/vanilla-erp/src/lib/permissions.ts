export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ACCOUNTANT: "ACCOUNTANT",
  LOGISTICS_MANAGER: "LOGISTICS_MANAGER",
  HR_MANAGER: "HR_MANAGER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export type Module = "dashboard" | "logistics" | "accounting" | "hr" | "admin";

const MODULE_ACCESS: Record<Module, Role[]> = {
  dashboard: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT, ROLES.LOGISTICS_MANAGER, ROLES.HR_MANAGER],
  logistics: [ROLES.SUPER_ADMIN, ROLES.LOGISTICS_MANAGER],
  accounting: [ROLES.SUPER_ADMIN, ROLES.ACCOUNTANT],
  hr: [ROLES.SUPER_ADMIN, ROLES.HR_MANAGER],
  admin: [ROLES.SUPER_ADMIN],
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
};

export const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800",
  ACCOUNTANT: "bg-blue-100 text-blue-800",
  LOGISTICS_MANAGER: "bg-amber-100 text-amber-800",
  HR_MANAGER: "bg-green-100 text-green-800",
};
