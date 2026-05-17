import { useState } from "react";
import { useGetPingLive, useGetPingHistory, useListDevices } from "@workspace/api-client-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Wifi, WifiOff, Activity } from "lucide-react";

function latencyColor(ms: number | null | undefined): string {
  if (ms == null) return "#ef4444";
  if (ms < 10) return "#39ff14";
  if (ms < 50) return "#00f5ff";
  if (ms < 150) return "#f59e0b";
  return "#ef4444";
}

function LatencyBadge({ ms, success }: { ms: number | null | undefined; success: boolean }) {
  if (!success || ms == null) {
    return (
      <Badge variant="outline" className="border-destructive text-destructive bg-destructive/10 font-mono text-xs uppercase">
        <WifiOff className="h-3 w-3 mr-1" /> Timeout
      </Badge>
    );
  }
  const color = latencyColor(ms);
  return (
    <Badge
      variant="outline"
      style={{ borderColor: `${color}60`, color, backgroundColor: `${color}10` }}
      className="font-mono text-xs"
    >
      <Wifi className="h-3 w-3 mr-1" /> {ms.toFixed(1)} ms
    </Badge>
  );
}

function DevicePingCard({ deviceId, deviceName, host }: { deviceId: number; deviceName: string; host: string }) {
  const { data: pingData } = useGetPingLive({ query: { refetchInterval: 30000 } });
  const devicePing = pingData?.find(d => d.deviceId === deviceId);

  const { data: history, isLoading } = useGetPingHistory(
    { deviceId, hours: 24 },
    { query: { refetchInterval: 60000 } },
  );

  const points = history?.points ?? [];
  const stats = history?.stats;

  const chartData = points.map(p => ({
    time: new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    latencyMs: p.success ? (p.latencyMs ?? null) : null,
    timeout: p.success ? null : 0,
    fullTime: new Date(p.timestamp).toLocaleString(),
  }));

  const successRate = stats ? 100 - (stats.packetLoss ?? 0) : null;
  const color = latencyColor(devicePing?.latencyMs);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    return (
      <div className="bg-[#050d12]/95 border border-primary/40 p-2 text-[10px] font-mono">
        <p className="text-primary/70 mb-1">{pt.fullTime}</p>
        {pt.latencyMs != null ? (
          <p style={{ color: latencyColor(pt.latencyMs) }}>{pt.latencyMs.toFixed(1)} ms</p>
        ) : (
          <p className="text-destructive">TIMEOUT</p>
        )}
      </div>
    );
  };

  return (
    <Card className="bg-[#050d12] border border-primary/20 relative overflow-hidden">
      {/* Colored left bar */}
      <div
        className="absolute top-0 left-0 w-1 h-full"
        style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }}
      />

      {/* Corner marks */}
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-primary/40" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-primary/40" />

      <CardHeader className="pb-2 border-b border-primary/10">
        <CardTitle className="flex items-center justify-between">
          <div>
            <div className="text-sm font-mono text-foreground font-bold">{deviceName}</div>
            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{host}</div>
          </div>
          <LatencyBadge ms={devicePing?.latencyMs} success={devicePing?.success ?? false} />
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {/* Latency chart */}
        {isLoading ? (
          <div className="h-32 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary/40 animate-pulse" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-32 flex items-center justify-center">
            <span className="text-muted-foreground text-[10px] font-mono uppercase">Waiting for data…</span>
          </div>
        ) : (
          <div className="h-36 w-full px-1 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,245,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="rgba(0,245,255,0.2)"
                  fontSize={8}
                  tick={{ fill: "rgba(0,245,255,0.35)", fontFamily: "monospace" }}
                  minTickGap={50}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(0,245,255,0.2)"
                  fontSize={8}
                  tickFormatter={(v) => `${v}ms`}
                  tick={{ fill: "rgba(0,245,255,0.35)", fontFamily: "monospace" }}
                  width={40}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="latencyMs"
                  stroke={color}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  style={{ filter: `drop-shadow(0 0 3px ${color})` }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-4 border-t border-primary/10 text-[9px] font-mono">
          {[
            { label: "Min", value: stats?.minMs != null ? `${stats.minMs.toFixed(1)}ms` : "—" },
            { label: "Avg", value: stats?.avgMs != null ? `${stats.avgMs.toFixed(1)}ms` : "—" },
            { label: "Max", value: stats?.maxMs != null ? `${stats.maxMs.toFixed(1)}ms` : "—" },
            {
              label: "Loss",
              value: stats != null ? `${stats.packetLoss.toFixed(1)}%` : "—",
              alert: (stats?.packetLoss ?? 0) > 5,
            },
          ].map(({ label, value, alert }) => (
            <div key={label} className="flex flex-col border-r border-primary/10 last:border-r-0 px-2 py-1.5">
              <span className="text-muted-foreground uppercase mb-0.5">{label}</span>
              <span className={alert ? "text-destructive" : "text-foreground"}>{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Ping() {
  const { data: devices, isLoading } = useListDevices({ query: { refetchInterval: 30000 } });
  const { data: pingLive } = useGetPingLive({ query: { refetchInterval: 30000 } });

  const onlineCount = pingLive?.filter(p => p.success).length ?? 0;
  const totalCount = devices?.length ?? 0;

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text flex items-center">
            <Radio className="mr-2 h-6 w-6" /> Ping Monitor
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            TCP latency to RouterOS API port (8728) · Polled every 30s
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground border border-primary/20 px-3 py-2 bg-primary/5">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-[#39ff14] shadow-[0_0_4px_#39ff14]" />
            <span className="text-[#39ff14] font-bold">{onlineCount}</span>
            <span>reachable</span>
          </div>
          <span className="text-primary/20">|</span>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-destructive" />
            <span className="text-destructive font-bold">{totalCount - onlineCount}</span>
            <span>unreachable</span>
          </div>
        </div>
      </div>

      {/* Latency key */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        {[
          { color: "#39ff14", label: "< 10ms — Excellent" },
          { color: "#00f5ff", label: "10–50ms — Good" },
          { color: "#f59e0b", label: "50–150ms — Fair" },
          { color: "#ef4444", label: "> 150ms / Timeout — Poor" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `${color}30`, border: `1px solid ${color}` }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Device cards */}
      {isLoading && !devices ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-56 bg-card border border-primary/20" />
          ))}
        </div>
      ) : devices?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-primary/20 text-muted-foreground">
          <Radio className="h-10 w-10 mb-4 opacity-20" />
          <p className="text-sm uppercase tracking-widest">No Devices Configured</p>
          <p className="text-xs mt-2">Add a device from the Devices page to begin ping monitoring.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {devices?.map(device => (
            <DevicePingCard
              key={device.id}
              deviceId={device.id}
              deviceName={device.name}
              host={device.host}
            />
          ))}
        </div>
      )}
    </div>
  );
}
