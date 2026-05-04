import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import { db, attendanceTable, employeesTable } from "@workspace/db";
import { CheckInBody, CheckOutBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { z } from "zod";

const router: IRouter = Router();

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function formatRecord(
  record: typeof attendanceTable.$inferSelect,
  employee?: typeof employeesTable.$inferSelect | null
) {
  return {
    ...record,
    date:     record.date.toISOString(),
    checkIn:  record.checkIn?.toISOString()  ?? null,
    checkOut: record.checkOut?.toISOString() ?? null,
    employee: employee
      ? { ...employee, createdAt: employee.createdAt.toISOString() }
      : undefined,
  };
}

// ── GET /attendance  (daily list) ──────────────────────────────────────────
router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const { date, employeeId } = req.query as { date?: string; employeeId?: string };

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
    ? await db.select().from(attendanceTable)
        .leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
        .where(and(...conditions))
        .orderBy(attendanceTable.date)
    : await db.select().from(attendanceTable)
        .leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
        .orderBy(attendanceTable.date);

  res.json(records.map(({ attendance: a, employees: e }) => formatRecord(a, e)));
});

// ── GET /attendance/month  (monthly summary, all records for a month) ──────
router.get("/attendance/month", requireAuth, async (req, res): Promise<void> => {
  const { month, employeeId } = req.query as { month?: string; employeeId?: string };

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "Paramètre month requis (YYYY-MM)" });
    return;
  }

  const [yr, mo] = month.split("-").map(Number);
  const start = new Date(yr, mo - 1, 1, 0, 0, 0, 0);
  const end   = new Date(yr, mo,     1, 0, 0, 0, 0); // exclusive start of next month

  const conditions = [
    gte(attendanceTable.date, start),
    lt(attendanceTable.date, end),
  ];
  if (employeeId) {
    conditions.push(eq(attendanceTable.employeeId, employeeId));
  }

  const records = await db.select()
    .from(attendanceTable)
    .leftJoin(employeesTable, eq(attendanceTable.employeeId, employeesTable.id))
    .where(and(...conditions))
    .orderBy(attendanceTable.date);

  res.json(records.map(({ attendance: a, employees: e }) => formatRecord(a, e)));
});

// ── POST /attendance/manual  (manual entry — any date, past or present) ────
const ManualEntryBody = z.object({
  employeeId: z.string().min(1),
  date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD"),
  checkIn:    z.string().optional(),   // HH:MM
  checkOut:   z.string().optional(),   // HH:MM
});

router.post("/attendance/manual", requireAuth, async (req, res): Promise<void> => {
  const parsed = ManualEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors.map(e => e.message).join(", ") });
    return;
  }

  const { employeeId, date, checkIn: ciStr, checkOut: coStr } = parsed.data;

  const [employee] = await db.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
  if (!employee) {
    res.status(404).json({ error: "Employé introuvable" });
    return;
  }

  const [yr, mo, dy] = date.split("-").map(Number);
  const dayStart = new Date(yr, mo - 1, dy, 0, 0, 0, 0);
  const dayEnd   = new Date(yr, mo - 1, dy, 23, 59, 59, 999);

  // resolve HH:MM strings into full Date objects
  const toDateTime = (hhmm: string | undefined): Date | undefined => {
    if (!hhmm) return undefined;
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(yr, mo - 1, dy, h, m, 0, 0);
  };
  const checkInDate  = toDateTime(ciStr);
  const checkOutDate = toDateTime(coStr);

  // Look for existing record on that day
  const [existing] = await db.select().from(attendanceTable).where(
    and(
      eq(attendanceTable.employeeId, employeeId),
      gte(attendanceTable.date, dayStart),
      lt(attendanceTable.date, dayEnd),
    )
  );

  let record;
  if (existing) {
    // Update existing record
    const [updated] = await db.update(attendanceTable)
      .set({
        ...(checkInDate  !== undefined ? { checkIn:  checkInDate }  : {}),
        ...(checkOutDate !== undefined ? { checkOut: checkOutDate } : {}),
      })
      .where(eq(attendanceTable.id, existing.id))
      .returning();
    record = updated;
  } else {
    // Insert new record
    const [inserted] = await db.insert(attendanceTable)
      .values({
        employeeId,
        date:    checkInDate ?? dayStart,
        checkIn: checkInDate,
        checkOut: checkOutDate,
      })
      .returning();
    record = inserted;
  }

  req.log.info({ employeeId, date, action: existing ? "updated" : "created" }, "Manual attendance entry");
  res.status(existing ? 200 : 201).json(formatRecord(record, employee));
});

// ── POST /attendance/checkin ───────────────────────────────────────────────
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

  const now      = new Date();
  const today    = startOfDay(now);
  const todayEnd = endOfDay(now);

  const existing = await db.select().from(attendanceTable).where(
    and(
      eq(attendanceTable.employeeId, parsed.data.employeeId),
      gte(attendanceTable.date, today),
      lt(attendanceTable.date, todayEnd),
    )
  );

  if (existing.length > 0) {
    res.status(400).json({ error: `${employee.name} a déjà pointé l'arrivée aujourd'hui.` });
    return;
  }

  const [record] = await db.insert(attendanceTable)
    .values({ employeeId: parsed.data.employeeId, date: now, checkIn: now })
    .returning();

  req.log.info({ employee: employee.name }, "Check-in recorded");
  res.status(201).json(formatRecord(record, employee));
});

// ── POST /attendance/checkout ──────────────────────────────────────────────
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

  const now      = new Date();
  const today    = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [existing] = await db.select().from(attendanceTable).where(
    and(
      eq(attendanceTable.employeeId, parsed.data.employeeId),
      gte(attendanceTable.date, today),
      lt(attendanceTable.date, todayEnd),
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

  const [record] = await db.update(attendanceTable)
    .set({ checkOut: now })
    .where(eq(attendanceTable.id, existing.id))
    .returning();

  req.log.info({ employee: employee.name }, "Check-out recorded");
  res.json(formatRecord(record, employee));
});

export default router;
