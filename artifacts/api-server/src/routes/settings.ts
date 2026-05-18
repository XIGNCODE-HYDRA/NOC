import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth);

async function getSettings() {
  const rows = await db.select().from(settingsTable).where(eq(settingsTable.id, 1)).limit(1);
  return rows[0] ?? null;
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getSettings();
  res.json({
    telegramBotToken: settings?.telegramBotToken ? "••••••••" : null,
    telegramChatId: settings?.telegramChatId ?? null,
    telegramEnabled: !!(settings?.telegramBotToken && settings?.telegramChatId),
  });
});

router.put("/settings", requireAdmin, async (req, res): Promise<void> => {
  const { telegramBotToken, telegramChatId } = req.body as {
    telegramBotToken?: string | null;
    telegramChatId?: string | null;
  };

  const existing = await getSettings();
  if (existing) {
    await db.update(settingsTable)
      .set({
        telegramBotToken: telegramBotToken ?? existing.telegramBotToken,
        telegramChatId: telegramChatId ?? existing.telegramChatId,
      })
      .where(eq(settingsTable.id, 1));
  } else {
    await db.insert(settingsTable).values({
      id: 1,
      telegramBotToken: telegramBotToken ?? null,
      telegramChatId: telegramChatId ?? null,
    });
  }
  res.json({ ok: true });
});

router.delete("/settings/telegram", requireAdmin, async (_req, res): Promise<void> => {
  await db.update(settingsTable)
    .set({ telegramBotToken: null, telegramChatId: null })
    .where(eq(settingsTable.id, 1));
  res.json({ ok: true });
});

router.post("/settings/telegram/test", requireAdmin, async (_req, res): Promise<void> => {
  const settings = await getSettings();
  if (!settings?.telegramBotToken || !settings?.telegramChatId) {
    res.status(400).json({ error: "Telegram not configured" });
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text: "✅ *NOC Dashboard* — Telegram integration is working correctly.",
        parse_mode: "Markdown",
      }),
    });
    const data = await response.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      res.status(400).json({ error: data.description ?? "Telegram API error" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Telegram test failed");
    res.status(500).json({ error: "Failed to reach Telegram API" });
  }
});

export default router;
