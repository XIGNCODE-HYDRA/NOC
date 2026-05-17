import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const eventLogTable = pgTable("event_log", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  deviceName: text("device_name"),
  host: text("host"),
  interfaceName: text("interface_name"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EventLogRow = typeof eventLogTable.$inferSelect;
