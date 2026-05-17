import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Layout } from "@/components/layout";
import { motion, AnimatePresence } from "framer-motion";

// Pages
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Devices from "@/pages/devices";
import Interfaces from "@/pages/interfaces";
import Bandwidth from "@/pages/bandwidth";
import Ping from "@/pages/ping";
import Netwatch from "@/pages/netwatch";
import Settings from "@/pages/settings";
import { useEffect } from "react";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, path }: { component: any; path: string }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user === null) {
      setLocation("/login");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading || user === null) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-primary">
        <div className="animate-pulse font-mono text-xl glow-text">INITIALIZING SYSTEM...</div>
      </div>
    );
  }

  return (
    <Route path={path}>
      {() => (
        <Layout>
          <Component />
        </Layout>
      )}
    </Route>
  );
}

function Router() {
  const [location] = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Switch location={location} key={location}>
        <Route path="/login" component={Login} />
        <ProtectedRoute path="/" component={Dashboard} />
        <ProtectedRoute path="/devices" component={Devices} />
        <ProtectedRoute path="/interfaces" component={Interfaces} />
        <ProtectedRoute path="/bandwidth/:interfaceId" component={Bandwidth} />
        <ProtectedRoute path="/ping" component={Ping} />
        <ProtectedRoute path="/netwatch" component={Netwatch} />
        <ProtectedRoute path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster
            theme="dark"
            toastOptions={{
              className: 'bg-card border border-primary text-primary font-mono rounded-none',
              style: {
                boxShadow: '0 0 10px rgba(0, 245, 255, 0.2)'
              }
            }}
          />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
