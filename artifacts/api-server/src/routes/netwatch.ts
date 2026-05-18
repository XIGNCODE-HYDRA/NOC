import { Router } from "express";
import { db, devicesTable, netwatchEntriesTable, netwatchHistoryTable } from "@workspace/db";
import { eq, and, gte, lt } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { decryptPassword } from "../lib/crypto";
import { getNetwatchEntries, addNetwatchEntry, removeNetwatchEntry } from "../lib/mikrotik";
import { logger } from "../lib/logger";
import { logEvent } from "../lib/event-logger";

const router = Router();
router.use(requireAuth);

// In-memory live cache: entryId -> latest snapshot
interface LiveEntry {
  id: number;
  deviceId: number;
  deviceName: string;
  mikrotikId: string;
  host: string;
  name: string | null;
  comment: string | null;
  interval: string;
  type: string;
  status: string;
  rttMs: number | null;
  rttMinMs: number | null;
  rttMaxMs: number | null;
  lossPercent: number;
  lastCheckedAt: string | null;
}
const liveCache = new Map<number, LiveEntry>();
// Track previous status per entry for event detection (entryId -> "up"|"down"|"unknown")
const prevStatus = new Map<number, string>();

// ─── Cache helpers ────────────────────────────────────────────────────────────
export function purgeDeviceFromLiveCache(deviceId: number): void {
  for (const [id, entry] of liveCache) {
    if (entry.deviceId === deviceId) {
      liveCache.delete(id);
      prevStatus.delete(id);
    }
  }
}

// ─── Poller ───────────────────────────────────────────────────────────────────
async function pollNetwatch(): Promise<void> {
  try {
    const devices = await db.select().from(devicesTable);

    // Purge liveCache entries for devices that no longer exist
    const validDeviceIds = new Set(devices.map(d => d.id));
    for (const [id, entry] of liveCache) {
      if (!validDeviceIds.has(entry.deviceId)) {
        liveCache.delete(id);
        prevStatus.delete(id);
      }
    }

    for (const device of devices) {
      let password: string;
      try {
        password = decryptPassword(device.passwordEncrypted);
      } catch {
        continue;
      }

      const entries = await getNetwatchEntries(device.host, device.port, device.username, password);

      for (const entry of entries) {
        if (!entry.mikrotikId) continue;

        const existing = await db
          .select()
          .from(netwatchEntriesTable)
          .where(and(
            eq(netwatchEntriesTable.deviceId, device.id),
            eq(netwatchEntriesTable.mikrotikId, entry.mikrotikId),
          ))
          .limit(1);

        const now = new Date();
        const liveSnapshot: Omit<LiveEntry, "id"> = {
          deviceId: device.id,
          deviceName: device.name,
          mikrotikId: entry.mikrotikId,
          host: entry.host,
          name: entry.name ?? null,
          comment: entry.comment ?? null,
          interval: entry.interval,
          type: entry.type,
          status: entry.status,
          rttMs: entry.rttMs,
          rttMinMs: entry.rttMinMs,
          rttMaxMs: entry.rttMaxMs,
          lossPercent: entry.lossPercent,
          lastCheckedAt: now.toISOString(),
        };

        if (existing.length === 0) {
          const inserted = await db.insert(netwatchEntriesTable).values({
            deviceId: device.id,
            mikrotikId: entry.mikrotikId,
            host: entry.host,
            name: entry.name ?? null,
            comment: entry.comment ?? null,
            interval: entry.interval,
            type: entry.type,
            status: entry.status,
            lastRttMs: entry.rttMs,
            lastCheckedAt: now,
          }).returning();
          const row = inserted[0];
          if (row) {
            liveCache.set(row.id, { id: row.id, ...liveSnapshot });
            await db.insert(netwatchHistoryTable).values({
              entryId: row.id, status: entry.status, rttMs: entry.rttMs, recordedAt: now,
            });
          }
        } else {
          const row = existing[0]!;
          await db.update(netwatchEntriesTable)
            .set({
              status: entry.status, lastRttMs: entry.rttMs, lastCheckedAt: now,
              host: entry.host, name: entry.name ?? null, comment: entry.comment ?? null,
              interval: entry.interval, type: entry.type,
            })
            .where(eq(netwatchEntriesTable.id, row.id));

          // Event detection on status transition
          const prev = prevStatus.get(row.id);
          if (prev !== undefined && prev !== entry.status) {
            if (entry.status === "down") {
              logEvent({
                type: "timeout",
                message: `${entry.name || entry.host} went DOWN`,
                deviceName: device.name,
                host: entry.host,
              }).catch(() => {});
            } else if (entry.status === "up" && prev === "down") {
              logEvent({
                type: "recovery",
                message: `${entry.name || entry.host} came back UP`,
                deviceName: device.name,
                host: entry.host,
              }).catch(() => {});
            }
          }
          prevStatus.set(row.id, entry.status);

          liveCache.set(row.id, { id: row.id, ...liveSnapshot });
          await db.insert(netwatchHistoryTable).values({
            entryId: row.id, status: entry.status, rttMs: entry.rttMs, recordedAt: now,
          });
        }
      }

      // Remove DB entries no longer present in MikroTik for this device
      const dbEntries = await db.select().from(netwatchEntriesTable)
        .where(eq(netwatchEntriesTable.deviceId, device.id));
      const liveMikrotikIds = new Set(entries.map(e => e.mikrotikId));
      for (const dbEntry of dbEntries) {
        if (!liveMikrotikIds.has(dbEntry.mikrotikId)) {
          await db.delete(netwatchEntriesTable).where(eq(netwatchEntriesTable.id, dbEntry.id));
          liveCache.delete(dbEntry.id);
        }
      }
    }

    // Prune history older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.delete(netwatchHistoryTable).where(lt(netwatchHistoryTable.recordedAt, cutoff));
  } catch (err) {
    logger.error({ err }, "Error in Netwatch poller");
  }
}

