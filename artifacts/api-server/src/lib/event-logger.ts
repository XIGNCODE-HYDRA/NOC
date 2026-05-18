import { db, eventLogTable, settingsTable } from "@workspace/db";
import { desc, eq, lt } from "drizzle-orm";
import { logger } from "./logger";

export type EventType = "timeout" | "low_bandwidth" | "recovery" | "system_down";

const EVENT_EMOJI: Record<EventType, string> = {
  timeout: "🔴",
  system_down: "⛔",
  low_bandwidth: "⚠️",
  recovery: "✅",
};

async function sendTelegram(message: string): Promise<void> {
  try {
    const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
    const settings = rows[0];
    if (!settings?.telegramBotToken || !settings?.telegramChatId) return;

    const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text: message,
        parse_mode: "Markdown",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ body }, "Telegram notification failed");
    }
  } catch (err) {
    logger.warn({ err }, "Telegram send error");
  }
}

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

  // Send Telegram notification (fire-and-forget)
  const emoji = EVENT_EMOJI[params.type];
  const lines = [
    `${emoji} *NOC Alert — ${params.type.replace("_", " ").toUpperCase()}*`,
    `📋 ${params.message}`,
  ];
  if (params.deviceName) lines.push(`🖥 Device: \`${params.deviceName}\``);
  if (params.host) lines.push(`🌐 Host: \`${params.host}\``);
  sendTelegram(lines.join("\n")).catch(() => {});
}
