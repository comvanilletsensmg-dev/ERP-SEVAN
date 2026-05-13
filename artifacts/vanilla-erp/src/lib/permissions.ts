export const ROLES = {
  SUPER_ADMIN:        "SUPER_ADMIN",
  ADMIN:              "ADMIN",
  DG:                 "DG",
  DGA:                "DGA",
  HR_MANAGER:         "HR_MANAGER",
  ACCOUNTANT:         "ACCOUNTANT",
  LOGISTICS_MANAGER:  "LOGISTICS_MANAGER",
  COMMERCIAL:         "COMMERCIAL",
  BUSINESS_DEVELOPER: "BUSINESS_DEVELOPER",
  DSI:                "DSI",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export type Module = "dashboard" | "logistics" | "accounting" | "hr" | "admin" | "crm" | "operations";

const FULL_ACCESS: Role[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DG, ROLES.DGA];

const MODULE_ACCESS: Record<Module, Role[]> = {
  dashboard:  [...FULL_ACCESS, ROLES.ACCOUNTANT, ROLES.LOGISTICS_MANAGER, ROLES.HR_MANAGER, ROLES.COMMERCIAL, ROLES.BUSINESS_DEVELOPER, ROLES.DSI],
  logistics:  [...FULL_ACCESS, ROLES.LOGISTICS_MANAGER],
  accounting: [...FULL_ACCESS, ROLES.ACCOUNTANT],
  hr:         [...FULL_ACCESS, ROLES.HR_MANAGER],
  admin:      [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.DG],
  crm:        [...FULL_ACCESS, ROLES.COMMERCIAL, ROLES.BUSINESS_DEVELOPER, ROLES.LOGISTICS_MANAGER],
  operations: [...FULL_ACCESS, ROLES.LOGISTICS_MANAGER],
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
  SUPER_ADMIN:        "Super Administrateur",
  ADMIN:              "Administrateur",
  DG:                 "Directeur Général",
  DGA:                "Directeur Général Adjoint",
  HR_MANAGER:         "Responsable RH",
  ACCOUNTANT:         "Comptable",
  LOGISTICS_MANAGER:  "Responsable Logistique",
  COMMERCIAL:         "Commercial",
  BUSINESS_DEVELOPER: "Business Developer",
  DSI:                "Responsable DSI",
};

export const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:        "bg-purple-100 text-purple-800 border-purple-200",
  ADMIN:              "bg-violet-100 text-violet-800 border-violet-200",
  DG:                 "bg-rose-100 text-rose-800 border-rose-200",
  DGA:                "bg-pink-100 text-pink-800 border-pink-200",
  HR_MANAGER:         "bg-green-100 text-green-800 border-green-200",
  ACCOUNTANT:         "bg-blue-100 text-blue-800 border-blue-200",
  LOGISTICS_MANAGER:  "bg-amber-100 text-amber-800 border-amber-200",
  COMMERCIAL:         "bg-emerald-100 text-emerald-800 border-emerald-200",
  BUSINESS_DEVELOPER: "bg-teal-100 text-teal-800 border-teal-200",
  DSI:                "bg-slate-100 text-slate-800 border-slate-200",
};

export const ROLE_DEPT: Record<string, string> = {
  SUPER_ADMIN:        "IT / Administration",
  ADMIN:              "Administration",
  DG:                 "Direction",
  DGA:                "Direction",
  HR_MANAGER:         "Ressources Humaines",
  ACCOUNTANT:         "Finance & Comptabilité",
  LOGISTICS_MANAGER:  "Logistique",
  COMMERCIAL:         "Commercial",
  BUSINESS_DEVELOPER: "Développement",
  DSI:                "Informatique",
};
