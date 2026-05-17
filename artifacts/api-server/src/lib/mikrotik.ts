import net from "net";
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

export interface PingResult {
  latencyMs: number | null;
  success: boolean;
}

function safeConnect(
  host: string,
  port: number,
  username: string,
  password: string,
): RouterOSAPI {
  const conn = new RouterOSAPI({ host, port, user: username, password, timeout: 5 });
  // Attach an error listener immediately so any 'error' event before .connect()
  // resolves doesn't crash the process with an unhandled exception.
  conn.on("error", (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug({ host, port, err: msg }, "RouterOSAPI background error");
  });
  return conn;
}

export async function measurePing(host: string, port: number): Promise<PingResult> {
  return new Promise(resolve => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(3000);

    const done = (success: boolean) => {
      socket.destroy();
      resolve({ latencyMs: success ? Date.now() - start : null, success });
    };

    socket.connect(port, host, () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

export async function testConnection(
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<{ success: boolean; message: string; routerOsVersion?: string; identity?: string }> {
  const conn = safeConnect(host, port, username, password);
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
  const conn = safeConnect(host, port, username, password);
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

/**
 * Parse RouterOS RTT strings like "1ms100us", "500us", "2ms", "0s" into milliseconds.
 * RouterOS may also return plain numeric strings (microseconds).
 */
function parseRttMs(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (s === "0" || s === "0s") return null;

  // Plain numeric → microseconds
  if (/^\d+$/.test(s)) {
    const us = Number(s);
    return us > 0 ? us / 1000 : null;
  }

  // e.g. "1ms100us", "200us", "3ms", "1s200ms"
  let totalMs = 0;
  const re = /(\d+(?:\.\d+)?)\s*(s|ms|us)/g;
  let m: RegExpExecArray | null;
  let found = false;
  while ((m = re.exec(s)) !== null) {
    found = true;
    const val = parseFloat(m[1]);
    switch (m[2]) {
      case "s":  totalMs += val * 1000; break;
      case "ms": totalMs += val; break;
      case "us": totalMs += val / 1000; break;
    }
  }
  return found && totalMs > 0 ? totalMs : null;
}

export interface NetwatchEntry {
  mikrotikId: string;
  host: string;
  name?: string;
  comment?: string;
  interval: string;
  type: string;
  status: "up" | "down" | "unknown";
  rttMs: number | null;
  rttMinMs: number | null;
  rttMaxMs: number | null;
  lossPercent: number;
}

export async function getNetwatchEntries(
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<NetwatchEntry[]> {
  const conn = safeConnect(host, port, username, password);
  try {
    await conn.connect();
    const result = await conn.write("/tool/netwatch/print");
    await conn.close();
    return result.map((e: Record<string, unknown>) => ({
      mikrotikId: String(e[".id"] ?? ""),
      host: String(e["host"] ?? ""),
      name: e["name"] ? String(e["name"]) : undefined,
      comment: e["comment"] ? String(e["comment"]) : undefined,
      interval: String(e["interval"] ?? "00:00:10"),
      type: String(e["type"] ?? "icmp"),
      status: e["status"] === "up" ? "up" : e["status"] === "down" ? "down" : "unknown",
      rttMs: parseRttMs(e["rtt-avg"] ?? e["rtt"] ?? e["last-rtt"]),
      rttMinMs: parseRttMs(e["rtt-min"]),
      rttMaxMs: parseRttMs(e["rtt-max"]),
      lossPercent: Number(e["loss-percent"] ?? 0),
    }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ host, port, err: msg }, "Failed to fetch Netwatch entries");
    try { await conn.close(); } catch { /* ignore */ }
    return [];
  }
}

export async function addNetwatchEntry(
  host: string,
  port: number,
  username: string,
  password: string,
  params: { targetHost: string; interval: string; type: string; comment?: string },
): Promise<string> {
  const conn = safeConnect(host, port, username, password);
  try {
    await conn.connect();
    const args = [
      `=host=${params.targetHost}`,
      `=interval=${params.interval}`,
      `=type=${params.type}`,
    ];
    if (params.comment) args.push(`=comment=${params.comment}`);
    await conn.write("/tool/netwatch/add", args);
    // Fetch the newly created entry to get its .id
    const result = await conn.write("/tool/netwatch/print", [`?host=${params.targetHost}`]);
    await conn.close();
    return String(result[result.length - 1]?.[".id"] ?? "");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ host, port, err: msg }, "Failed to add Netwatch entry");
    try { await conn.close(); } catch { /* ignore */ }
    throw new Error(`Failed to add Netwatch entry: ${msg}`);
  }
}

export async function removeNetwatchEntry(
  host: string,
  port: number,
  username: string,
  password: string,
  mikrotikId: string,
): Promise<void> {
  const conn = safeConnect(host, port, username, password);
  try {
    await conn.connect();
    await conn.write("/tool/netwatch/remove", [`=.id=${mikrotikId}`]);
    await conn.close();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ host, port, err: msg }, "Failed to remove Netwatch entry");
    try { await conn.close(); } catch { /* ignore */ }
    throw new Error(`Failed to remove Netwatch entry: ${msg}`);
  }
}

export async function getBandwidth(
  host: string,
  port: number,
  username: string,
  password: string,
  interfaceName: string,
): Promise<BandwidthStats> {
  const conn = safeConnect(host, port, username, password);
  try {
    await conn.connect();
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
