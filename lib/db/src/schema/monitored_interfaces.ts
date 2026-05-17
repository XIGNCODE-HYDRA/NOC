import { pgTable, text, serial, timestamp, integer, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { devicesTable } from "./devices";

export const monitoredInterfacesTable = pgTable("monitored_interfaces", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull().references(() => devicesTable.id, { onDelete: "cascade" }),
  interfaceName: text("interface_name").notNull(),
  alias: text("alias").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  thresholdMbps: real("threshold_mbps"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMonitoredInterfaceSchema = createInsertSchema(monitoredInterfacesTable).omit({ id: true, createdAt: true });
export type InsertMonitoredInterface = z.infer<typeof insertMonitoredInterfaceSchema>;
export type MonitoredInterface = typeof monitoredInterfacesTable.$inferSelect;