setInterval(() => { void pollNetwatch(); }, 30_000);
void pollNetwatch();

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/netwatch", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: netwatchEntriesTable.id,
      deviceId: netwatchEntriesTable.deviceId,
      deviceName: devicesTable.name,
      mikrotikId: netwatchEntriesTable.mikrotikId,
      host: netwatchEntriesTable.host,
      name: netwatchEntriesTable.name,
      comment: netwatchEntriesTable.comment,
      interval: netwatchEntriesTable.interval,
      type: netwatchEntriesTable.type,
      status: netwatchEntriesTable.status,
      lastRttMs: netwatchEntriesTable.lastRttMs,
      lastCheckedAt: netwatchEntriesTable.lastCheckedAt,
    })
    .from(netwatchEntriesTable)
    .innerJoin(devicesTable, eq(netwatchEntriesTable.deviceId, devicesTable.id))
    .orderBy(netwatchEntriesTable.deviceId, netwatchEntriesTable.host);

  res.json(rows.map(r => ({
    ...r,
    lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
  })));
});

router.get("/netwatch/live", async (_req, res): Promise<void> => {
  res.json(Array.from(liveCache.values()));
});

router.get("/netwatch/history", async (req, res): Promise<void> => {
  const entryId = Number(req.query.entryId);
  const hours = Number(req.query.hours ?? 24);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    res.status(400).json({ error: "Invalid entryId" });
    return;
  }
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const rows = await db
    .select({
      recordedAt: netwatchHistoryTable.recordedAt,
      status: netwatchHistoryTable.status,
      rttMs: netwatchHistoryTable.rttMs,
    })
    .from(netwatchHistoryTable)
    .where(and(
      eq(netwatchHistoryTable.entryId, entryId),
      gte(netwatchHistoryTable.recordedAt, cutoff),
    ))
    .orderBy(netwatchHistoryTable.recordedAt);

  const up = rows.filter(r => r.status === "up");
  const rtts = up.map(r => r.rttMs).filter((v): v is number => v != null);
  const minMs = rtts.length ? Math.min(...rtts) : null;
  const maxMs = rtts.length ? Math.max(...rtts) : null;
  const avgMs = rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : null;
  const downCount = rows.filter(r => r.status === "down").length;
  const packetLoss = rows.length ? (downCount / rows.length) * 100 : 0;

  res.json({
    points: rows.map(r => ({
      timestamp: r.recordedAt.toISOString(),
      status: r.status,
      rttMs: r.rttMs,
    })),
    stats: { minMs, maxMs, avgMs, packetLoss },
  });
});

