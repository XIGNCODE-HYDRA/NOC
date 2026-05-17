import { 
  useGetDashboardSummary, 
  useGetTopInterfaces, 
  useGetLiveBandwidth 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Network, Activity, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip, YAxis } from "recharts";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

function formatMbps(mbps: number) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
  return `${mbps.toFixed(2)} Mbps`;
}

function SummaryCard({ title, value, icon: Icon, subValue, trend }: { title: string, value: string | number, icon: any, subValue?: string, trend?: 'up' | 'down' | 'neutral' }) {
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
        <div className="text-2xl font-bold font-mono text-foreground glow-text" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </div>
        {subValue && (
          <p className="text-xs font-mono text-muted-foreground mt-1 flex items-center">
            {trend === 'up' && <ArrowUpRight className="h-3 w-3 mr-1 text-chart-2" />}
            {trend === 'down' && <ArrowDownRight className="h-3 w-3 mr-1 text-chart-5" />}
            {subValue}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({
    query: { refetchInterval: 5000 }
  });

  const { data: topInterfaces, isLoading: loadingTop } = useGetTopInterfaces({
    query: { refetchInterval: 5000 }
  });

  const { data: liveBandwidth, isLoading: loadingLive } = useGetLiveBandwidth({
    query: { refetchInterval: 3000 }
  });

  if (loadingSummary && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 bg-card border border-primary/20" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 bg-card border border-primary/20" />
          <Skeleton className="h-96 bg-card border border-primary/20" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text flex items-center">
          <Activity className="mr-2 h-6 w-6" /> System Overview
        </h1>
        <div className="flex items-center text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full status-pulse-online mr-2" />
          LIVE FEED ACTIVE
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard 
          title="Total Traffic IN" 
          value={formatMbps(summary?.totalRxMbps || 0)} 
          icon={ArrowDownRight}
          subValue="Aggregate RX"
          trend="up"
        />
        <SummaryCard 
          title="Total Traffic OUT" 
          value={formatMbps(summary?.totalTxMbps || 0)} 
          icon={ArrowUpRight}
          subValue="Aggregate TX"
          trend="up"
        />
        <SummaryCard 
          title="Active Devices" 
          value={`${summary?.onlineDevices || 0} / ${summary?.totalDevices || 0}`} 
          icon={Server}
          subValue="Nodes Online"
        />
        <SummaryCard 
          title="Monitored Links" 
          value={`${summary?.activeInterfaces || 0} / ${summary?.totalInterfaces || 0}`} 
          icon={Network}
          subValue="Interfaces Active"
        />
      </div>

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
              <div className="space-y-4">
                {topInterfaces?.map((iface, index) => (
                  <Link key={iface.interfaceId} href={`/bandwidth/${iface.interfaceId}`}>
                    <div className="flex items-center justify-between p-3 rounded bg-secondary/50 border border-transparent hover:border-primary/50 cursor-pointer transition-colors group mb-2">
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="font-mono text-xs text-muted-foreground w-4">{index + 1}.</div>
                        <div className="truncate">
                          <div className="text-sm text-foreground font-medium group-hover:text-primary transition-colors truncate">
                            {iface.alias || iface.deviceName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {iface.deviceName}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <div className="text-sm font-bold text-chart-2">
                          ↓ {formatMbps(iface.rxMbps)}
                        </div>
                        <div className="text-sm font-bold text-chart-1">
                          ↑ {formatMbps(iface.txMbps)}
                        </div>
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
    </div>
  );
}
