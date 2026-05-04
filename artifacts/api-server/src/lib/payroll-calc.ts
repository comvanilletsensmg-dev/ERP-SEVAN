/**
 * Madagascar payroll calculation engine.
 *
 * Charges salariales :
 *   CNAPS  : 1 % du salaire brut (part salarié)
 *   OSTIE  : 1 % du salaire brut (part salarié)
 *   IRSA   : barème progressif mensuel simplifié (cf. DGI Madagascar)
 *
 * Barème IRSA mensuel (net imposable = brut − CNAPS − OSTIE) :
 *   ≤ 350 000 MGA      →  0 %
 *   350 001–400 000    →  5 %  sur l'excédent
 *   400 001–500 000    → 10 %  sur l'excédent
 *   500 001–600 000    → 15 %  sur l'excédent
 *   > 600 000          → 20 %  sur l'excédent
 */

export interface PayrollCalcInput {
  salaryBase: number;
  bonus: number;
  heuresSup: number;
  deductions: number;
}

export interface PayrollCalcResult {
  brut: number;
  cnapsEmp: number;
  ostieEmp: number;
  irsa: number;
  charges: number;
  netSalary: number;
}

const IRSA_BRACKETS: [number, number][] = [
  [350_000, 0.00],
  [400_000, 0.05],
  [500_000, 0.10],
  [600_000, 0.15],
  [Infinity, 0.20],
];

export function calculateIrsa(netImposable: number): number {
  if (netImposable <= 350_000) return 0;
  let irsa = 0;
  let remaining = netImposable;
  let prevBracket = 0;
  for (const [cap, rate] of IRSA_BRACKETS) {
    if (remaining <= prevBracket) break;
    const taxable = Math.min(remaining, cap) - prevBracket;
    if (taxable > 0 && rate > 0) irsa += taxable * rate;
    prevBracket = cap === Infinity ? remaining : cap;
  }
  return Math.round(irsa);
}

export function calculatePayroll(input: PayrollCalcInput): PayrollCalcResult {
  const { salaryBase, bonus, heuresSup, deductions } = input;
  const brut = salaryBase + bonus + heuresSup;

  const cnapsEmp = Math.round(brut * 0.01);
  const ostieEmp = Math.round(brut * 0.01);

  const netImposable = Math.max(0, brut - cnapsEmp - ostieEmp);
  const irsa = calculateIrsa(netImposable);

  const charges = cnapsEmp + ostieEmp + irsa;
  const netSalary = Math.max(0, brut - charges - deductions);

  return { brut, cnapsEmp, ostieEmp, irsa, charges, netSalary };
}
