import { pgTable, serial, integer, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";

export const netwatchEntriesTable = pgTable("netwatch_entries", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  mikrotikId: text("mikrotik_id").notNull(),
  host: text("host").notNull(),
  name: text("name"),
  comment: text("comment"),
  interval: text("interval").notNull().default("00:00:10"),
  type: text("type").notNull().default("icmp"),
  status: text("status").notNull().default("unknown"),
  lastRttMs: real("last_rtt_ms"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const netwatchHistoryTable = pgTable("netwatch_history", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id").notNull().references(() => netwatchEntriesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  rttMs: real("rtt_ms"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNetwatchEntrySchema = createInsertSchema(netwatchEntriesTable).omit({
  id: true, createdAt: true, lastCheckedAt: true, mikrotikId: true,
});
export type InsertNetwatchEntry = z.infer<typeof insertNetwatchEntrySchema>;
export type NetwatchEntry = typeof netwatchEntriesTable.$inferSelect;
export type NetwatchHistory = typeof netwatchHistoryTable.$inferSelect;
