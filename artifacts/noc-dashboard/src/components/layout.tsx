import { useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useLogout, useHealthCheck } from "@workspace/api-client-react";
import {
  Activity, Server, Network, LayoutDashboard, LogOut, Loader2,
  Menu, Radio, Eye, Bell, X, Settings, AlertTriangle,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MANILA_TZ = "Asia/Manila";

interface EventEntry {
  id: number;
  type: string;
  message: string;
  deviceName: string | null;
  host: string | null;
  interfaceName: string | null;
  recordedAt: string;
}

function eventTypeColor(type: string) {
  if (type === "system_down") return "text-red-300 border-red-400/60 bg-red-500/15";
  if (type === "timeout") return "text-red-400 border-red-500/40 bg-red-500/10";
  if (type === "low_bandwidth") return "text-yellow-400 border-yellow-500/40 bg-yellow-500/10";
  if (type === "recovery") return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  return "text-muted-foreground border-muted/30 bg-muted/10";
}

function eventTypeLabel(type: string) {
  if (type === "system_down") return "SYS DOWN";
  if (type === "timeout") return "TIMEOUT";
  if (type === "low_bandwidth") return "LOW BW";
  if (type === "recovery") return "RECOVERY";
  return type.toUpperCase();
}

function toManilaString(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: MANILA_TZ,
    month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: true,
  });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logoutUser } = useAuth();
  const logoutMutation = useLogout();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [eventPanelOpen, setEventPanelOpen] = useState(false);
  const [events, setEvents] = useState<EventEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenRef = useRef<string | null>(null);

  const { data: health } = useHealthCheck({ query: { refetchInterval: 10000 } });

  const isAdmin = user?.role === "admin";

  const allNavItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
    { href: "/devices", label: "Devices", icon: Server, adminOnly: true },
    { href: "/interfaces", label: "Interfaces", icon: Network, adminOnly: true },
    { href: "/ping", label: "Ping Monitor", icon: Radio, adminOnly: true },
    { href: "/netwatch", label: "Netwatch", icon: Eye, adminOnly: true },
    { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
  ];

  const navItems = allNavItems.filter(item => !item.adminOnly || isAdmin);

  // Poll events for alert badge
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/events?limit=100", { credentials: "include" });
      if (!res.ok) return;
      const data: EventEntry[] = await res.json();
      setEvents(data);
      if (lastSeenRef.current) {
        const newCount = data.filter(e => e.recordedAt > lastSeenRef.current!).length;
        setUnreadCount(newCount);
      } else if (data.length > 0) {
        setUnreadCount(data.length);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    void fetchEvents();
    const id = setInterval(() => { void fetchEvents(); }, 3000);
    return () => clearInterval(id);
  }, [fetchEvents, user]);

  const openEventPanel = () => {
    setEventPanelOpen(true);
    lastSeenRef.current = new Date().toISOString();
    setUnreadCount(0);
  };

  const clearEvents = async () => {
    await fetch("/api/events", { method: "DELETE", credentials: "include" });
    setEvents([]);
    setUnreadCount(0);
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      logoutUser();
      setLocation("/login");
    } catch { /* ignore */ }
  };

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
                NOC MONITOR
              </span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              <div className="text-xs font-mono text-muted-foreground mb-3 px-2 uppercase tracking-widest">
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

              {/* Event Log panel button */}
              <div className="pt-1">
                <button
                  onClick={openEventPanel}
                  data-testid="nav-event-log"
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-sm font-mono text-sm transition-all cursor-pointer border ${
                    eventPanelOpen
                      ? "bg-primary/10 text-primary border-primary/50"
                      : "text-muted-foreground border-transparent hover:bg-secondary hover:text-primary"
                  }`}
                >
                  <div className="flex items-center">
                    <Bell className={`h-4 w-4 mr-3 ${unreadCount > 0 ? "text-red-400" : ""}`} />
                    Event Log
                  </div>
                  {unreadCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold font-mono rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>
              </div>
            </nav>

            {/* User & Status */}
            <div className="p-4 border-t border-primary/20 bg-background/50">
              <div className="flex items-center justify-between mb-3 font-mono text-xs">
                <div className="flex items-center">
                  <div className={`h-2 w-2 rounded-full mr-2 ${health?.status === "ok" ? "status-pulse-online" : "bg-muted"}`} />
                  <span className={health?.status === "ok" ? "text-primary glow-text" : "text-muted-foreground"}>
                    SYS_{health?.status === "ok" ? "ONLINE" : "UNKNOWN"}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                    {user?.role === "admin" ? "ADMIN" : "SUPPORT"}
                  </span>
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
      <div className="flex-1 flex flex-col min-w-0 bg-background grid-bg relative">
        <header className="h-16 flex items-center px-4 border-b border-primary/20 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-primary hover:bg-primary/10 mr-4">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1 flex justify-end items-center">
            <div className="font-mono text-xs text-primary/70 flex space-x-4">
              <span>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}</span>
              <span>{new Date().toLocaleTimeString("en-US", { hour12: false })}</span>
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

      {/* Event Log Side Panel */}
      <AnimatePresence>
        {eventPanelOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-30"
              onClick={() => setEventPanelOpen(false)}
            />
            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-[420px] max-w-full bg-card border-l border-primary/30 z-40 flex flex-col shadow-[−4px_0_30px_rgba(0,245,255,0.08)]"
            >
              {/* Panel header */}
              <div className="h-16 flex items-center justify-between px-4 border-b border-primary/20 bg-background/60">
                <div className="flex items-center gap-2 font-mono">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold text-primary uppercase tracking-widest">Event Log</span>
                  {events.length > 0 && (
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary ml-1">
                      {events.length}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {events.length > 0 && (
                    <Button
                      variant="ghost" size="sm"
                      onClick={clearEvents}
                      className="h-7 px-2 text-[10px] text-muted-foreground hover:text-red-400 font-mono"
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> CLEAR
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setEventPanelOpen(false)}
                    className="text-muted-foreground hover:text-primary h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Events list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {events.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-16">
                    <Bell className="h-10 w-10 mb-3 opacity-20" />
                    <p className="text-xs font-mono uppercase tracking-widest">No Events</p>
                    <p className="text-[10px] font-mono mt-1 opacity-60">All systems nominal</p>
                  </div>
                ) : (
                  events.map(ev => (
                    <div
                      key={ev.id}
                      className={`flex flex-col gap-1 p-3 rounded border text-xs font-mono ${eventTypeColor(ev.type)}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-[10px] whitespace-nowrap">{eventTypeLabel(ev.type)}</span>
                        <span className="text-[10px] opacity-60 whitespace-nowrap flex-shrink-0">
                          {toManilaString(ev.recordedAt)}
                        </span>
                      </div>
                      <div className="opacity-90">{ev.message}</div>
                      {ev.deviceName && (
                        <div className="opacity-50 text-[10px]">{ev.deviceName}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
