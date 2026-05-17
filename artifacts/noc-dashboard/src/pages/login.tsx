import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Activity, Loader2, TerminalSquare } from "lucide-react";
import { motion } from "framer-motion";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { loginUser } = useAuth();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      const user = await loginMutation.mutateAsync({ data });
      loginUser(user);
      queryClient.setQueryData(getGetMeQueryKey(), user);
      toast.success("Authentication successful. System initialized.");
      setLocation("/");
    } catch (error: any) {
      toast.error(error.message || "Authentication failed. Access denied.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4 grid-bg relative overflow-hidden font-mono">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
      <div className="absolute top-1/2 left-0 w-1 h-32 bg-primary/30 -translate-y-1/2 rounded-r-md blur-sm" />
      <div className="absolute top-1/2 right-0 w-1 h-32 bg-primary/30 -translate-y-1/2 rounded-l-md blur-sm" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            <Activity className="h-16 w-16 text-primary relative z-10 drop-shadow-[0_0_8px_rgba(0,245,255,0.8)]" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-widest glow-text">NOC_CTRL</h1>
          <p className="text-primary/60 text-sm mt-2 flex items-center uppercase tracking-widest">
            <TerminalSquare className="h-4 w-4 mr-2" />
            System Authentication
          </p>
        </div>

        <div className="bg-card/80 backdrop-blur-sm border border-primary/30 p-8 shadow-[0_0_30px_rgba(0,0,0,0.5),inset_0_0_20px_rgba(0,245,255,0.05)] relative">
          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-primary" />
          <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-primary" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-primary" />
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-primary" />

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-primary uppercase tracking-wider text-xs">Operator ID</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="admin" 
                        autoComplete="username"
                        data-testid="input-username"
                        className="bg-background/50 border-primary/20 focus-visible:ring-primary focus-visible:border-primary text-foreground font-mono"
                      />
                    </FormControl>
                    <FormMessage className="text-destructive font-mono text-xs" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-primary uppercase tracking-wider text-xs">Passcode</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="password" 
                        placeholder="••••••••" 
                        autoComplete="current-password"
                        data-testid="input-password"
                        className="bg-background/50 border-primary/20 focus-visible:ring-primary focus-visible:border-primary text-foreground font-mono"
                      />
                    </FormControl>
                    <FormMessage className="text-destructive font-mono text-xs" />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 font-mono tracking-widest uppercase transition-all duration-300 hover:shadow-[0_0_15px_rgba(0,245,255,0.4)]"
                disabled={loginMutation.isPending}
                data-testid="btn-submit-login"
              >
                {loginMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Authenticating...</>
                ) : (
                  "Initialize Connection"
                )}
              </Button>
            </form>
          </Form>
        </div>
        
        <div className="mt-8 text-center text-xs text-muted-foreground opacity-50 uppercase tracking-widest">
          Unauthorized access is strictly prohibited
        </div>
      </motion.div>
    </div>
  );
}
