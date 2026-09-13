/**
 * Consolidated Settings Page
 *
 * Merges: Settings (account/profile) + Channels (WhatsApp/Twilio/Payments)
 * + ConnectorRegistry (tier-aware connectors) + ModuleRegistry (growth modules)
 *
 * Tabs: Account | Notifications | Connectors | Modules
 */

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Zap, Bell, User, Lock, CreditCard, Palette, Globe, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIMEZONE_OPTIONS, detectBrowserTimezone, findClosestTimezone } from "@/lib/timezones";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";
import { FloatingBackground } from "@/components/FloatingBackground";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [sendingTest, setSendingTest] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    timezone: "UTC",
    emailNotifications: true,
    pushNotifications: true,
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      setProfile(profileData);
      setFormData({
        name: profileData.name || "",
        email: profileData.email || user.email || "",
        timezone: profileData.timezone || findClosestTimezone(detectBrowserTimezone()),
        emailNotifications: true,
        pushNotifications: true,
      });
    } catch (error) {
      console.error("Error loading profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("profiles")
        .update({
          name: formData.name,
          timezone: formData.timezone,
        })
        .eq("id", user.id);

      if (error) throw error;

      // Propagate timezone to all user's receptionists
      const { data: recs } = await supabase
        .from("receptionists")
        .select("id")
        .eq("user_id", user.id);
      
      if (recs && recs.length > 0) {
        await supabase
          .from("receptionists")
          .update({ timezone: formData.timezone })
          .eq("user_id", user.id);
        
        for (const rec of recs) {
          await supabase
            .from("availability_rules")
            .update({ timezone: formData.timezone })
            .eq("receptionist_id", rec.id);
        }
      }

      toast.success("Profile updated successfully");
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error(error.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      if (error) throw error;
      toast.success("Password updated successfully");
      setPasswordDialogOpen(false);
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setChangingPassword(false);
    }
  };

  const sendTestNotification = async () => {
    setSendingTest(true);
    try {
      await notify({
        type: "test",
        title: "Test Notification",
        body: "Your notification system is working perfectly!",
        severity: "info",
        category: "system",
      });
      toast.success("Test notification sent!");
    } catch (error) {
      toast.error("Failed to send test notification");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-background">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6 hover:bg-primary/5">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your account, integrations, and operator capabilities</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs defaultValue="account" className="space-y-8">
            <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid h-auto p-1">
              <TabsTrigger value="account" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5">
                <User className="mr-2 h-4 w-4" />
                Account
              </TabsTrigger>
              <TabsTrigger value="notifications" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5">
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </TabsTrigger>
            </TabsList>

            {/* ── Account Tab ──────────────────────────────────── */}
            <TabsContent value="account" className="space-y-6">
              <Card className="border-2 border-border/50 shadow-lg liquid-glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    Profile Information
                  </CardTitle>
                  <CardDescription>
                    Update your personal information and preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="timezone" className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 text-primary" />
                        Timezone
                      </Label>
                      <Select
                        value={formData.timezone}
                        onValueChange={(value) => setFormData({ ...formData, timezone: value })}
                      >
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select your timezone" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {TIMEZONE_OPTIONS.map((tz) => (
                            <SelectItem key={tz.value} value={tz.value}>
                              {tz.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Auto-detected from your browser. Change if your business is in a different timezone.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      disabled
                      className="h-11 bg-muted/50"
                    />
                  </div>
                  <Button onClick={saveProfile} disabled={saving} className="h-11">
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-2 border-border/50 shadow-lg liquid-glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Palette className="h-5 w-5 text-primary" />
                    </div>
                    Appearance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-base">Dark Mode</Label>
                      <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
                    </div>
                    <Switch
                      checked={theme === "dark"}
                      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid sm:grid-cols-2 gap-6">
                <Card className="border-2 border-border/50 shadow-lg liquid-glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <Lock className="h-5 w-5 text-primary" />
                      Password & Security
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full h-11" onClick={() => setPasswordDialogOpen(true)}>
                      <Lock className="mr-2 h-4 w-4" />
                      Change Password
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-2 border-border/50 shadow-lg liquid-glass">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <CreditCard className="h-5 w-5 text-primary" />
                      Plan & Billing
                    </CardTitle>
                    <CardDescription>
                      Current plan: <Badge className="ml-1">{profile?.plan || "Free"}</Badge>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" disabled className="w-full h-11">Upgrade Plan (Coming Soon)</Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Notifications Tab ────────────────────────────── */}
            <TabsContent value="notifications" className="space-y-6">
              <Card className="border-2 border-border/50 shadow-lg liquid-glass">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-primary" />
                    </div>
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>Choose how you want to receive notifications</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-base">Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive browser notifications for important events</p>
                    </div>
                    <Switch
                      checked={formData.pushNotifications}
                      onCheckedChange={(checked) => setFormData({ ...formData, pushNotifications: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-base">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">Receive email updates about appointments and activity</p>
                    </div>
                    <Switch
                      checked={formData.emailNotifications}
                      onCheckedChange={(checked) => setFormData({ ...formData, emailNotifications: checked })}
                    />
                  </div>
                  <Button onClick={sendTestNotification} disabled={sendingTest} variant="outline" className="h-11">
                    <Zap className="mr-2 h-4 w-4" />
                    {sendingTest ? "Sending..." : "Send Test Notification"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

          </Tabs>
        )}
      </div>

      {/* Password Change Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Change Password
            </DialogTitle>
            <DialogDescription>Enter a new password for your account. Must be at least 8 characters.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPw ? "text" : "password"}
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="Min. 8 characters"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw(!showNewPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPw ? "text" : "password"}
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  placeholder="Re-enter new password"
                  className="h-11 pr-10"
                  onKeyDown={(e) => e.key === "Enter" && changePassword()}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw(!showConfirmPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={changePassword}
              disabled={changingPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
            >
              {changingPassword ? "Updating..." : "Update Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
