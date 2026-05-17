import { pgTable, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { monitoredInterfacesTable } from "./monitored_interfaces";

export const bandwidthHistoryTable = pgTable("bandwidth_history", {
  id: serial("id").primaryKey(),
  interfaceId: integer("interface_id").notNull().references(() => monitoredInterfacesTable.id, { onDelete: "cascade" }),
  rxBps: real("rx_bps").notNull().default(0),
  txBps: real("tx_bps").notNull().default(0),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBandwidthHistorySchema = createInsertSchema(bandwidthHistoryTable).omit({ id: true });
export type InsertBandwidthHistory = z.infer<typeof insertBandwidthHistorySchema>;
export type BandwidthHistory = typeof bandwidthHistoryTable.$inferSelect;
