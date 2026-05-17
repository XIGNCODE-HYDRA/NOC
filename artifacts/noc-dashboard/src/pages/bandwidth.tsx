import { useRoute, Link } from "wouter";
import {
  useGetBandwidthAggregate,
  useGetLiveBandwidth,
  useListMonitoredInterfaces,
} from "@workspace/api-client-react";
import { useMemo } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Network, ArrowLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Window = "1h" | "24h" | "7d" | "30d";

const WINDOWS: { key: Window; label: string; xFmt: (ts: string) => string }[] = [
  {
    key: "1h",
    label: "1H Graph",
    xFmt: (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  },
  {
    key: "24h",
    label: "24H Graph",
    xFmt: (ts) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  },
  {
    key: "7d",
    label: "7D Graph",
    xFmt: (ts) => {
      const d = new Date(ts);
      return `${d.toLocaleDateString([], { weekday: "short" })} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    },
  },
  {
    key: "30d",
    label: "30D Graph",
    xFmt: (ts) => new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" }),
  },
];

function formatBps(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
  return `${(mbps * 1000).toFixed(1)} Kbps`;
}

function calcStats(data: Array<{ rxMbps: number; txMbps: number; maxRxMbps?: number; maxTxMbps?: number }>) {
  if (!data.length) return { maxRx: 0, maxTx: 0, avgRx: 0, avgTx: 0 };
  const maxRx = Math.max(...data.map(d => d.maxRxMbps ?? d.rxMbps));
  const maxTx = Math.max(...data.map(d => d.maxTxMbps ?? d.txMbps));
  const avgRx = data.reduce((s, d) => s + d.rxMbps, 0) / data.length;
  const avgTx = data.reduce((s, d) => s + d.txMbps, 0) / data.length;
  return { maxRx, maxTx, avgRx, avgTx };
}

function MrtgPanel({
  win,
  interfaceId,
  currentRx,
  currentTx,
}: {
  win: typeof WINDOWS[number];
  interfaceId: number;
  currentRx: number;
  currentTx: number;
}) {
  const { data: raw, isLoading } = useGetBandwidthAggregate(
    { interfaceId, window: win.key },
    { query: { enabled: !!interfaceId, refetchInterval: win.key === "1h" ? 15000 : 60000 } },
  );

  const chartData = useMemo(() => {
    if (!raw) return [];
    return raw.map(d => ({
      ...d,
      label: win.xFmt(d.timestamp),
    }));
  }, [raw, win]);

  const stats = useMemo(() => calcStats(chartData), [chartData]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    return (
      <div className="bg-[#050d12]/95 border border-primary/40 p-2 text-[10px] font-mono shadow-[0_0_20px_rgba(0,245,255,0.15)]">
        <p className="text-primary/70 mb-1 border-b border-primary/20 pb-1">
          {new Date(pt.timestamp).toLocaleString()}
        </p>
        <div className="flex justify-between gap-4">
          <span className="text-[#39ff14]">↓ IN:</span>
          <span className="text-foreground font-bold">{formatBps(pt.rxMbps)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-primary">↑ OUT:</span>
          <span className="text-foreground font-bold">{formatBps(pt.txMbps)}</span>
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-[#050d12] border border-primary/20 relative overflow-hidden">
      {/* Corner marks */}
      <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-primary/60" />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-primary/60" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-primary/60" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-primary/60" />

      <CardHeader className="pb-1 pt-3 px-4 border-b border-primary/10">
        <CardTitle className="text-[11px] font-mono text-primary tracking-widest uppercase flex items-center justify-between">
          <span>{win.label}</span>
          <span className="text-muted-foreground text-[10px]">{chartData.length} pts</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <Activity className="h-6 w-6 text-primary/40 animate-pulse" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-40 flex items-center justify-center border-dashed border border-muted/30 m-3">
            <span className="text-muted-foreground text-[10px] font-mono uppercase">No Data</span>
          </div>
        ) : (
          <div className="h-44 w-full px-1 pt-2 pb-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`rx-${win.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#39ff14" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#39ff14" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id={`tx-${win.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00f5ff" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#00f5ff" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,245,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="rgba(0,245,255,0.2)"
                  fontSize={9}
                  tick={{ fill: "rgba(0,245,255,0.4)", fontFamily: "monospace" }}
                  minTickGap={40}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(0,245,255,0.2)"
                  fontSize={9}
                  tickFormatter={(v) => formatBps(v)}
                  tick={{ fill: "rgba(0,245,255,0.4)", fontFamily: "monospace" }}
                  width={52}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="rxMbps"
                  name="IN"
                  stroke="#39ff14"
                  strokeWidth={1.5}
                  fill={`url(#rx-${win.key})`}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="txMbps"
                  name="OUT"
                  stroke="#00f5ff"
                  strokeWidth={1.5}
                  fill={`url(#tx-${win.key})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* MRTG-style stat table */}
        <div className="grid grid-cols-3 border-t border-primary/10 text-[9px] font-mono">
          {[
            { label: "Max", rx: stats.maxRx, tx: stats.maxTx },
            { label: "Avg", rx: stats.avgRx, tx: stats.avgTx },
            { label: "Cur", rx: currentRx, tx: currentTx },
          ].map(({ label, rx, tx }) => (
            <div key={label} className="flex flex-col border-r border-primary/10 last:border-r-0 px-2 py-1.5">
              <span className="text-muted-foreground uppercase mb-0.5">{label}</span>
              <span className="text-[#39ff14]">↓ {formatBps(rx)}</span>
              <span className="text-primary">↑ {formatBps(tx)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Bandwidth() {
  const [, params] = useRoute("/bandwidth/:interfaceId");
  const interfaceId = params?.interfaceId ? parseInt(params.interfaceId, 10) : 0;

  const { data: monitored } = useListMonitoredInterfaces();
  const ifaceDetails = monitored?.find(i => i.id === interfaceId);

  const { data: liveData } = useGetLiveBandwidth({ query: { refetchInterval: 3000 } });
  const currentLive = liveData?.find(d => d.interfaceId === interfaceId);
  const currentRx = currentLive?.rxMbps ?? 0;
  const currentTx = currentLive?.txMbps ?? 0;

  if (!interfaceId) {
    return <div className="p-8 text-center text-destructive font-mono">TARGET_ID_MISSING</div>;
  }

  return (
    <div className="space-y-5 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <div className="h-8 w-8 rounded border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/20 cursor-pointer transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </div>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text">
              Bandwidth Telemetry
            </h1>
            <div className="text-xs text-muted-foreground flex items-center mt-1">
              <Network className="h-3 w-3 mr-1" />
              {ifaceDetails
                ? `${ifaceDetails.deviceName} // ${ifaceDetails.interfaceName}`
                : "LOADING_METADATA..."}
            </div>
          </div>
        </div>

        {ifaceDetails && (
          <div className="flex space-x-2">
            <Badge variant="outline" className="border-primary text-primary bg-primary/5 uppercase">
              {ifaceDetails.alias}
            </Badge>
            {ifaceDetails.enabled ? (
              <Badge variant="outline" className="border-chart-2 text-chart-2 bg-chart-2/10 uppercase">
                <div className="h-1.5 w-1.5 rounded-full status-pulse-online mr-2" />ACTIVE
              </Badge>
            ) : (
              <Badge variant="outline" className="border-muted text-muted-foreground bg-muted/10 uppercase">
                SUSPENDED
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Live stat row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-[#050d12] border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#39ff14] shadow-[0_0_10px_#39ff14]" />
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center">
              <ArrowDownRight className="h-3 w-3 mr-1 text-[#39ff14]" /> Live RX (Ingress)
            </div>
            <div className="text-3xl font-bold font-mono text-[#39ff14] tracking-wider" style={{ textShadow: "0 0 10px #39ff14" }}>
              {formatBps(currentRx)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#050d12] border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary shadow-[0_0_10px_#00f5ff]" />
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center">
              <ArrowUpRight className="h-3 w-3 mr-1 text-primary" /> Live TX (Egress)
            </div>
            <div className="text-3xl font-bold font-mono text-primary tracking-wider glow-text">
              {formatBps(currentTx)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#050d12] border-primary/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-chart-4" />
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase mb-1">Threshold</div>
            <div className="text-xl font-bold font-mono text-foreground">
              {ifaceDetails?.thresholdMbps ? `${ifaceDetails.thresholdMbps} Mbps` : "UNLIMITED"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-[11px] font-mono text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-[#39ff14] shadow-[0_0_4px_#39ff14]" />
          <span className="text-[#39ff14]">↓ IN (RX)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-primary shadow-[0_0_4px_#00f5ff]" />
          <span className="text-primary">↑ OUT (TX)</span>
        </div>
        <span className="ml-auto text-[10px]">All graphs show averaged data per bucket interval</span>
      </div>

      {/* 2×2 MRTG chart grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {WINDOWS.map(win => (
          <MrtgPanel
            key={win.key}
            win={win}
            interfaceId={interfaceId}
            currentRx={currentRx}
            currentTx={currentTx}
          />
        ))}
      </div>
    </div>
  );
}
