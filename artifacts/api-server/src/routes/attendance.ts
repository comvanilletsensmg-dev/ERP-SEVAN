import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { db, attendanceTable, employeesTable } from "@workspace/db";
import { CheckInBody, CheckOutBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function formatRecord(record: typeof attendanceTable.$inferSelect, employee?: typeof employeesTable.$inferSelect | null) {
  return {
    ...record,
    date: record.date.toISOString(),
    checkIn: record.checkIn?.toISOString() ?? null,
    checkOut: record.checkOut?.toISOString() ?? null,
    employee: employee ? { ...employee, createdAt: employee.createdAt.toISOString() } : undefined,
  };
}

router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const { date, employeeId } = req.query as { date?: string; employeeId?: string };

  let query = db
    .select()
    .from(attendanceTable)
    .leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
    .orderBy(attendanceTable.date);

  const conditions = [];

  if (date) {
    const d = new Date(date);
    conditions.push(gte(attendanceTable.date, startOfDay(d)));
    conditions.push(lt(attendanceTable.date, endOfDay(d)));
  }
  if (employeeId) {
    conditions.push(eq(attendanceTable.employeeId, employeeId));
  }

  const records = conditions.length > 0
    ? await db
        .select()
        .from(attendanceTable)
        .leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
        .where(and(...conditions))
        .orderBy(attendanceTable.date)
    : await query;

  res.json(records.map(({ attendance: a, employees: e }) => formatRecord(a, e)));
});

router.post("/attendance/checkin", requireAuth, async (req, res): Promise<void> => {
  const parsed = CheckInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, parsed.data.employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Check if already checked in today
  const existing = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.employeeId, parsed.data.employeeId),
        gte(attendanceTable.date, today),
        lt(attendanceTable.date, todayEnd)
      )
    );

  if (existing.length > 0) {
    res.status(400).json({ error: `${employee.name} a déjà pointé l'arrivée aujourd'hui.` });
    return;
  }

  const [record] = await db
    .insert(attendanceTable)
    .values({
      employeeId: parsed.data.employeeId,
      date: now,
      checkIn: now,
    })
    .returning();

  console.log(`[HR] Check-in: ${employee.name} à ${now.toLocaleTimeString()}`);
  res.status(201).json(formatRecord(record, employee));
});

router.post("/attendance/checkout", requireAuth, async (req, res): Promise<void> => {
  const parsed = CheckOutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, parsed.data.employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const now = new Date();
  const today = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Find today's attendance record
  const [existing] = await db
    .select()
    .from(attendanceTable)
    .where(
      and(
        eq(attendanceTable.employeeId, parsed.data.employeeId),
        gte(attendanceTable.date, today),
        lt(attendanceTable.date, todayEnd)
      )
    );

  if (!existing) {
    res.status(400).json({ error: `Aucun pointage d'arrivée trouvé pour ${employee.name} aujourd'hui.` });
    return;
  }

  if (existing.checkOut) {
    res.status(400).json({ error: `${employee.name} a déjà pointé la sortie aujourd'hui.` });
    return;
  }

  const [record] = await db
    .update(attendanceTable)
    .set({ checkOut: now })
    .where(eq(attendanceTable.id, existing.id))
    .returning();

  console.log(`[HR] Check-out: ${employee.name} à ${now.toLocaleTimeString()}`);
  res.json(formatRecord(record, employee));
});

export default router;
