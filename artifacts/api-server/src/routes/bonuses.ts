import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, bonusesTable, employeesTable, lotsTable } from "@workspace/db";
import { CreateBonusBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatBonus(
  bonus: typeof bonusesTable.$inferSelect,
  employee?: typeof employeesTable.$inferSelect | null,
  lot?: typeof lotsTable.$inferSelect | null
) {
  return {
    ...bonus,
    createdAt: bonus.createdAt.toISOString(),
    employee: employee ? { ...employee, createdAt: employee.createdAt.toISOString(), hireDate: employee.hireDate?.toISOString() ?? null } : undefined,
    lot: lot ? { ...lot, createdAt: lot.createdAt.toISOString() } : undefined,
  };
}

router.get("/bonuses", requireAuth, async (req, res): Promise<void> => {
  const { employeeId } = req.query as { employeeId?: string };

  const rows = await db
    .select()
    .from(bonusesTable)
    .leftJoin(employeesTable, eq(bonusesTable.employeeId, employeesTable.id))
    .leftJoin(lotsTable, eq(bonusesTable.lotId, lotsTable.id))
    .orderBy(bonusesTable.createdAt);

  let result = rows.map(({ bonuses: b, employees: e, lots: l }) => formatBonus(b, e, l));

  if (employeeId) result = result.filter((r) => r.employeeId === employeeId);

  res.json(result);
});

router.post("/bonuses", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBonusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { employeeId, lotId, quantity, rate } = parsed.data;

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const [lot] = await db.select().from(lotsTable).where(eq(lotsTable.id, lotId));
  if (!lot) {
    res.status(404).json({ error: "Lot introuvable" });
    return;
  }

  const amount = quantity * rate;

  const [bonus] = await db
    .insert(bonusesTable)
    .values({ employeeId, lotId, quantity, rate, amount })
    .returning();

  console.log(
    `[PRIME] ${employee.name} — lot ${lot.code}: ${quantity}kg × ${rate.toLocaleString()} MGA/kg = ${amount.toLocaleString()} MGA`
  );

  res.status(201).json(formatBonus(bonus, employee, lot));
});

export default router;
