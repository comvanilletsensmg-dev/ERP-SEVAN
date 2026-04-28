import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, candidatesTable } from "@workspace/db";
import { CreateCandidateBody, UpdateCandidateBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

function formatCandidate(c: typeof candidatesTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

router.get("/candidates", requireAuth, async (_req, res): Promise<void> => {
  const candidates = await db.select().from(candidatesTable).orderBy(candidatesTable.createdAt);
  res.json(candidates.map(formatCandidate));
});

router.post("/candidates", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCandidateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [candidate] = await db.insert(candidatesTable).values(parsed.data).returning();
  console.log(`[RECRUTEMENT] Nouveau candidat: ${candidate.name} pour ${candidate.position}`);
  res.status(201).json(formatCandidate(candidate));
});

router.put("/candidates/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateCandidateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof candidatesTable.$inferInsert> = {};
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const [candidate] = await db
    .update(candidatesTable)
    .set(updateData)
    .where(eq(candidatesTable.id, req.params.id))
    .returning();

  if (!candidate) {
    res.status(404).json({ error: "Candidat introuvable" });
    return;
  }

  console.log(`[RECRUTEMENT] Candidat ${candidate.name} → ${candidate.status}`);
  res.json(formatCandidate(candidate));
});

export default router;
