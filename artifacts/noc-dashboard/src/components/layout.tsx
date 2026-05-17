import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLogout, useHealthCheck } from "@workspace/api-client-react";
import { Activity, Server, Network, LayoutDashboard, LogOut, Loader2, Menu, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logoutUser } = useAuth();
  const logoutMutation = useLogout();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: health } = useHealthCheck({
    query: { refetchInterval: 10000 }
  });

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      logoutUser();
      setLocation("/login");
    } catch (e) {
      // Ignore
    }
  };

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/devices", label: "Devices", icon: Server },
    { href: "/interfaces", label: "Interfaces", icon: Network },
    { href: "/ping", label: "Ping Monitor", icon: Radio },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden font-sans">
      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-shrink-0 h-full border-r border-primary/20 bg-card flex flex-col z-20 relative"
          >
            {/* Logo */}
            <div className="h-16 flex items-center px-4 border-b border-primary/20 bg-background/50">
              <Activity className="h-6 w-6 text-primary mr-2" />
              <span className="font-mono font-bold text-lg text-primary glow-text tracking-wider">
                NOC_CTRL
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              <div className="text-xs font-mono text-muted-foreground mb-4 px-2 uppercase tracking-widest">
                System Navigation
              </div>
              {navItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      className={`flex items-center px-3 py-2.5 rounded-sm font-mono text-sm transition-all cursor-pointer border ${
                        isActive
                          ? "bg-primary/10 text-primary border-primary/50 shadow-[inset_0_0_10px_rgba(0,245,255,0.1)]"
                          : "text-muted-foreground border-transparent hover:bg-secondary hover:text-primary"
                      }`}
                    >
                      <item.icon className={`h-4 w-4 mr-3 ${isActive ? "text-primary" : ""}`} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </nav>

            {/* User & Status */}
            <div className="p-4 border-t border-primary/20 bg-background/50">
              <div className="flex items-center justify-between mb-4 font-mono text-xs">
                <div className="flex items-center">
                  <div className={`h-2 w-2 rounded-full mr-2 ${health?.status === 'ok' ? 'status-pulse-online' : 'bg-muted'}`} />
                  <span className={health?.status === 'ok' ? 'text-primary glow-text' : 'text-muted-foreground'}>
                    SYS_{health?.status === 'ok' ? 'ONLINE' : 'UNKNOWN'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-mono">OP_ID</span>
                  <span className="text-sm font-mono text-foreground truncate max-w-[120px]" data-testid="user-username">
                    {user?.username}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  data-testid="btn-logout"
                >
                  {logoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background grid-bg">
        <header className="h-16 flex items-center px-4 border-b border-primary/20 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-primary hover:bg-primary/10 mr-4">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1 flex justify-end items-center">
            <div className="font-mono text-xs text-primary/70 flex space-x-4">
              <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}</span>
              <span>{new Date().toLocaleTimeString('en-US', { hour12: false })}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
