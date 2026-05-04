/**
 * Matricule auto-generation service.
 * Format: AAAADDDNNNN
 *   AAAA = year (4 digits)
 *   DDD  = department code (3 digits, e.g. 101)
 *   NNNN = sequence (4 digits, zero-padded)
 *
 * Example: 20261010001 (year=2026, dept=101, seq=0001)
 */
import { db, employeesTable } from "@workspace/db";
import { like } from "drizzle-orm";

export async function generateMatricule(deptCode: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `${year}${deptCode}`;

  const last = await db
    .select({ matricule: employeesTable.matricule })
    .from(employeesTable)
    .where(like(employeesTable.matricule, `${prefix}%`))
    .orderBy(employeesTable.matricule)
    .limit(1000);

  let seq = 1;
  if (last.length > 0) {
    const seqs = last
      .map((e) => {
        const raw = e.matricule?.slice(prefix.length);
        return raw ? parseInt(raw, 10) : 0;
      })
      .filter((n) => !isNaN(n));
    if (seqs.length > 0) seq = Math.max(...seqs) + 1;
  }

  const padded = String(seq).padStart(4, "0");
  return `${prefix}${padded}`;
}

/**
 * Decode a matricule into its components.
 */
export function decodeMatricule(matricule: string): { year: string; deptCode: string; seq: string } | null {
  if (!matricule || matricule.length < 11) return null;
  return {
    year: matricule.slice(0, 4),
    deptCode: matricule.slice(4, 7),
    seq: matricule.slice(7),
  };
}
