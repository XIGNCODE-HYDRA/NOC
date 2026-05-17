import { Router } from "express";
import { db, devicesTable, pingHistoryTable } from "@workspace/db";
import { eq, gte, lt, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { measurePing } from "../lib/mikrotik";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth);

// In-memory ping cache: deviceId -> latest result
const pingCache = new Map<number, { latencyMs: number | null; success: boolean; timestamp: string }>();

export function getPingCache() { return pingCache; }

async function pollPing(): Promise<void> {
  try {
    const devices = await db.select().from(devicesTable);

    for (const device of devices) {
      try {
        const result = await measurePing(device.host, device.port);
        pingCache.set(device.id, { ...result, timestamp: new Date().toISOString() });

        await db.insert(pingHistoryTable).values({
          deviceId: device.id,
          latencyMs: result.latencyMs,
          success: result.success,
          recordedAt: new Date(),
        });
      } catch (err) {
        logger.debug({ deviceId: device.id, err }, "Failed polling ping");
      }
    }

    // Prune ping history older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.delete(pingHistoryTable).where(lt(pingHistoryTable.recordedAt, cutoff));
  } catch (err) {
    logger.error({ err }, "Error in ping poller");
  }
}

// Start poller every 30 seconds
setInterval(() => { void pollPing(); }, 30_000);
// Run immediately on startup
void pollPing();

router.get("/ping/live", async (_req, res): Promise<void> => {
  const devices = await db.select({
    id: devicesTable.id,
    name: devicesTable.name,
    host: devicesTable.host,
    status: devicesTable.status,
  }).from(devicesTable);

  const readings = devices.map(d => {
    const cached = pingCache.get(d.id);
    return {
      deviceId: d.id,
      deviceName: d.name,
      host: d.host,
      status: d.status,
      latencyMs: cached?.latencyMs ?? null,
      success: cached?.success ?? false,
      timestamp: cached?.timestamp ?? null,
    };
  });

  res.json(readings);
});

router.get("/ping/history", async (req, res): Promise<void> => {
  const deviceId = Number(req.query.deviceId);
  const hours = Number(req.query.hours ?? 24);
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    res.status(400).json({ error: "Invalid deviceId" });
    return;
  }
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({
      recordedAt: pingHistoryTable.recordedAt,
      latencyMs: pingHistoryTable.latencyMs,
      success: pingHistoryTable.success,
    })
    .from(pingHistoryTable)
    .where(
      and(
        eq(pingHistoryTable.deviceId, deviceId),
        gte(pingHistoryTable.recordedAt, cutoff),
      )
    )
    .orderBy(pingHistoryTable.recordedAt);

  // Calculate summary stats
  const successful = rows.filter(r => r.success && r.latencyMs != null);
  const latencies = successful.map(r => r.latencyMs as number);
  const minMs = latencies.length ? Math.min(...latencies) : null;
  const maxMs = latencies.length ? Math.max(...latencies) : null;
  const avgMs = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
  const packetLoss = rows.length ? ((rows.length - successful.length) / rows.length) * 100 : 0;

  res.json({
    points: rows.map(r => ({
      timestamp: r.recordedAt.toISOString(),
      latencyMs: r.latencyMs,
      success: r.success,
    })),
    stats: { minMs, maxMs, avgMs, packetLoss },
  });
});

export default router;
