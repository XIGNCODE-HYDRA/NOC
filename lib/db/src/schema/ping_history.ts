import { pgTable, serial, timestamp, integer, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";

export const pingHistoryTable = pgTable("ping_history", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  latencyMs: real("latency_ms"),
  success: boolean("success").notNull().default(false),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPingHistorySchema = createInsertSchema(pingHistoryTable).omit({ id: true });
export type InsertPingHistory = z.infer<typeof insertPingHistorySchema>;
export type PingHistoryRow = typeof pingHistoryTable.$inferSelect;
