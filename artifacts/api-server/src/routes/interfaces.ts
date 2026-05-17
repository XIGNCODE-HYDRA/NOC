import { Router } from "express";
import { db, monitoredInterfacesTable, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  AddMonitoredInterfaceBody,
  UpdateMonitoredInterfaceBody,
  UpdateMonitoredInterfaceParams,
  RemoveMonitoredInterfaceParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.use(requireAuth);

router.get("/interfaces", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: monitoredInterfacesTable.id,
      deviceId: monitoredInterfacesTable.deviceId,
      deviceName: devicesTable.name,
      interfaceName: monitoredInterfacesTable.interfaceName,
      alias: monitoredInterfacesTable.alias,
      enabled: monitoredInterfacesTable.enabled,
      thresholdMbps: monitoredInterfacesTable.thresholdMbps,
      createdAt: monitoredInterfacesTable.createdAt,
    })
    .from(monitoredInterfacesTable)
    .leftJoin(devicesTable, eq(monitoredInterfacesTable.deviceId, devicesTable.id))
    .orderBy(monitoredInterfacesTable.alias);
  res.json(rows.map(r => ({
    ...r,
    deviceName: r.deviceName ?? "Unknown",
    createdAt: r.createdAt.toISOString(),
    thresholdMbps: r.thresholdMbps ?? null,
  })));
});

router.post("/interfaces", async (req, res): Promise<void> => {
  const parsed = AddMonitoredInterfaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [device] = await db.select({ id: devicesTable.id, name: devicesTable.name })
    .from(devicesTable)
    .where(eq(devicesTable.id, parsed.data.deviceId));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const [row] = await db.insert(monitoredInterfacesTable).values({
    deviceId: parsed.data.deviceId,
    interfaceName: parsed.data.interfaceName,
    alias: parsed.data.alias,
    enabled: parsed.data.enabled ?? true,
    thresholdMbps: parsed.data.thresholdMbps ?? undefined,
  }).returning();
  res.status(201).json({
    id: row.id,
    deviceId: row.deviceId,
    deviceName: device.name,
    interfaceName: row.interfaceName,
    alias: row.alias,
    enabled: row.enabled,
    thresholdMbps: row.thresholdMbps ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.patch("/interfaces/:id", async (req, res): Promise<void> => {
  const params = UpdateMonitoredInterfaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateMonitoredInterfaceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof monitoredInterfacesTable.$inferInsert> = {};
  if (parsed.data.alias != null) updates.alias = parsed.data.alias;
  if (parsed.data.enabled != null) updates.enabled = parsed.data.enabled;
  if (parsed.data.thresholdMbps !== undefined) updates.thresholdMbps = parsed.data.thresholdMbps ?? undefined;

  const [row] = await db.update(monitoredInterfacesTable)
    .set(updates)
    .where(eq(monitoredInterfacesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Monitored interface not found" });
    return;
  }
  const [device] = await db.select({ name: devicesTable.name })
    .from(devicesTable)
    .where(eq(devicesTable.id, row.deviceId));
  res.json({
    id: row.id,
    deviceId: row.deviceId,
    deviceName: device?.name ?? "Unknown",
    interfaceName: row.interfaceName,
    alias: row.alias,
    enabled: row.enabled,
    thresholdMbps: row.thresholdMbps ?? null,
    createdAt: row.createdAt.toISOString(),
  });
});

router.delete("/interfaces/:id", async (req, res): Promise<void> => {
  const params = RemoveMonitoredInterfaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.delete(monitoredInterfacesTable)
    .where(eq(monitoredInterfacesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Monitored interface not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
