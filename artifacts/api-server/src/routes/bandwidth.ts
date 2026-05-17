import { Router } from "express";
import { db, monitoredInterfacesTable, devicesTable, bandwidthHistoryTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";
import { GetBandwidthHistoryQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { decryptPassword } from "../lib/crypto";
import { getBandwidth } from "../lib/mikrotik";
import { logger } from "../lib/logger";

const router = Router();

router.use(requireAuth);

// In-memory cache for live bandwidth readings (updated by poller)
const liveCache = new Map<number, { rxBps: number; txBps: number; timestamp: string }>();

// Background poller - runs every 5 seconds
async function pollBandwidth(): Promise<void> {
  try {
    const monitored = await db
      .select({
        id: monitoredInterfacesTable.id,
        interfaceName: monitoredInterfacesTable.interfaceName,
        deviceId: monitoredInterfacesTable.deviceId,
        enabled: monitoredInterfacesTable.enabled,
        host: devicesTable.host,
        port: devicesTable.port,
        username: devicesTable.username,
        passwordEncrypted: devicesTable.passwordEncrypted,
      })
      .from(monitoredInterfacesTable)
      .leftJoin(devicesTable, eq(monitoredInterfacesTable.deviceId, devicesTable.id))
      .where(eq(monitoredInterfacesTable.enabled, true));

    for (const iface of monitored) {
      if (!iface.host || !iface.port || !iface.username || !iface.passwordEncrypted) continue;
      try {
        const password = decryptPassword(iface.passwordEncrypted);
        const stats = await getBandwidth(iface.host, iface.port, iface.username, password, iface.interfaceName);
        liveCache.set(iface.id, {
          rxBps: stats.rxBps,
          txBps: stats.txBps,
          timestamp: new Date().toISOString(),
        });
        // Store in history
        await db.insert(bandwidthHistoryTable).values({
          interfaceId: iface.id,
          rxBps: stats.rxBps,
          txBps: stats.txBps,
          recordedAt: new Date(),
        });
        // Update device status to online
        await db.update(devicesTable).set({ status: "online", lastSeen: new Date() }).where(eq(devicesTable.id, iface.deviceId));
      } catch (err) {
        logger.debug({ interfaceId: iface.id, err }, "Failed polling interface");
        // Update device status to offline
        await db.update(devicesTable).set({ status: "offline" }).where(eq(devicesTable.id, iface.deviceId));
      }
    }
    // Cleanup old history (keep last 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.delete(bandwidthHistoryTable).where(gte(bandwidthHistoryTable.recordedAt, cutoff));
  } catch (err) {
    logger.error({ err }, "Error in bandwidth poller");
  }
}

// Start poller
setInterval(() => { void pollBandwidth(); }, 5000);

router.get("/bandwidth/live", async (_req, res): Promise<void> => {
  const monitored = await db
    .select({
      id: monitoredInterfacesTable.id,
      interfaceName: monitoredInterfacesTable.interfaceName,
      alias: monitoredInterfacesTable.alias,
      deviceName: devicesTable.name,
    })
    .from(monitoredInterfacesTable)
    .leftJoin(devicesTable, eq(monitoredInterfacesTable.deviceId, devicesTable.id))
    .where(eq(monitoredInterfacesTable.enabled, true));

  const readings = monitored.map(iface => {
    const cached = liveCache.get(iface.id);
    const rxBps = cached?.rxBps ?? 0;
    const txBps = cached?.txBps ?? 0;
    return {
      interfaceId: iface.id,
      interfaceName: iface.interfaceName,
      alias: iface.alias,
      deviceName: iface.deviceName ?? "Unknown",
      rxBps,
      txBps,
      rxMbps: rxBps / 1_000_000,
      txMbps: txBps / 1_000_000,
      timestamp: cached?.timestamp ?? new Date().toISOString(),
    };
  });
  res.json(readings);
});

router.get("/bandwidth/history", async (req, res): Promise<void> => {
  const params = GetBandwidthHistoryQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { interfaceId, minutes } = params.data;
  const cutoff = new Date(Date.now() - (minutes ?? 60) * 60 * 1000);
  const rows = await db
    .select({
      recordedAt: bandwidthHistoryTable.recordedAt,
      rxBps: bandwidthHistoryTable.rxBps,
      txBps: bandwidthHistoryTable.txBps,
    })
    .from(bandwidthHistoryTable)
    .where(
      and(
        eq(bandwidthHistoryTable.interfaceId, interfaceId),
        gte(bandwidthHistoryTable.recordedAt, cutoff)
      )
    )
    .orderBy(bandwidthHistoryTable.recordedAt);

  res.json(rows.map(r => ({
    timestamp: r.recordedAt.toISOString(),
    rxMbps: r.rxBps / 1_000_000,
    txMbps: r.txBps / 1_000_000,
  })));
});

export { liveCache };
export default router;
