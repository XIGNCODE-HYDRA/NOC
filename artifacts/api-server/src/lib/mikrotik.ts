import { RouterOSAPI } from "node-routeros";
import { logger } from "./logger";

export interface MikroTikInterface {
  name: string;
  type: string;
  running: boolean;
  disabled: boolean;
  comment?: string;
  macAddress?: string;
}

export interface BandwidthStats {
  rxBps: number;
  txBps: number;
}

export async function testConnection(
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<{ success: boolean; message: string; routerOsVersion?: string; identity?: string }> {
  const conn = new RouterOSAPI({ host, port, user: username, password, timeout: 5 });
  try {
    await conn.connect();
    const [identityResult, resourceResult] = await Promise.all([
      conn.write("/system/identity/print"),
      conn.write("/system/resource/print"),
    ]);
    await conn.close();
    const identity = identityResult[0]?.name as string | undefined;
    const version = resourceResult[0]?.["version"] as string | undefined;
    return { success: true, message: "Connection successful", identity, routerOsVersion: version };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ host, port, err: msg }, "MikroTik connection test failed");
    try { await conn.close(); } catch { /* ignore */ }
    return { success: false, message: msg };
  }
}

export async function getInterfaces(
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<MikroTikInterface[]> {
  const conn = new RouterOSAPI({ host, port, user: username, password, timeout: 5 });
  try {
    await conn.connect();
    const result = await conn.write("/interface/print");
    await conn.close();
    return result.map((iface: Record<string, unknown>) => ({
      name: String(iface.name ?? ""),
      type: String(iface.type ?? "ether"),
      running: iface.running === "true" || iface.running === true,
      disabled: iface.disabled === "true" || iface.disabled === true,
      comment: iface.comment ? String(iface.comment) : undefined,
      macAddress: iface["mac-address"] ? String(iface["mac-address"]) : undefined,
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ host, port, err: msg }, "Failed to fetch MikroTik interfaces");
    try { await conn.close(); } catch { /* ignore */ }
    throw new Error(`Failed to connect to device: ${msg}`);
  }
}

export async function getBandwidth(
  host: string,
  port: number,
  username: string,
  password: string,
  interfaceName: string,
): Promise<BandwidthStats> {
  const conn = new RouterOSAPI({ host, port, user: username, password, timeout: 5 });
  try {
    await conn.connect();
    // Get traffic stats using monitor-traffic for 1 second
    const result = await conn.write("/interface/monitor-traffic", [
      `=interface=${interfaceName}`,
      "=once=",
    ]);
    await conn.close();
    const stats = result[0];
    return {
      rxBps: Number(stats?.["rx-bits-per-second"] ?? 0),
      txBps: Number(stats?.["tx-bits-per-second"] ?? 0),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug({ host, interfaceName, err: msg }, "Failed to get bandwidth stats");
    try { await conn.close(); } catch { /* ignore */ }
    return { rxBps: 0, txBps: 0 };
  }
}
