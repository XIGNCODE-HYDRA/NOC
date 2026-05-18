import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();
router.use(requireAuth);

const UPLOADS_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `logo${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

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
    logoUrl: settings?.logoFilename ? `/api/uploads/${settings.logoFilename}` : null,
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

router.post("/settings/logo", requireAdmin, (req, res): void => {
  logoUpload.single("logo")(req, res, async (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Upload failed" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const filename = req.file.filename;
    const existing = await getSettings();
    if (existing) {
      await db.update(settingsTable).set({ logoFilename: filename }).where(eq(settingsTable.id, 1));
    } else {
      await db.insert(settingsTable).values({ id: 1, logoFilename: filename });
    }
    res.json({ ok: true, logoUrl: `/api/uploads/${filename}` });
  });
});

router.delete("/settings/logo", requireAdmin, async (_req, res): Promise<void> => {
  const settings = await getSettings();
  if (settings?.logoFilename) {
    const filepath = path.join(UPLOADS_DIR, settings.logoFilename);
    try { fs.unlinkSync(filepath); } catch { /* already gone */ }
  }
  await db.update(settingsTable).set({ logoFilename: null }).where(eq(settingsTable.id, 1));
  res.json({ ok: true });
});

export default router;
