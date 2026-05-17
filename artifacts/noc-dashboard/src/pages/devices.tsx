import { 
  useListDevices, 
  useCreateDevice, 
  useUpdateDevice, 
  useDeleteDevice,
  useTestDeviceConnection,
  Device,
  DeviceInput
} from "@workspace/api-client-react";
import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Server, Plus, Edit, Trash2, RefreshCw, Activity, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getListDevicesQueryKey } from "@workspace/api-client-react";

const deviceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  host: z.string().min(1, "Host/IP is required"),
  port: z.coerce.number().min(1).max(65535).default(8728),
  username: z.string().min(1, "Username is required"),
  password: z.string(),
});

type DeviceFormValues = z.infer<typeof deviceSchema>;

export default function Devices() {
  const queryClient = useQueryClient();
  const { data: devices, isLoading } = useListDevices();
  const createMutation = useCreateDevice();
  const updateMutation = useUpdateDevice();
  const deleteMutation = useDeleteDevice();
  const testMutation = useTestDeviceConnection();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);

  const form = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceSchema),
    defaultValues: {
      name: "",
      host: "",
      port: 8728,
      username: "admin",
      password: "",
    },
  });

  const onSubmit = async (data: DeviceFormValues) => {
    try {
      if (editingDevice) {
        // Password shouldn't be sent if empty on edit
        const updateData = { ...data };
        if (!updateData.password) {
          delete (updateData as any).password;
        }
        await updateMutation.mutateAsync({ 
          id: editingDevice.id, 
          data: updateData 
        });
        toast.success(`Node ${data.name} parameters updated.`);
      } else {
        await createMutation.mutateAsync({ data });
        toast.success(`Node ${data.name} initialized in grid.`);
      }
      queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
      setIsAddOpen(false);
      setEditingDevice(null);
      form.reset();
    } catch (error: any) {
      toast.error(error.message || "Operation failed.");
    }
  };

  const handleEdit = (device: Device) => {
    setEditingDevice(device);
    form.reset({
      name: device.name,
      host: device.host,
      port: device.port,
      username: device.username,
      password: "", // Don't populate password
    });
    setIsAddOpen(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`WARNING: Erasing node ${name} will permanently drop it from the grid. Proceed?`)) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success(`Node ${name} purged from grid.`);
      queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
    } catch (error: any) {
      toast.error(error.message || "Failed to purge node.");
    }
  };

  const handleTest = async (id: number, name: string) => {
    try {
      const result = await testMutation.mutateAsync({ id });
      if (result.success) {
        toast.success(`Uplink established with ${name}. RouterOS: ${result.routerOsVersion}`);
      } else {
        toast.error(`Uplink failed: ${result.message}`);
      }
      queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() });
    } catch (error: any) {
      toast.error(error.message || "Connection test failed.");
    }
  };

  const renderStatus = (status: string) => {
    switch(status) {
      case 'online':
        return <Badge variant="outline" className="border-chart-2 text-chart-2 bg-chart-2/10 uppercase tracking-widest"><div className="h-1.5 w-1.5 rounded-full status-pulse-online mr-2"/>ONLINE</Badge>;
      case 'offline':
        return <Badge variant="outline" className="border-chart-5 text-chart-5 bg-chart-5/10 uppercase tracking-widest"><div className="h-1.5 w-1.5 rounded-full status-pulse-offline mr-2"/>OFFLINE</Badge>;
      default:
        return <Badge variant="outline" className="border-muted text-muted-foreground bg-muted/10 uppercase tracking-widest"><div className="h-1.5 w-1.5 rounded-full bg-muted mr-2"/>UNKNOWN</Badge>;
    }
  };

  return (
    <div className="space-y-6 font-mono">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text flex items-center">
          <Server className="mr-2 h-6 w-6" /> Device Directory
        </h1>
        
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          setIsAddOpen(open);
          if (!open) {
            setEditingDevice(null);
            form.reset({ name: "", host: "", port: 8728, username: "admin", password: "" });
          }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 uppercase tracking-widest text-xs" data-testid="btn-add-device">
              <Plus className="mr-2 h-4 w-4" /> Register Node
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card/95 border-primary/30 font-mono shadow-[0_0_30px_rgba(0,0,0,0.8),inset_0_0_20px_rgba(0,245,255,0.05)] backdrop-blur-md">
            <DialogHeader>
              <DialogTitle className="text-primary tracking-widest uppercase border-b border-primary/20 pb-2">
                {editingDevice ? "Modify Node Parameters" : "Initialize New Node"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">Node Designation</FormLabel>
                      <FormControl>
                        <Input {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary text-foreground" data-testid="input-device-name" />
                      </FormControl>
                      <FormMessage className="text-destructive text-xs" />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">IP / Hostname</FormLabel>
                        <FormControl>
                          <Input {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary text-foreground" data-testid="input-device-host" />
                        </FormControl>
                        <FormMessage className="text-destructive text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">API Port</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary text-foreground" data-testid="input-device-port" />
                        </FormControl>
                        <FormMessage className="text-destructive text-xs" />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">Auth User</FormLabel>
                        <FormControl>
                          <Input {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary text-foreground" data-testid="input-device-user" />
                        </FormControl>
                        <FormMessage className="text-destructive text-xs" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-muted-foreground text-xs uppercase tracking-wider">Auth Key {editingDevice && "(Leave blank to keep)"}</FormLabel>
                        <FormControl>
                          <Input type="password" {...field} className="bg-background/50 border-primary/20 focus-visible:ring-primary text-foreground" data-testid="input-device-pass" />
                        </FormControl>
                        <FormMessage className="text-destructive text-xs" />
                      </FormItem>
                    )}
                  />
                </div>
                <DialogFooter className="pt-4 border-t border-primary/20">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 tracking-widest uppercase" data-testid="btn-save-device">
                    {createMutation.isPending || updateMutation.isPending ? "Processing..." : "Commit Parameters"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-primary/20 rounded-md bg-card/40 backdrop-blur-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-primary/5 hover:bg-primary/5">
            <TableRow className="border-b border-primary/20 hover:bg-transparent">
              <TableHead className="text-primary text-xs uppercase tracking-widest font-bold">Node</TableHead>
              <TableHead className="text-primary text-xs uppercase tracking-widest font-bold">Address</TableHead>
              <TableHead className="text-primary text-xs uppercase tracking-widest font-bold">Status</TableHead>
              <TableHead className="text-primary text-xs uppercase tracking-widest font-bold">Last Uplink</TableHead>
              <TableHead className="text-right text-primary text-xs uppercase tracking-widest font-bold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i} className="border-b border-primary/10">
                  <TableCell><Skeleton className="h-4 w-24 bg-muted/20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32 bg-muted/20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20 bg-muted/20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28 bg-muted/20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-24 bg-muted/20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : devices?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground border-b-0 text-xs tracking-widest uppercase">
                  <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  No nodes registered in directory
                </TableCell>
              </TableRow>
            ) : (
              devices?.map((device) => (
                <TableRow key={device.id} className="border-b border-primary/10 hover:bg-primary/5 transition-colors group">
                  <TableCell className="font-medium text-foreground group-hover:text-primary transition-colors" data-testid={`cell-device-name-${device.id}`}>
                    {device.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {device.host}:{device.port}
                  </TableCell>
                  <TableCell>
                    {renderStatus(device.status)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'NEVER'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:bg-primary/20 hover:text-primary"
                        onClick={() => handleTest(device.id, device.name)}
                        disabled={testMutation.isPending}
                        title="Test Uplink"
                        data-testid={`btn-test-${device.id}`}
                      >
                        <RefreshCw className={`h-4 w-4 ${testMutation.isPending && testMutation.variables?.id === device.id ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        onClick={() => handleEdit(device)}
                        title="Modify"
                        data-testid={`btn-edit-${device.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                        onClick={() => handleDelete(device.id, device.name)}
                        disabled={deleteMutation.isPending}
                        title="Purge"
                        data-testid={`btn-delete-${device.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