router.post("/netwatch", async (req, res): Promise<void> => {
  const { deviceId, host: targetHost, interval, type, comment } = req.body as {
    deviceId: number; host: string; interval?: string; type?: string; comment?: string;
  };

  if (!deviceId || !targetHost) {
    res.status(400).json({ error: "deviceId and host are required" });
    return;
  }

  const devices = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (devices.length === 0) { res.status(404).json({ error: "Device not found" }); return; }
  const device = devices[0]!;
  const password = decryptPassword(device.passwordEncrypted);

  const mikrotikId = await addNetwatchEntry(device.host, device.port, device.username, password, {
    targetHost, interval: interval ?? "00:00:10", type: type ?? "icmp", comment,
  });

  const inserted = await db.insert(netwatchEntriesTable).values({
    deviceId, mikrotikId, host: targetHost,
    comment: comment ?? null, interval: interval ?? "00:00:10", type: type ?? "icmp", status: "unknown",
  }).returning();

  res.status(201).json(inserted[0]);
});

router.delete("/netwatch/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }

  const entries = await db.select().from(netwatchEntriesTable).where(eq(netwatchEntriesTable.id, id));
  if (entries.length === 0) { res.status(404).json({ error: "Entry not found" }); return; }
  const entry = entries[0]!;

  const devices = await db.select().from(devicesTable).where(eq(devicesTable.id, entry.deviceId));
  if (devices.length > 0) {
    const device = devices[0]!;
    const password = decryptPassword(device.passwordEncrypted);
    try {
      await removeNetwatchEntry(device.host, device.port, device.username, password, entry.mikrotikId);
    } catch (err) {
      logger.warn({ err, id }, "Failed to remove from MikroTik, still removing from DB");
    }
  }

  await db.delete(netwatchEntriesTable).where(eq(netwatchEntriesTable.id, id));
  liveCache.delete(id);
  res.status(204).end();
});

router.post("/netwatch/sync/:deviceId", async (req, res): Promise<void> => {
  const deviceId = Number(req.params.deviceId);
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    res.status(400).json({ error: "Invalid deviceId" }); return;
  }

  const devices = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
  if (devices.length === 0) { res.status(404).json({ error: "Device not found" }); return; }
  const device = devices[0]!;
  const password = decryptPassword(device.passwordEncrypted);

  const entries = await getNetwatchEntries(device.host, device.port, device.username, password);
  const now = new Date();
  let added = 0, updated = 0;

  for (const entry of entries) {
    if (!entry.mikrotikId) continue;
    const existing = await db.select().from(netwatchEntriesTable)
      .where(and(
        eq(netwatchEntriesTable.deviceId, device.id),
        eq(netwatchEntriesTable.mikrotikId, entry.mikrotikId),
      )).limit(1);

    if (existing.length === 0) {
      await db.insert(netwatchEntriesTable).values({
        deviceId: device.id, mikrotikId: entry.mikrotikId, host: entry.host,
        name: entry.name ?? null, comment: entry.comment ?? null,
        interval: entry.interval, type: entry.type,
        status: entry.status, lastRttMs: entry.rttMs, lastCheckedAt: now,
      });
      added++;
    } else {
      await db.update(netwatchEntriesTable)
        .set({
          host: entry.host, name: entry.name ?? null, comment: entry.comment ?? null,
          interval: entry.interval, type: entry.type,
          status: entry.status, lastRttMs: entry.rttMs, lastCheckedAt: now,
        })
        .where(eq(netwatchEntriesTable.id, existing[0]!.id));
      updated++;
    }
  }

  res.json({ synced: entries.length, added, updated });
});

export default router;
