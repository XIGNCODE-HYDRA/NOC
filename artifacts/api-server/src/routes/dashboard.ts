import { Router } from "express";
import { db, monitoredInterfacesTable, devicesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { liveCache } from "./bandwidth";

const router = Router();

router.use(requireAuth);

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [deviceStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      online: sql<number>`count(*) filter (where ${devicesTable.status} = 'online')::int`,
    })
    .from(devicesTable);

  const [ifaceStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${monitoredInterfacesTable.enabled} = true)::int`,
    })
    .from(monitoredInterfacesTable);

  // Calculate total bandwidth from live cache
  let totalRxBps = 0;
  let totalTxBps = 0;
  let alertCount = 0;

  const monitored = await db
    .select({
      id: monitoredInterfacesTable.id,
      thresholdMbps: monitoredInterfacesTable.thresholdMbps,
    })
    .from(monitoredInterfacesTable)
    .where(eq(monitoredInterfacesTable.enabled, true));

  for (const iface of monitored) {
    const cached = liveCache.get(iface.id);
    if (cached) {
      totalRxBps += cached.rxBps;
      totalTxBps += cached.txBps;
      if (iface.thresholdMbps && (cached.rxBps + cached.txBps) / 1_000_000 > iface.thresholdMbps) {
        alertCount++;
      }
    }
  }

  res.json({
    totalDevices: deviceStats?.total ?? 0,
    onlineDevices: deviceStats?.online ?? 0,
    totalInterfaces: ifaceStats?.total ?? 0,
    activeInterfaces: ifaceStats?.active ?? 0,
    totalRxMbps: totalRxBps / 1_000_000,
    totalTxMbps: totalTxBps / 1_000_000,
    alertCount,
  });
});

router.get("/dashboard/top-interfaces", async (_req, res): Promise<void> => {
  const monitored = await db
    .select({
      id: monitoredInterfacesTable.id,
      alias: monitoredInterfacesTable.alias,
      deviceName: devicesTable.name,
    })
    .from(monitoredInterfacesTable)
    .leftJoin(devicesTable, eq(monitoredInterfacesTable.deviceId, devicesTable.id))
    .where(eq(monitoredInterfacesTable.enabled, true));

  const withBandwidth = monitored.map(iface => {
    const cached = liveCache.get(iface.id);
    const rxMbps = (cached?.rxBps ?? 0) / 1_000_000;
    const txMbps = (cached?.txBps ?? 0) / 1_000_000;
    return {
      interfaceId: iface.id,
      alias: iface.alias,
      deviceName: iface.deviceName ?? "Unknown",
      rxMbps,
      txMbps,
      totalMbps: rxMbps + txMbps,
    };
  });

  withBandwidth.sort((a, b) => b.totalMbps - a.totalMbps);
  res.json(withBandwidth.slice(0, 10));
});

export default router;
