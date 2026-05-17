import { db, eventLogTable } from "@workspace/db";
import { desc, lt } from "drizzle-orm";

export type EventType = "timeout" | "low_bandwidth" | "recovery" | "system_down";

export async function logEvent(params: {
  type: EventType;
  message: string;
  deviceName?: string;
  host?: string;
  interfaceName?: string;
}): Promise<void> {
  await db.insert(eventLogTable).values({
    type: params.type,
    message: params.message,
    deviceName: params.deviceName ?? null,
    host: params.host ?? null,
    interfaceName: params.interfaceName ?? null,
    recordedAt: new Date(),
  });

  // Keep only 7 days of events
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await db.delete(eventLogTable).where(lt(eventLogTable.recordedAt, cutoff));
}
