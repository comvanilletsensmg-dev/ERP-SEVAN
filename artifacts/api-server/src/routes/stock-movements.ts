import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, stockMovementsTable, lotsTable, suppliersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/stock-movements", requireAuth, async (_req, res): Promise<void> => {
  const movements = await db
    .select()
    .from(stockMovementsTable)
    .leftJoin(lotsTable, eq(stockMovementsTable.lotId, lotsTable.id))
    .leftJoin(suppliersTable, eq(lotsTable.supplierId, suppliersTable.id))
    .orderBy(stockMovementsTable.createdAt);

  res.json(
    movements.map(({ stock_movements: sm, lots: l, suppliers: s }) => ({
      ...sm,
      createdAt: sm.createdAt.toISOString(),
      lot: l
        ? {
            ...l,
            createdAt: l.createdAt.toISOString(),
            supplier: s ? { ...s, createdAt: s.createdAt.toISOString() } : undefined,
          }
        : undefined,
    }))
  );
});

export default router;
