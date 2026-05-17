import { 
  useListMonitoredInterfaces, 
  useAddMonitoredInterface, 
  useUpdateMonitoredInterface, 
  useRemoveMonitoredInterface,
  useListDevices,
  useListDeviceInterfaces,
  MonitoredInterface,
  RemoteInterface,
  Device
} from "@workspace/api-client-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Network, Plus, Trash2, Edit, Activity, AlertCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getListMonitoredInterfacesQueryKey } from "@workspace/api-client-react";

// Modal steps
type AddStep = 'select_device' | 'select_interface' | 'configure';

const addInterfaceSchema = z.object({
  deviceId: z.coerce.number(),
  interfaceName: z.string().min(1),
  alias: z.string().min(1, "Alias required for identification"),
  thresholdMbps: z.coerce.number().optional().nullable(),
});

type AddInterfaceFormValues = z.infer<typeof addInterfaceSchema>;

export default function Interfaces() {
  const queryClient = useQueryClient();
  const { data: monitored, isLoading: loadingMonitored } = useListMonitoredInterfaces();
  const { data: devices, isLoading: loadingDevices } = useListDevices();
  
  const addMutation = useAddMonitoredInterface();
  const updateMutation = useUpdateMonitoredInterface();
  const removeMutation = useRemoveMonitoredInterface();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [step, setStep] = useState<AddStep>('select_device');
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [selectedRemoteIface, setSelectedRemoteIface] = useState<RemoteInterface | null>(null);

  const { data: remoteInterfaces, isLoading: loadingRemote, isError: errorRemote } = useListDeviceInterfaces(
    selectedDeviceId || 0,
    { query: { enabled: !!selectedDeviceId } }
  );

  const form = useForm<AddInterfaceFormValues>({
    resolver: zodResolver(addInterfaceSchema),
    defaultValues: {
      alias: "",
      thresholdMbps: undefined,
    },
  });

  const resetAddFlow = () => {
    setStep('select_device');
    setSelectedDeviceId(null);
    setSelectedRemoteIface(null);
    form.reset({ alias: "", thresholdMbps: undefined });
  };

  const handleDeviceSelect = (id: string) => {
    setSelectedDeviceId(Number(id));
    form.setValue("deviceId", Number(id));
    setStep('select_interface');
  };

  const handleInterfaceSelect = (iface: RemoteInterface) => {
    setSelectedRemoteIface(iface);
    form.setValue("interfaceName", iface.name);
    form.setValue("alias", iface.name); // Default alias to interface name
    setStep('configure');
  };

  const onSubmitAdd = async (data: AddInterfaceFormValues) => {
    try {
      await addMutation.mutateAsync({ 
        data: {
          ...data,
          enabled: true
        }
      });
      toast.success(`Interface ${data.alias} added to monitoring grid.`);
      queryClient.invalidateQueries({ queryKey: getListMonitoredInterfacesQueryKey() });
      setIsAddOpen(false);
      resetAddFlow();
    } catch (error: any) {
      toast.error(error.message || "Failed to add interface.");
    }
  };

  const handleToggleState = async (id: number, currentEnabled: boolean, name: string) => {
    try {
      await updateMutation.mutateAsync({
        id,
        data: { enabled: !currentEnabled }
      });
      toast.success(`Monitoring for ${name} ${!currentEnabled ? 'RESUMED' : 'SUSPENDED'}.`);
      queryClient.invalidateQueries({ queryKey: getListMonitoredInterfacesQueryKey() });
    } catch (error: any) {
      toast.error("Failed to toggle state.");
    }
  };

  const handleRemove = async (id: number, name: string) => {
    if (!confirm(`WARNING: Remove interface ${name} from monitoring? History will be lost.`)) return;
    try {
      await removeMutation.mutateAsync({ id });
      toast.success(`Interface ${name} purged from grid.`);
      queryClient.invalidateQueries({ queryKey: getListMonitoredInterfacesQueryKey() });
    } catch (error: any) {
      toast.error("Failed to purge interface.");
    }
  };

  return (
    <div className="space-y-6 font-mono">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text flex items-center">
          <Network className="mr-2 h-6 w-6" /> Telemetry Targets
        </h1>
        
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) resetAddFlow();
        }}>
          <DialogTrigger asChild>
            <Button className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 uppercase tracking-widest text-xs" data-testid="btn-add-interface">
              <Plus className="mr-2 h-4 w-4" /> Add Target
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card/95 border-primary/30 font-mono shadow-[0_0_30px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,245,255,0.05)] backdrop-blur-md max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-primary tracking-widest uppercase border-b border-primary/20 pb-2 flex items-center">
                Initialize Target <ArrowRight className="mx-2 h-4 w-4 opacity-50" /> 
                <span className={step === 'select_device' ? 'text-primary' : 'text-muted-foreground'}>1. Node</span>
                <span className="mx-2 text-muted-foreground">/</span>
                <span className={step === 'select_interface' ? 'text-primary' : 'text-muted-foreground'}>2. Interface</span>
                <span className="mx-2 text-muted-foreground">/</span>
                <span className={step === 'configure' ? 'text-primary' : 'text-muted-foreground'}>3. Config</span>
              </DialogTitle>
            </DialogHeader>

            <div className="min-h-[300px] pt-4">
              {step === 'select_device' && (
                <div className="space-y-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-widest mb-4">Select Source Node:</div>
                  {loadingDevices ? (
                    <div className="space-y-2">
                      {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full bg-muted/20" />)}
                    </div>
                  ) : devices?.length === 0 ? (
                    <div className="text-center text-muted-foreground p-8 border border-dashed border-primary/20 text-xs">
                      NO NODES CONFIGURED. ADD A DEVICE FIRST.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2">
                      {devices?.map(d => (
                        <div 
                          key={d.id} 
                          onClick={() => handleDeviceSelect(d.id.toString())}
                          className="p-3 border border-primary/20 bg-background/50 hover:bg-primary/10 hover:border-primary/50 cursor-pointer rounded transition-all group flex flex-col justify-between"
                        >
                          <div className="font-bold text-foreground group-hover:text-primary mb-1">{d.name}</div>
                          <div className="text-xs text-muted-foreground">{d.host}</div>
                          <div className="mt-2 text-[10px]">
                            {d.status === 'online' ? <span className="text-chart-2">ONLINE</span> : <span className="text-chart-5">OFFLINE</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 'select_interface' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Select Target Interface:</div>
                    <Button variant="ghost" size="sm" onClick={() => setStep('select_device')} className="h-6 text-[10px] text-primary/70">← BACK</Button>
                  </div>
                  
                  {loadingRemote ? (
                    <div className="flex flex-col items-center justify-center p-12 space-y-4 border border-dashed border-primary/20">
                      <Activity className="h-8 w-8 text-primary animate-pulse" />
                      <div className="text-xs text-primary tracking-widest animate-pulse">QUERYING REMOTE NODE...</div>
                    </div>
                  ) : errorRemote ? (
                    <div className="text-center text-destructive p-8 border border-dashed border-destructive/20 text-xs">
                      UPLINK FAILED. NODE MAY BE OFFLINE.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                      {remoteInterfaces?.map(iface => (
                        <div 
                          key={iface.name} 
                          onClick={() => handleInterfaceSelect(iface)}
                          className="flex items-center justify-between p-3 border border-primary/20 bg-background/50 hover:bg-primary/10 hover:border-primary/50 cursor-pointer rounded transition-all group"
                        >
                          <div>
                            <div className="font-bold text-sm text-foreground group-hover:text-primary flex items-center">
                              {iface.name}
                              {!iface.running && <Badge variant="outline" className="ml-2 text-[8px] h-4 border-chart-5 text-chart-5">DOWN</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">Type: {iface.type} {iface.comment ? `• ${iface.comment}` : ''}</div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 'configure' && (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmitAdd)} className="space-y-4">
                    <div className="flex justify-between items-center mb-4 border-b border-primary/10 pb-4">
                      <div className="text-xs">
                        <span className="text-muted-foreground">NODE: </span>
                        <span className="text-primary font-bold">{devices?.find(d => d.id === selectedDeviceId)?.name}</span>
                        <span className="mx-2 text-muted-foreground">|</span>
                        <span className="text-muted-foreground">IFACE: </span>
                        <span className="text-primary font-bold">{selectedRemoteIface?.name}</span>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setStep('select_interface')} className="h-6 text-[10px] text-primary/70">← BACK</Button>
                    </div>

                    <FormField
                      control={form.control}
                      name="alias"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">Display Alias</FormLabel>
                          <FormControl>
                            <Input {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary text-foreground" data-testid="input-iface-alias" />
                          </FormControl>
                          <FormMessage className="text-destructive text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="thresholdMbps"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">Alert Threshold (Mbps) - Optional</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              value={field.value || ''} 
                              onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                              placeholder="e.g. 500" 
                              className="bg-background/50 border-primary/20 focus-visible:ring-primary text-foreground" 
                            />
                          </FormControl>
                          <FormMessage className="text-destructive text-xs" />
                        </FormItem>
                      )}
                    />

                    <div className="pt-6">
                      <Button type="submit" disabled={addMutation.isPending} className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 tracking-widest uppercase" data-testid="btn-save-iface">
                        {addMutation.isPending ? "Initializing..." : "Commence Monitoring"}
                      </Button>
                    </div>
                  </form>
                </Form>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-primary/20 rounded-md bg-card/40 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-primary/5 hover:bg-primary/5">
            <TableRow className="border-b border-primary/20 hover:bg-transparent">
              <TableHead className="text-primary text-xs uppercase tracking-widest font-bold">Alias / Identity</TableHead>
              <TableHead className="text-primary text-xs uppercase tracking-widest font-bold">Node Source</TableHead>
              <TableHead className="text-primary text-xs uppercase tracking-widest font-bold text-center">Status</TableHead>
              <TableHead className="text-primary text-xs uppercase tracking-widest font-bold text-center">Threshold</TableHead>
              <TableHead className="text-right text-primary text-xs uppercase tracking-widest font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingMonitored ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-b border-primary/10">
                  <TableCell><Skeleton className="h-4 w-32 bg-muted/20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 bg-muted/20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16 mx-auto bg-muted/20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12 mx-auto bg-muted/20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-16 bg-muted/20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : monitored?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground border-b-0 text-xs tracking-widest uppercase">
                  <Network className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  No interfaces currently monitored
                </TableCell>
              </TableRow>
            ) : (
              monitored?.map((iface) => (
                <TableRow key={iface.id} className="border-b border-primary/10 hover:bg-primary/5 transition-colors group">
                  <TableCell>
                    <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                      {iface.alias}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {iface.interfaceName}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {iface.deviceName}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch 
                      checked={iface.enabled}
                      onCheckedChange={() => handleToggleState(iface.id, iface.enabled, iface.alias)}
                      disabled={updateMutation.isPending}
                      className="data-[state=checked]:bg-chart-2 data-[state=unchecked]:bg-muted"
                      data-testid={`toggle-iface-${iface.id}`}
                    />
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground">
                    {iface.thresholdMbps ? `${iface.thresholdMbps} Mbps` : 'NONE'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      onClick={() => handleRemove(iface.id, iface.alias)}
                      disabled={removeMutation.isPending}
                      title="Purge Target"
                      data-testid={`btn-delete-iface-${iface.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
