import { useState } from "react";
import {
  useListNetwatchEntries,
  useGetNetwatchLive,
  useGetNetwatchHistory,
  useAddNetwatchEntry,
  useDeleteNetwatchEntry,
  useSyncNetwatchEntries,
  useListDevices,
} from "@workspace/api-client-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Shield, Trash2, Plus, RefreshCw, Activity, ChevronDown, ChevronUp } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rttColor(ms: number | null | undefined, status: string): string {
  if (status === "down" || ms == null) return "#ef4444";
  if (ms < 5) return "#39ff14";
  if (ms < 20) return "#00f5ff";
  if (ms < 100) return "#f59e0b";
  return "#ef4444";
}

function StatusBadge({ status, rttMs }: { status: string; rttMs?: number | null }) {
  if (status === "up") {
    const color = rttColor(rttMs, "up");
    return (
      <Badge
        variant="outline"
        style={{ borderColor: `${color}60`, color, backgroundColor: `${color}10` }}
        className="font-mono text-xs uppercase"
      >
        ▲ UP {rttMs != null ? `· ${rttMs.toFixed(2)} ms` : ""}
      </Badge>
    );
  }
  if (status === "down") {
    return (
      <Badge variant="outline" className="border-destructive/60 text-destructive bg-destructive/10 font-mono text-xs uppercase">
        ▼ DOWN
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-muted/60 text-muted-foreground font-mono text-xs uppercase">
      ? UNKNOWN
    </Badge>
  );
}

// ─── History Chart ────────────────────────────────────────────────────────────

function NetwatchHistoryChart({ entryId, host }: { entryId: number; host: string }) {
  const { data, isLoading } = useGetNetwatchHistory(
    { entryId, hours: 24 },
    { query: { refetchInterval: 60_000 } },
  );

  const points = data?.points ?? [];
  const stats = data?.stats;

  const chartData = points.map(p => ({
    time: new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    fullTime: new Date(p.timestamp).toLocaleString(),
    rttMs: p.status === "up" ? (p.rttMs ?? null) : null,
    down: p.status === "down" ? 0 : null,
    status: p.status,
  }));

  const liveEntry = data?.stats;
  const color = rttColor(stats?.avgMs, points.at(-1)?.status ?? "unknown");

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const pt = payload[0].payload;
    return (
      <div className="bg-[#050d12]/95 border border-primary/40 p-2 text-[10px] font-mono">
        <p className="text-primary/70 mb-1">{pt.fullTime}</p>
        {pt.rttMs != null
          ? <p style={{ color: rttColor(pt.rttMs, "up") }}>{pt.rttMs.toFixed(2)} ms</p>
          : <p className="text-destructive">DOWN / TIMEOUT</p>}
      </div>
    );
  };

  if (isLoading) return (
    <div className="h-28 flex items-center justify-center">
      <Activity className="h-4 w-4 text-primary/40 animate-pulse" />
    </div>
  );

  return (
    <div>
      {chartData.length === 0 ? (
        <div className="h-28 flex items-center justify-center text-[10px] font-mono text-muted-foreground uppercase">
          Waiting for data…
        </div>
      ) : (
        <div className="h-28 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 2, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${entryId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(0,245,255,0.04)" vertical={false} />
              <XAxis
                dataKey="time"
                stroke="rgba(0,245,255,0.15)"
                fontSize={8}
                tick={{ fill: "rgba(0,245,255,0.3)", fontFamily: "monospace" }}
                minTickGap={60}
                tickLine={false}
              />
              <YAxis
                stroke="rgba(0,245,255,0.15)"
                fontSize={8}
                tickFormatter={v => `${v}ms`}
                tick={{ fill: "rgba(0,245,255,0.3)", fontFamily: "monospace" }}
                width={38}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="rttMs"
                stroke={color}
                strokeWidth={1.5}
                fill={`url(#grad-${entryId})`}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
                style={{ filter: `drop-shadow(0 0 3px ${color})` }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 border-t border-primary/10 text-[9px] font-mono mt-1">
        {[
          { label: "Min", value: stats?.minMs != null ? `${stats.minMs.toFixed(2)}ms` : "—" },
          { label: "Avg", value: stats?.avgMs != null ? `${stats.avgMs.toFixed(2)}ms` : "—" },
          { label: "Max", value: stats?.maxMs != null ? `${stats.maxMs.toFixed(2)}ms` : "—" },
          { label: "Loss", value: stats != null ? `${stats.packetLoss.toFixed(1)}%` : "—", alert: (stats?.packetLoss ?? 0) > 5 },
        ].map(({ label, value, alert }) => (
          <div key={label} className="flex flex-col border-r border-primary/10 last:border-r-0 px-2 py-1.5">
            <span className="text-muted-foreground uppercase mb-0.5">{label}</span>
            <span className={alert ? "text-destructive" : "text-foreground"}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Entry Card ───────────────────────────────────────────────────────────────

function NetwatchCard({
  entry,
  onDelete,
}: {
  entry: {
    id: number; deviceId: number; deviceName: string; host: string;
    name?: string | null; comment?: string | null; interval: string; type: string;
    status: string; lastRttMs?: number | null; rttMs?: number | null;
    rttMinMs?: number | null; rttMaxMs?: number | null; lossPercent?: number | null;
    lastCheckedAt?: string | null;
  };
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const currentRtt = entry.rttMs ?? entry.lastRttMs;
  const color = rttColor(currentRtt, entry.status);
  const displayName = entry.name ?? entry.host;
  const subtitle = entry.name ? entry.host : null;

  return (
    <Card className="bg-[#050d12] border border-primary/20 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
      <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-primary/30" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-primary/30" />

      <CardHeader className="pb-2 border-b border-primary/10">
        <CardTitle className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-foreground font-bold truncate">{displayName}</span>
              {entry.comment && (
                <span className="text-[10px] text-muted-foreground font-mono truncate">// {entry.comment}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {subtitle && <span className="text-[10px] text-primary/40 font-mono">{subtitle}</span>}
              <span className="text-[10px] text-primary/50 font-mono">{entry.deviceName}</span>
              <span className="text-[10px] text-muted-foreground font-mono uppercase">{entry.type} · {entry.interval}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={entry.status} rttMs={currentRtt} />
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(entry.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>

      {/* Live quick stats strip */}
      {(entry.rttMinMs != null || entry.rttMaxMs != null || entry.lossPercent != null) && (
        <div className="grid grid-cols-3 border-b border-primary/10 text-[9px] font-mono">
          {[
            { label: "Min RTT", value: entry.rttMinMs != null ? `${entry.rttMinMs.toFixed(2)}ms` : "—" },
            { label: "Max RTT", value: entry.rttMaxMs != null ? `${entry.rttMaxMs.toFixed(2)}ms` : "—" },
            { label: "Loss %", value: entry.lossPercent != null ? `${entry.lossPercent.toFixed(1)}%` : "—", alert: (entry.lossPercent ?? 0) > 5 },
          ].map(({ label, value, alert }) => (
            <div key={label} className="flex flex-col border-r border-primary/10 last:border-r-0 px-2 py-1">
              <span className="text-muted-foreground uppercase mb-0.5">{label}</span>
              <span className={alert ? "text-destructive" : "text-foreground"}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <CardContent className="p-0">
          <NetwatchHistoryChart entryId={entry.id} host={displayName} />
        </CardContent>
      )}
    </Card>
  );
}

// ─── Add Entry Dialog ─────────────────────────────────────────────────────────

function AddEntryDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [host, setHost] = useState("");
  const [interval, setInterval] = useState("00:00:10");
  const [type, setType] = useState("icmp");
  const [comment, setComment] = useState("");

  const { data: devices } = useListDevices();
  const addMutation = useAddNetwatchEntry();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceId || !host) return;
    try {
      await addMutation.mutateAsync({
        data: {
          deviceId: Number(deviceId),
          host,
          interval,
          type,
          comment: comment || undefined,
        },
      });
      toast.success(`Netwatch entry added for ${host}`);
      setOpen(false);
      setHost("");
      setComment("");
      onAdded();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add entry");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="font-mono text-xs bg-primary/10 border border-primary/40 text-primary hover:bg-primary/20">
          <Plus className="h-4 w-4 mr-1.5" /> Add Entry
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#050d12] border border-primary/40 text-foreground font-mono max-w-md">
        <DialogHeader>
          <DialogTitle className="text-primary glow-text uppercase tracking-widest text-sm">
            Add Netwatch Entry
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Device</Label>
            <Select value={deviceId} onValueChange={setDeviceId}>
              <SelectTrigger className="bg-card border-primary/30 font-mono text-sm">
                <SelectValue placeholder="Select a device…" />
              </SelectTrigger>
              <SelectContent className="bg-[#050d12] border-primary/30 font-mono">
                {devices?.map(d => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name} ({d.host})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Host / IP</Label>
            <Input
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="8.8.8.8 or hostname"
              className="bg-card border-primary/30 font-mono text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="bg-card border-primary/30 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#050d12] border-primary/30 font-mono">
                  <SelectItem value="icmp">ICMP (Ping)</SelectItem>
                  <SelectItem value="tcp-conn">TCP Connect</SelectItem>
                  <SelectItem value="http-get">HTTP GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Interval</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger className="bg-card border-primary/30 font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#050d12] border-primary/30 font-mono">
                  <SelectItem value="00:00:05">5 seconds</SelectItem>
                  <SelectItem value="00:00:10">10 seconds</SelectItem>
                  <SelectItem value="00:00:30">30 seconds</SelectItem>
                  <SelectItem value="00:01:00">1 minute</SelectItem>
                  <SelectItem value="00:05:00">5 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Comment (optional)</Label>
            <Input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="e.g. Google DNS"
              className="bg-card border-primary/30 font-mono text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-primary/10">
            <Button type="button" variant="ghost" size="sm" className="font-mono text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={addMutation.isPending || !deviceId || !host}
              className="font-mono text-xs bg-primary text-background hover:bg-primary/80"
            >
              {addMutation.isPending ? "Adding…" : "Add to MikroTik"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Netwatch() {
  const queryClient = useQueryClient();
  const { data: entries, isLoading, refetch } = useListNetwatchEntries({ query: { refetchInterval: 30_000 } });
  const { data: live } = useGetNetwatchLive({ query: { refetchInterval: 30_000 } });
  const deleteMutation = useDeleteNetwatchEntry();
  const syncMutation = useSyncNetwatchEntries();
  const { data: devices } = useListDevices();

  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Merge live data into entries for up-to-date status
  const liveMap = new Map((live ?? []).map(e => [e.id, e]));
  const merged = (entries ?? []).map(e => {
    const liveEntry = liveMap.get(e.id);
    return liveEntry ? { ...e, status: liveEntry.status, lastRttMs: liveEntry.rttMs } : e;
  });

  const upCount = merged.filter(e => e.status === "up").length;
  const downCount = merged.filter(e => e.status === "down").length;

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this Netwatch entry from MikroTik and the dashboard?")) return;
    setDeletingId(id);
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Netwatch entry removed");
      void refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to remove entry");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSync = async (deviceId: number, deviceName: string) => {
    try {
      const result = await syncMutation.mutateAsync({ deviceId });
      toast.success(`Synced ${result.synced} entries from ${deviceName} (${result.added} new, ${result.updated} updated)`);
      void refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Sync failed");
    }
  };

  // Group by device
  const byDevice = merged.reduce<Record<number, typeof merged>>((acc, e) => {
    (acc[e.deviceId] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="space-y-6 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text flex items-center gap-2">
            <Eye className="h-6 w-6" /> Netwatch Monitor
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            MikroTik Tools › Netwatch · polled every 30s · 30-day history
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status summary */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground border border-primary/20 px-3 py-2 bg-primary/5">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-[#39ff14] shadow-[0_0_4px_#39ff14]" />
              <span className="text-[#39ff14] font-bold">{upCount}</span>
              <span>up</span>
            </div>
            <span className="text-primary/20">|</span>
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <span className="text-destructive font-bold">{downCount}</span>
              <span>down</span>
            </div>
            <span className="text-primary/20">|</span>
            <span>{merged.length} total</span>
          </div>

          <AddEntryDialog onAdded={() => void refetch()} />
        </div>
      </div>

      {/* Sync buttons per device */}
      {devices && devices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {devices.map(d => (
            <Button
              key={d.id}
              variant="ghost"
              size="sm"
              onClick={() => handleSync(d.id, d.name)}
              disabled={syncMutation.isPending}
              className="font-mono text-xs border border-primary/20 text-muted-foreground hover:text-primary hover:border-primary/40"
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Sync from {d.name}
            </Button>
          ))}
        </div>
      )}

      {/* RTT legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        {[
          { color: "#39ff14", label: "< 5ms — Excellent" },
          { color: "#00f5ff", label: "5–20ms — Good" },
          { color: "#f59e0b", label: "20–100ms — Fair" },
          { color: "#ef4444", label: "> 100ms / Down" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: `${color}25`, border: `1px solid ${color}` }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 bg-card border border-primary/20" />)}
        </div>
      ) : merged.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border border-dashed border-primary/20 text-muted-foreground">
          <Shield className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-sm uppercase tracking-widest">No Netwatch Entries</p>
          <p className="text-xs mt-2 text-center max-w-xs">
            Add entries via the button above, or click "Sync from [Device]" to import existing Netwatch rules from your MikroTik router.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDevice).map(([deviceId, deviceEntries]) => (
            <div key={deviceId}>
              <div className="text-[10px] font-mono uppercase tracking-widest text-primary/60 mb-2 border-b border-primary/10 pb-1">
                {deviceEntries[0]?.deviceName} — {deviceEntries.length} entries
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {deviceEntries.map(entry => (
                  <NetwatchCard
                    key={entry.id}
                    entry={entry}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
