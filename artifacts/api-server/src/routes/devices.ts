import { Router } from "express";
import { db, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateDeviceBody,
  UpdateDeviceBody,
  GetDeviceParams,
  UpdateDeviceParams,
  DeleteDeviceParams,
  TestDeviceConnectionParams,
  ListDeviceInterfacesParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { encryptPassword, decryptPassword } from "../lib/crypto";
import { testConnection, getInterfaces } from "../lib/mikrotik";

const router = Router();

router.use(requireAuth);

router.get("/devices", async (_req, res): Promise<void> => {
  const devices = await db.select({
    id: devicesTable.id,
    name: devicesTable.name,
    host: devicesTable.host,
    port: devicesTable.port,
    username: devicesTable.username,
    status: devicesTable.status,
    lastSeen: devicesTable.lastSeen,
    createdAt: devicesTable.createdAt,
  }).from(devicesTable).orderBy(devicesTable.name);
  res.json(devices.map(d => ({
    ...d,
    lastSeen: d.lastSeen?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  })));
});

router.post("/devices", async (req, res): Promise<void> => {
  const parsed = CreateDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, host, port, username, password } = parsed.data;
  const [device] = await db.insert(devicesTable).values({
    name,
    host,
    port: port ?? 8728,
    username,
    passwordEncrypted: encryptPassword(password),
    status: "unknown",
  }).returning();
  res.status(201).json({
    id: device.id,
    name: device.name,
    host: device.host,
    port: device.port,
    username: device.username,
    status: device.status,
    lastSeen: device.lastSeen?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
  });
});

router.get("/devices/:id", async (req, res): Promise<void> => {
  const params = GetDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [device] = await db.select({
    id: devicesTable.id,
    name: devicesTable.name,
    host: devicesTable.host,
    port: devicesTable.port,
    username: devicesTable.username,
    status: devicesTable.status,
    lastSeen: devicesTable.lastSeen,
    createdAt: devicesTable.createdAt,
  }).from(devicesTable).where(eq(devicesTable.id, params.data.id));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json({
    ...device,
    lastSeen: device.lastSeen?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
  });
});

router.patch("/devices/:id", async (req, res): Promise<void> => {
  const params = UpdateDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateDeviceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof devicesTable.$inferInsert> = {};
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.host) updates.host = parsed.data.host;
  if (parsed.data.port) updates.port = parsed.data.port;
  if (parsed.data.username) updates.username = parsed.data.username;
  if (parsed.data.password) updates.passwordEncrypted = encryptPassword(parsed.data.password);

  const [device] = await db.update(devicesTable).set(updates).where(eq(devicesTable.id, params.data.id)).returning();
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.json({
    id: device.id,
    name: device.name,
    host: device.host,
    port: device.port,
    username: device.username,
    status: device.status,
    lastSeen: device.lastSeen?.toISOString() ?? null,
    createdAt: device.createdAt.toISOString(),
  });
});

router.delete("/devices/:id", async (req, res): Promise<void> => {
  const params = DeleteDeviceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [device] = await db.delete(devicesTable).where(eq(devicesTable.id, params.data.id)).returning();
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/devices/:id/test", async (req, res): Promise<void> => {
  const params = TestDeviceConnectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, params.data.id));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const password = decryptPassword(device.passwordEncrypted);
  const result = await testConnection(device.host, device.port, device.username, password);
  // Update device status based on result
  const newStatus = result.success ? "online" : "offline";
  await db.update(devicesTable).set({
    status: newStatus,
    lastSeen: result.success ? new Date() : undefined,
  }).where(eq(devicesTable.id, device.id));
  res.json({
    success: result.success,
    message: result.message,
    routerOsVersion: result.routerOsVersion ?? null,
    identity: result.identity ?? null,
  });
});

router.get("/devices/:id/interfaces", async (req, res): Promise<void> => {
  const params = ListDeviceInterfacesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, params.data.id));
  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }
  const password = decryptPassword(device.passwordEncrypted);
  try {
    const interfaces = await getInterfaces(device.host, device.port, device.username, password);
    res.json(interfaces.map(iface => ({
      name: iface.name,
      type: iface.type,
      running: iface.running,
      disabled: iface.disabled,
      comment: iface.comment ?? null,
      macAddress: iface.macAddress ?? null,
    })));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: msg });
  }
});

export default router;
