import { Router } from "express";
import { db, pool, monitoredInterfacesTable, devicesTable, bandwidthHistoryTable } from "@workspace/db";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { GetBandwidthHistoryQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { decryptPassword } from "../lib/crypto";
import { getBandwidth } from "../lib/mikrotik";
import { logger } from "../lib/logger";
import { logEvent } from "../lib/event-logger";

const router = Router();

router.use(requireAuth);

// In-memory cache for live bandwidth readings (updated by poller)
const liveCache = new Map<number, { rxBps: number; txBps: number; timestamp: string }>();
// Low-bandwidth thresholds (Mbps)
const LOW_RX_MBPS = 0.8; // download
const LOW_TX_MBPS = 0.2; // upload
// Track low-bandwidth state per direction separately (transition-only events)
const lowRxState = new Map<number, boolean>();
const lowTxState = new Map<number, boolean>();
// Track 0-Mbps (system down) state per direction: key = `${id}-rx` or `${id}-tx`
const zeroState = new Map<string, boolean>();

// Background poller - runs every 5 seconds
async function pollBandwidth(): Promise<void> {
  try {
    const monitored = await db
      .select({
        id: monitoredInterfacesTable.id,
        interfaceName: monitoredInterfacesTable.interfaceName,
        alias: monitoredInterfacesTable.alias,
        deviceId: monitoredInterfacesTable.deviceId,
        enabled: monitoredInterfacesTable.enabled,
        deviceName: devicesTable.name,
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

        // Low-bandwidth event detection — separate RX (download) and TX (upload) thresholds
        const rxMbps = stats.rxBps / 1_000_000;
        const txMbps = stats.txBps / 1_000_000;
        const ifaceName = iface.alias || iface.interfaceName;

        const rxWasLow = lowRxState.get(iface.id);
        const rxIsLow = rxMbps < LOW_RX_MBPS && stats.rxBps > 0;
        if (rxIsLow && rxWasLow === false) {
          logEvent({
            type: "low_bandwidth",
            message: `${ifaceName} — DOWNLOAD below ${LOW_RX_MBPS} Mbps (${rxMbps.toFixed(3)} Mbps)`,
            deviceName: iface.deviceName ?? undefined,
            host: iface.host,
            interfaceName: ifaceName,
          }).catch(() => {});
        } else if (!rxIsLow && rxWasLow === true) {
          logEvent({
            type: "recovery",
            message: `${ifaceName} — DOWNLOAD recovered (${rxMbps.toFixed(2)} Mbps)`,
            deviceName: iface.deviceName ?? undefined,
            host: iface.host,
            interfaceName: ifaceName,
          }).catch(() => {});
        }
        lowRxState.set(iface.id, rxIsLow);

        const txWasLow = lowTxState.get(iface.id);
        const txIsLow = txMbps < LOW_TX_MBPS && stats.txBps > 0;
        if (txIsLow && txWasLow === false) {
          logEvent({
            type: "low_bandwidth",
            message: `${ifaceName} — UPLOAD below ${LOW_TX_MBPS} Mbps (${txMbps.toFixed(3)} Mbps)`,
            deviceName: iface.deviceName ?? undefined,
            host: iface.host,
            interfaceName: ifaceName,
          }).catch(() => {});
        } else if (!txIsLow && txWasLow === true) {
          logEvent({
            type: "recovery",
            message: `${ifaceName} — UPLOAD recovered (${txMbps.toFixed(2)} Mbps)`,
            deviceName: iface.deviceName ?? undefined,
            host: iface.host,
            interfaceName: ifaceName,
          }).catch(() => {});
        }
        lowTxState.set(iface.id, txIsLow);

        // System-down event: RX or TX is exactly 0 bps (transition only)
        const rxKey = `${iface.id}-rx`;
        const txKey = `${iface.id}-tx`;
        const rxWasZero = zeroState.get(rxKey);
        const txWasZero = zeroState.get(txKey);
        const rxIsZero = stats.rxBps === 0;
        const txIsZero = stats.txBps === 0;

        if (rxIsZero && rxWasZero === false) {
          logEvent({
            type: "system_down",
            message: `${iface.alias || iface.interfaceName} — DOWNLOAD is 0 Mbps (link may be down)`,
            deviceName: iface.deviceName ?? undefined,
            host: iface.host,
            interfaceName: iface.alias || iface.interfaceName,
          }).catch(() => {});
        } else if (!rxIsZero && rxWasZero === true) {
          logEvent({
            type: "recovery",
            message: `${iface.alias || iface.interfaceName} — DOWNLOAD restored (${(stats.rxBps / 1_000_000).toFixed(2)} Mbps)`,
            deviceName: iface.deviceName ?? undefined,
            host: iface.host,
            interfaceName: iface.alias || iface.interfaceName,
          }).catch(() => {});
        }
        zeroState.set(rxKey, rxIsZero);

        if (txIsZero && txWasZero === false) {
          logEvent({
            type: "system_down",
            message: `${iface.alias || iface.interfaceName} — UPLOAD is 0 Mbps (link may be down)`,
            deviceName: iface.deviceName ?? undefined,
            host: iface.host,
            interfaceName: iface.alias || iface.interfaceName,
          }).catch(() => {});
        } else if (!txIsZero && txWasZero === true) {
          logEvent({
            type: "recovery",
            message: `${iface.alias || iface.interfaceName} — UPLOAD restored (${(stats.txBps / 1_000_000).toFixed(2)} Mbps)`,
            deviceName: iface.deviceName ?? undefined,
            host: iface.host,
            interfaceName: iface.alias || iface.interfaceName,
          }).catch(() => {});
        }
        zeroState.set(txKey, txIsZero);

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
        await db.update(devicesTable).set({ status: "offline" }).where(eq(devicesTable.id, iface.deviceId));
      }
    }

    // Keep 30 days of history; delete records older than cutoff
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.delete(bandwidthHistoryTable).where(lt(bandwidthHistoryTable.recordedAt, cutoff));
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
    rxBps: r.rxBps,
    txBps: r.txBps,
  })));
});

