import { Router } from "express";
import { db, eventLogTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

router.get("/events", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const rows = await db
    .select()
    .from(eventLogTable)
    .orderBy(desc(eventLogTable.recordedAt))
    .limit(limit);

  res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    message: r.message,
    deviceName: r.deviceName,
    host: r.host,
    interfaceName: r.interfaceName,
    recordedAt: r.recordedAt.toISOString(),
  })));
});

router.delete("/events", async (_req, res): Promise<void> => {
  await db.delete(eventLogTable);
  res.status(204).end();
});

export default router;
