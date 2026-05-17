import { useRoute, Link } from "wouter";
import { 
  useGetBandwidthHistory, 
  useGetLiveBandwidth,
  useListMonitoredInterfaces
} from "@workspace/api-client-react";
import { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Network, ArrowLeft, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

function formatMbps(mbps: number) {
  return `${mbps.toFixed(2)}`;
}

export default function Bandwidth() {
  const [, params] = useRoute("/bandwidth/:interfaceId");
  const interfaceId = params?.interfaceId ? parseInt(params.interfaceId, 10) : 0;

  // Get interface details
  const { data: monitored } = useListMonitoredInterfaces();
  const ifaceDetails = monitored?.find(i => i.id === interfaceId);

  // Get history
  const { data: history, isLoading: loadingHistory } = useGetBandwidthHistory(
    { interfaceId, minutes: 60 },
    { query: { enabled: !!interfaceId, refetchInterval: 60000 } } // refresh history every minute
  );

  // Get live data (pulse)
  const { data: liveData } = useGetLiveBandwidth({
    query: { refetchInterval: 3000 }
  });

  const currentLive = liveData?.find(d => d.interfaceId === interfaceId);

  // Merge history with current live data point for smooth chart end
  const chartData = useMemo(() => {
    if (!history) return [];
    
    // Convert timestamps to readable format for X axis
    const formatted = history.map(d => ({
      ...d,
      time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      fullTime: new Date(d.timestamp).toLocaleString()
    }));

    // If we have live data that's newer than the last history point, append it
    if (currentLive && formatted.length > 0) {
      const lastHistoryTime = new Date(formatted[formatted.length - 1].timestamp).getTime();
      const liveTime = new Date(currentLive.timestamp).getTime();
      
      if (liveTime > lastHistoryTime) {
        formatted.push({
          timestamp: currentLive.timestamp,
          rxMbps: currentLive.rxMbps,
          txMbps: currentLive.txMbps,
          time: new Date(currentLive.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          fullTime: new Date(currentLive.timestamp).toLocaleString()
        });
      }
    }

    return formatted;
  }, [history, currentLive]);

  if (!interfaceId) {
    return <div className="p-8 text-center text-destructive font-mono">TARGET_ID_MISSING</div>;
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card/95 border border-primary/30 p-3 shadow-[0_0_15px_rgba(0,0,0,0.5)] font-mono text-xs">
          <p className="text-primary mb-2 border-b border-primary/20 pb-1">{payload[0].payload.fullTime}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex justify-between items-center space-x-4 mb-1">
              <span style={{ color: entry.color }} className="uppercase">{entry.name}:</span>
              <span className="font-bold text-foreground">{formatMbps(entry.value)} Mbps</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 font-mono">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <div className="h-8 w-8 rounded border border-primary/30 flex items-center justify-center text-primary hover:bg-primary/20 cursor-pointer transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </div>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text flex items-center">
              Target Telemetry
            </h1>
            <div className="text-xs text-muted-foreground flex items-center mt-1">
              <Network className="h-3 w-3 mr-1" />
              {ifaceDetails ? `${ifaceDetails.deviceName} // ${ifaceDetails.interfaceName}` : 'LOADING_METADATA...'}
            </div>
          </div>
        </div>
        
        {ifaceDetails && (
          <div className="flex space-x-2">
            <Badge variant="outline" className={`border-primary text-primary bg-primary/5 uppercase`}>
              {ifaceDetails.alias}
            </Badge>
            {ifaceDetails.enabled ? (
              <Badge variant="outline" className="border-chart-2 text-chart-2 bg-chart-2/10 uppercase">
                <div className="h-1.5 w-1.5 rounded-full status-pulse-online mr-2"/>ACTIVE
              </Badge>
            ) : (
              <Badge variant="outline" className="border-muted text-muted-foreground bg-muted/10 uppercase">
                SUSPENDED
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Live Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/60 backdrop-blur-sm border-primary/20 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-1 h-full bg-chart-2 shadow-[0_0_10px_#39ff14]" />
           <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center">
              <ArrowDownRight className="h-3 w-3 mr-1 text-chart-2" /> Live RX (Ingress)
            </div>
            <div className="text-3xl font-bold font-mono text-foreground tracking-wider">
              {currentLive ? formatMbps(currentLive.rxMbps) : '0.00'} <span className="text-sm text-muted-foreground font-normal">Mbps</span>
            </div>
           </CardContent>
        </Card>
        
        <Card className="bg-card/60 backdrop-blur-sm border-primary/20 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-1 h-full bg-chart-1 shadow-[0_0_10px_#00f5ff]" />
           <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground uppercase mb-1 flex items-center">
              <ArrowUpRight className="h-3 w-3 mr-1 text-chart-1" /> Live TX (Egress)
            </div>
            <div className="text-3xl font-bold font-mono text-foreground tracking-wider">
              {currentLive ? formatMbps(currentLive.txMbps) : '0.00'} <span className="text-sm text-muted-foreground font-normal">Mbps</span>
            </div>
           </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur-sm border-primary/20 relative overflow-hidden">
           <div className="absolute top-0 left-0 w-1 h-full bg-chart-4" />
           <CardContent className="p-4 flex flex-col justify-center h-full">
            <div className="text-[10px] text-muted-foreground uppercase mb-1">
              Threshold Configuration
            </div>
            <div className="text-xl font-bold font-mono text-foreground">
              {ifaceDetails?.thresholdMbps ? `${ifaceDetails.thresholdMbps} Mbps` : 'UNLIMITED'}
            </div>
           </CardContent>
        </Card>
      </div>

      {/* Main Chart */}
      <Card className="bg-card/60 backdrop-blur-sm border-primary/20 relative">
        {/* Decorative corner markers */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-primary/50" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-primary/50" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-primary/50" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-primary/50" />
        
        <CardHeader className="border-b border-primary/10 pb-4">
          <CardTitle className="text-sm font-medium text-primary uppercase tracking-widest flex items-center justify-between">
            <div className="flex items-center"><Activity className="h-4 w-4 mr-2" /> 60-Minute Telemetry History</div>
            {currentLive && <div className="flex items-center text-[10px] text-chart-2 animate-pulse"><div className="h-1.5 w-1.5 rounded-full bg-chart-2 mr-1" /> RECEIVING DATA</div>}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 pt-6">
          <div className="h-[500px] w-full pr-6 pb-2">
            {loadingHistory ? (
              <div className="h-full w-full flex items-center justify-center border border-dashed border-primary/20 m-6 mr-12 mb-8">
                <div className="flex flex-col items-center">
                  <Activity className="h-8 w-8 text-primary/50 animate-pulse mb-4" />
                  <span className="text-primary/50 text-xs tracking-widest uppercase">AGGREGATING HISTORY...</span>
                </div>
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center border border-dashed border-muted m-6 mr-12 mb-8">
                <div className="flex flex-col items-center">
                  <Clock className="h-8 w-8 text-muted-foreground mb-4 opacity-50" />
                  <span className="text-muted-foreground text-xs tracking-widest uppercase">INSUFFICIENT DATA POINTS</span>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorRx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorTx" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary) / 0.1)" vertical={false} />
                  <XAxis 
                    dataKey="time" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10} 
                    tickMargin={10}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    minTickGap={30}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={10} 
                    tickFormatter={(value) => `${value}`}
                    width={50}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="rxMbps" 
                    name="RX" 
                    stroke="hsl(var(--chart-2))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorRx)" 
                    isAnimationActive={false}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="txMbps" 
                    name="TX" 
                    stroke="hsl(var(--chart-1))" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorTx)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
