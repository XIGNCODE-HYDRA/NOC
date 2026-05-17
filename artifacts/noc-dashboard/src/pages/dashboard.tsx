import { useEffect, useState, useCallback } from "react";
import {
  useGetDashboardSummary,
  useGetTopInterfaces,
  useGetLiveBandwidth,
  useGetNetwatchLive,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Server, Network, Activity, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Wifi, WifiOff,
  Trash2, Radio,
} from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const MANILA_TZ = "Asia/Manila";

function formatMbps(mbps: number) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  return `${mbps.toFixed(2)} Mbps`;
}

function formatRtt(ms: number | null | undefined) {
  if (ms == null) return "—";
  return `${ms.toFixed(1)} ms`;
}

function toManilaString(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

// ─── Event log types ──────────────────────────────────────────────────────────
interface EventEntry {
  id: number;
  type: string;
  message: string;
  deviceName: string | null;
  host: string | null;
  interfaceName: string | null;
  recordedAt: string;
}

function eventTypeColor(type: string) {
  if (type === "timeout") return "text-red-400 border-red-500/40 bg-red-500/10";
  if (type === "low_bandwidth") return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";
  if (type === "recovery") return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  return "text-muted-foreground border-muted/30 bg-muted/10";
}

function eventTypeLabel(type: string) {
  if (type === "timeout") return "TIMEOUT";
  if (type === "low_bandwidth") return "LOW BW";
  if (type === "recovery") return "RECOVERY";
  return type.toUpperCase();
}

// ─── Big Clock ────────────────────────────────────────────────────────────────
function LiveClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString("en-PH", {
    timeZone: MANILA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const date = now.toLocaleDateString("en-PH", {
    timeZone: MANILA_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col items-end select-none">
      <div className="text-5xl font-bold font-mono text-primary glow-text tracking-widest tabular-nums">
        {time}
      </div>
      <div className="text-sm font-mono text-muted-foreground tracking-widest uppercase mt-1">
        {date} &bull; PHT
      </div>
    </div>
  );
}

// ─── Summary Card ─────────────────────────────────────────────────────────────
function SummaryCard({
  title, value, icon: Icon, subValue, trend,
}: {
  title: string; value: string | number; icon: any;
  subValue?: string; trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="bg-card/60 backdrop-blur-sm border-primary/20 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Icon className="h-16 w-16 text-primary" />
      </div>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-mono font-medium text-muted-foreground uppercase tracking-widest">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold font-mono text-foreground glow-text">
          {value}
        </div>
        {subValue && (
          <p className="text-xs font-mono text-muted-foreground mt-1 flex items-center">
            {trend === "up" && <ArrowUpRight className="h-3 w-3 mr-1 text-chart-2" />}
            {trend === "down" && <ArrowDownRight className="h-3 w-3 mr-1 text-chart-5" />}
            {subValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Netwatch Strip ───────────────────────────────────────────────────────────
function NetwatchStrip() {
  const { data: entries } = useGetNetwatchLive({ query: { refetchInterval: 3000 } });

  if (!entries || entries.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-mono text-primary uppercase tracking-widest flex items-center gap-2">
        <Radio className="h-3.5 w-3.5" />
        Netwatch Probes
        <span className="text-muted-foreground">— {entries.length} probe{entries.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {entries.map(entry => {
          const isUp = entry.status === "up";
          const statusColor = isUp ? "text-emerald-400" : "text-red-400";
          const borderColor = isUp ? "border-emerald-500/20" : "border-red-500/30";
          const bgGlow = isUp
            ? "shadow-[inset_0_0_20px_rgba(16,185,129,0.04)]"
            : "shadow-[inset_0_0_20px_rgba(239,68,68,0.06)]";
          const IconComp = isUp ? Wifi : WifiOff;

          return (
            <Card
              key={entry.id}
              className={`bg-card/60 backdrop-blur-sm ${borderColor} ${bgGlow} relative overflow-hidden group`}
            >
              {/* Big faded icon in corner */}
              <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <IconComp className={`h-14 w-14 ${statusColor}`} />
              </div>

              <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0 pt-4 px-4">
                <CardTitle className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-widest truncate pr-2">
                  {entry.name || entry.host}
                </CardTitle>
                <IconComp className={`h-4 w-4 flex-shrink-0 ${statusColor}`} />
              </CardHeader>

              <CardContent className="px-4 pb-4">
                <div className={`text-2xl font-bold font-mono glow-text ${statusColor}`}>
                  {isUp ? "UP" : "DOWN"}
                </div>
                <div className="text-xs font-mono text-muted-foreground mt-1 flex items-center gap-2">
                  <span>RTT {formatRtt(entry.rttMs)}</span>
                  {(entry.lossPercent ?? 0) > 0 && (
                    <span className="text-yellow-400">Loss {entry.lossPercent}%</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Event Log ────────────────────────────────────────────────────────────────
function EventLog() {
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events?limit=50", { credentials: "include" });
      if (res.ok) setEvents(await res.json());
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchEvents();
    const id = setInterval(() => { void fetchEvents(); }, 3000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  const clearAll = async () => {
    await fetch("/api/events", { method: "DELETE", credentials: "include" });
    setEvents([]);
  };

  return (
    <Card className="bg-card/60 backdrop-blur-sm border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono font-medium text-primary uppercase tracking-widest flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" /> Event Log
            {events.length > 0 && (
              <Badge variant="outline" className="ml-2 text-[10px] border-primary/40 text-primary">
                {events.length}
              </Badge>
            )}
          </CardTitle>
          {events.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-red-400"
            >
              <Trash2 className="h-3 w-3 mr-1" /> CLEAR
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 bg-muted/20" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-xs border border-dashed border-muted/40">
            NO EVENTS — ALL SYSTEMS NOMINAL
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {events.map(ev => (
              <div
                key={ev.id}
                className={`flex items-start gap-3 p-2 rounded border text-xs font-mono ${eventTypeColor(ev.type)}`}
              >
                <span className="font-bold whitespace-nowrap text-[10px] mt-0.5 w-16 flex-shrink-0">
                  {eventTypeLabel(ev.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{ev.message}</div>
                  {ev.deviceName && (
                    <div className="text-[10px] opacity-60 mt-0.5">{ev.deviceName}</div>
                  )}
                </div>
                <span className="whitespace-nowrap text-[10px] opacity-60 flex-shrink-0">
                  {toManilaString(ev.recordedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary({ query: { refetchInterval: 3000 } });
  const { data: topInterfaces, isLoading: loadingTop } = useGetTopInterfaces({ query: { refetchInterval: 3000 } });
  const { data: liveBandwidth, isLoading: loadingLive } = useGetLiveBandwidth({ query: { refetchInterval: 3000 } });

  return (
    <div className="space-y-6 font-mono">

      {/* ── Header row: title + big clock ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text flex items-center">
            <Activity className="mr-2 h-6 w-6" /> System Overview
          </h1>
          <div className="flex items-center text-xs text-muted-foreground mt-1">
            <div className="h-2 w-2 rounded-full status-pulse-online mr-2" />
            LIVE FEED ACTIVE — 3s POLL
          </div>
        </div>
        <LiveClock />
      </div>

      {/* ── Netwatch probe strip ── */}
      <NetwatchStrip />

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Traffic IN"
          value={formatMbps(summary?.totalRxMbps ?? 0)}
          icon={ArrowDownRight}
          subValue="Aggregate RX"
          trend="up"
        />
        <SummaryCard
          title="Total Traffic OUT"
          value={formatMbps(summary?.totalTxMbps ?? 0)}
          icon={ArrowUpRight}
          subValue="Aggregate TX"
          trend="up"
        />
        <SummaryCard
          title="Active Devices"
          value={`${summary?.onlineDevices ?? 0} / ${summary?.totalDevices ?? 0}`}
          icon={Server}
          subValue="Nodes Online"
        />
        <SummaryCard
          title="Monitored Links"
          value={`${summary?.activeInterfaces ?? 0} / ${summary?.totalInterfaces ?? 0}`}
          icon={Network}
          subValue="Interfaces Active"
        />
      </div>

      {/* ── Top interfaces + Live telemetry ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Interfaces */}
        <Card className="lg:col-span-1 bg-card/60 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-primary uppercase tracking-widest flex items-center">
              <Activity className="h-4 w-4 mr-2" /> Top Utilized Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingTop && !topInterfaces ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 bg-muted/20" />)}
              </div>
            ) : topInterfaces?.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-xs border border-dashed border-muted">
                NO TRAFFIC DETECTED
              </div>
            ) : (
              <div className="space-y-2">
                {topInterfaces?.map((iface, index) => (
                  <Link key={iface.interfaceId} href={`/bandwidth/${iface.interfaceId}`}>
                    <div className="flex items-center justify-between p-3 rounded bg-secondary/50 border border-transparent hover:border-primary/50 cursor-pointer transition-colors group">
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="font-mono text-xs text-muted-foreground w-4">{index + 1}.</div>
                        <div className="truncate">
                          <div className="text-sm text-foreground font-medium group-hover:text-primary transition-colors truncate">
                            {iface.alias || iface.deviceName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{iface.deviceName}</div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-sm font-bold text-chart-2">↓ {formatMbps(iface.rxMbps)}</div>
                        <div className="text-sm font-bold text-chart-1">↑ {formatMbps(iface.txMbps)}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Bandwidth Grid */}
        <Card className="lg:col-span-2 bg-card/60 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-primary uppercase tracking-widest flex items-center">
              <Network className="h-4 w-4 mr-2" /> Live Node Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingLive && !liveBandwidth ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 bg-muted/20" />)}
              </div>
            ) : liveBandwidth?.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 text-xs border border-dashed border-muted flex flex-col items-center justify-center">
                <Network className="h-8 w-8 mb-2 opacity-20" />
                AWAITING TELEMETRY DATA
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {liveBandwidth?.map(reading => (
                  <Link key={reading.interfaceId} href={`/bandwidth/${reading.interfaceId}`}>
                    <div className="p-4 rounded border border-primary/20 bg-background/50 hover:bg-primary/5 hover:border-primary/50 transition-all cursor-pointer group">
                      <div className="flex justify-between items-start mb-2">
                        <div className="truncate pr-4">
                          <div className="font-bold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                            {reading.alias}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {reading.deviceName} • {reading.interfaceName}
                          </div>
                        </div>
                        <div className="h-2 w-2 rounded-full status-pulse-online flex-shrink-0" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        <div className="bg-secondary/50 p-2 rounded">
                          <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center">
                            <ArrowDownRight className="h-3 w-3 mr-1 text-chart-2" /> RX
                          </div>
                          <div className="text-sm font-bold text-chart-2 font-mono">
                            {formatMbps(reading.rxMbps)}
                          </div>
                        </div>
                        <div className="bg-secondary/50 p-2 rounded">
                          <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center">
                            <ArrowUpRight className="h-3 w-3 mr-1 text-chart-1" /> TX
                          </div>
                          <div className="text-sm font-bold text-chart-1 font-mono">
                            {formatMbps(reading.txMbps)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Event Log ── */}
      <EventLog />
    </div>
  );
}
