import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Shield, Users, KeyRound, Trash2, UserPlus, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface UserAccount {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

// ─── Change Password ──────────────────────────────────────────────────────────
function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { toast.error("New passwords do not match"); return; }
    if (next.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to change password"); return; }
      toast.success("Password changed successfully");
      setCurrent(""); setNext(""); setConfirm("");
    } catch { toast.error("Network error"); }
    finally { setLoading(false); }
  };

  return (
    <Card className="bg-card/60 backdrop-blur-sm border-primary/20">
      <CardHeader>
        <CardTitle className="text-sm font-mono font-medium text-primary uppercase tracking-widest flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Change Password
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Current Password</Label>
            <Input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
              className="font-mono bg-background border-primary/20 focus:border-primary"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">New Password</Label>
            <Input
              type="password"
              value={next}
              onChange={e => setNext(e.target.value)}
              required
              minLength={6}
              className="font-mono bg-background border-primary/20 focus:border-primary"
              placeholder="Min 6 characters"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Confirm New Password</Label>
            <Input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className="font-mono bg-background border-primary/20 focus:border-primary"
              placeholder="Repeat new password"
            />
          </div>
          <Button
            type="submit"
            disabled={loading || !current || !next || !confirm}
            className="w-full font-mono uppercase tracking-widest"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Update Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── User Management ──────────────────────────────────────────────────────────
function UserManagementCard() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users", { credentials: "include" });
      if (res.ok) setUsers(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useState(() => { void fetchUsers(); });

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || "Failed to create user"); return; }
      toast.success(`Support account "${newUsername}" created`);
      setNewUsername(""); setNewPassword(""); setShowForm(false);
      void fetchUsers();
    } catch { toast.error("Network error"); }
    finally { setCreating(false); }
  };

  const deleteUser = async (id: number, username: string) => {
    if (!confirm(`Delete account "${username}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const d = await res.json(); toast.error(d.error || "Failed to delete user"); return; }
      toast.success(`Account "${username}" deleted`);
      void fetchUsers();
    } catch { toast.error("Network error"); }
  };

  return (
    <Card className="bg-card/60 backdrop-blur-sm border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-mono font-medium text-primary uppercase tracking-widest flex items-center gap-2">
            <Users className="h-4 w-4" /> Support Accounts
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(!showForm)}
            className="font-mono text-xs border-primary/30 text-primary hover:bg-primary/10 h-7 px-3"
          >
            <UserPlus className="h-3 w-3 mr-1" /> New Account
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create form */}
        {showForm && (
          <form onSubmit={createUser} className="p-4 border border-primary/20 rounded bg-background/40 space-y-3">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">Create Support Account</p>
            <div className="flex gap-2">
              <Input
                placeholder="Username"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                required
                minLength={2}
                className="font-mono bg-background border-primary/20 focus:border-primary text-sm"
              />
              <Input
                type="password"
                placeholder="Password (min 6)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="font-mono bg-background border-primary/20 focus:border-primary text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={creating} size="sm" className="font-mono text-xs">
                {creating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />}
                Create
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)} className="font-mono text-xs text-muted-foreground">
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* User list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : users?.length === 0 ? (
          <p className="text-xs font-mono text-muted-foreground text-center py-6 border border-dashed border-muted/40 rounded">
            NO SUPPORT ACCOUNTS
          </p>
        ) : (
          <div className="space-y-2">
            {users?.map(u => (
              <div key={u.id} className="flex items-center justify-between p-3 rounded border border-primary/10 bg-background/40 hover:border-primary/30 transition-colors">
                <div className="flex items-center gap-3">
                  <Shield className={`h-4 w-4 ${u.role === "admin" ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <div className="text-sm font-mono text-foreground flex items-center gap-2">
                      {u.username}
                      {u.id === currentUser?.id && (
                        <span className="text-[10px] text-primary/60 font-mono">(you)</span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                      {u.role}
                    </div>
                  </div>
                </div>
                {u.id !== currentUser?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteUser(u.id, u.username)}
                    className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6 font-mono max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-primary tracking-widest uppercase glow-text flex items-center gap-2">
          <Settings className="h-6 w-6" /> Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Logged in as <span className="text-primary">{user?.username}</span>
          <Badge variant="outline" className="ml-2 text-[10px] border-primary/30 text-primary/70">
            {user?.role?.toUpperCase()}
          </Badge>
        </p>
      </div>

      <ChangePasswordCard />

      {isAdmin && <UserManagementCard />}
    </div>
  );
}
