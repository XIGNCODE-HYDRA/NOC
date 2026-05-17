import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { hashPassword } from "../lib/crypto";

const router = Router();
router.use(requireAuth);

router.get("/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db
    .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt })
    .from(usersTable);
  res.json(users.map(u => ({ ...u, createdAt: u.createdAt.toISOString() })));
});

router.post("/users", requireAdmin, async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password || username.trim().length < 2 || password.length < 6) {
    res.status(400).json({ error: "Username (min 2 chars) and password (min 6 chars) required" });
    return;
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username.trim()));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [created] = await db.insert(usersTable).values({
    username: username.trim(),
    passwordHash,
    role: "support",
  }).returning({ id: usersTable.id, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt });
  res.status(201).json({ ...created, createdAt: created!.createdAt.toISOString() });
});

router.delete("/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (id === req.session.userId) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.status(204).end();
});

export default router;