const VALID_WINDOWS = ["1h", "24h", "7d", "30d"] as const;
type WindowKey = typeof VALID_WINDOWS[number];

const WINDOW_CONFIG = {
  "1h":  { intervalMs: 60 * 60 * 1000,          bucketSec: 60 },         // 1-min buckets
  "24h": { intervalMs: 24 * 60 * 60 * 1000,      bucketSec: 5 * 60 },    // 5-min buckets
  "7d":  { intervalMs: 7 * 24 * 60 * 60 * 1000,  bucketSec: 30 * 60 },  // 30-min buckets
  "30d": { intervalMs: 30 * 24 * 60 * 60 * 1000, bucketSec: 2 * 3600 }, // 2-hour buckets
};

router.get("/bandwidth/aggregate", async (req, res): Promise<void> => {
  const interfaceId = Number(req.query.interfaceId);
  const window = req.query.window as string;
  if (!Number.isInteger(interfaceId) || interfaceId <= 0) {
    res.status(400).json({ error: "Invalid interfaceId" });
    return;
  }
  if (!VALID_WINDOWS.includes(window as WindowKey)) {
    res.status(400).json({ error: "Invalid window, must be one of: 1h, 24h, 7d, 30d" });
    return;
  }
  const win = window as WindowKey;
  const { intervalMs, bucketSec } = WINDOW_CONFIG[win];
  const cutoff = new Date(Date.now() - intervalMs);

  // bucketSec is a controlled integer from WINDOW_CONFIG — safe to inline
  const { rows } = await pool.query<{
    bucket: Date;
    rx_bps: number;
    tx_bps: number;
    max_rx_bps: number;
    max_tx_bps: number;
  }>(
    `SELECT
       to_timestamp(floor(extract(epoch from recorded_at) / ${bucketSec}) * ${bucketSec}) AS bucket,
       avg(rx_bps)::float AS rx_bps,
       avg(tx_bps)::float AS tx_bps,
       max(rx_bps)::float AS max_rx_bps,
       max(tx_bps)::float AS max_tx_bps
     FROM bandwidth_history
     WHERE interface_id = $1
       AND recorded_at >= $2
     GROUP BY floor(extract(epoch from recorded_at) / ${bucketSec})
     ORDER BY bucket ASC`,
    [interfaceId, cutoff.toISOString()],
  );

  const data = rows.map(r => ({
    timestamp: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket),
    rxMbps: (Number(r.rx_bps) || 0) / 1_000_000,
    txMbps: (Number(r.tx_bps) || 0) / 1_000_000,
    maxRxMbps: (Number(r.max_rx_bps) || 0) / 1_000_000,
    maxTxMbps: (Number(r.max_tx_bps) || 0) / 1_000_000,
  }));

  res.json(data);
});

export { liveCache };
export default router;
