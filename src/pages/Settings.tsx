import { Navbar } from "@/components/Navbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Zap, Bell, User, Lock, CreditCard, Palette, Globe } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notify";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "next-themes";

export default function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [sendingTest, setSendingTest] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
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
        timezone: profileData.timezone || "UTC",
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
      toast.success("Profile updated successfully");
    } catch (error: any) {
      console.error("Error saving profile:", error);
      toast.error(error.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const integrations = [
    { id: "twilio", name: "Twilio", description: "Connect your phone number for real calls", status: "Not Connected" },
    { id: "openai", name: "OpenAI", description: "Advanced AI capabilities", status: "Not Connected" },
    { id: "google_calendar", name: "Google Calendar", description: "Sync appointments automatically", status: "Not Connected" },
    { id: "stripe", name: "Stripe", description: "Accept payments", status: "Not Connected" },
  ];

  const sendTestNotification = async () => {
    setSendingTest(true);
    try {
      await notify({
        type: "test",
        title: "Test Notification",
        body: "Your notification system is working perfectly! 🎉",
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
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6 hover:bg-primary/5">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your account and preferences</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Tabs defaultValue="account" className="space-y-8">
            <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid h-auto p-1">
              <TabsTrigger value="account" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5">
                <User className="mr-2 h-4 w-4" />
                Account
              </TabsTrigger>
              <TabsTrigger value="notifications" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5">
                <Bell className="mr-2 h-4 w-4" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="integrations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground py-2.5">
                <Zap className="mr-2 h-4 w-4" />
                Integrations
              </TabsTrigger>
            </TabsList>

            {/* Account Settings */}
            <TabsContent value="account" className="space-y-6">
              <Card className="border-2 border-border/50 shadow-lg">
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
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input
                        id="timezone"
                        value={formData.timezone}
                        onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                        placeholder="UTC"
                        className="h-11"
                      />
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
                    <p className="text-xs text-muted-foreground">
                      Email cannot be changed directly. Contact support if needed.
                    </p>
                  </div>
                  <Button onClick={saveProfile} disabled={saving} className="h-11">
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-2 border-border/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Palette className="h-5 w-5 text-primary" />
                    </div>
                    Appearance
                  </CardTitle>
                  <CardDescription>
                    Customize the look and feel of the application
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-base">Dark Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Toggle between light and dark themes
                      </p>
                    </div>
                    <Switch
                      checked={theme === "dark"}
                      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="grid sm:grid-cols-2 gap-6">
                <Card className="border-2 border-border/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-lg">
                      <Lock className="h-5 w-5 text-primary" />
                      Password & Security
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full h-11">Change Password</Button>
                  </CardContent>
                </Card>

                <Card className="border-2 border-border/50 shadow-lg">
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

            {/* Notification Settings */}
            <TabsContent value="notifications" className="space-y-6">
              <Card className="border-2 border-border/50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Bell className="h-5 w-5 text-primary" />
                    </div>
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>
                    Choose how you want to receive notifications
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-base">Push Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive browser notifications for important events
                      </p>
                    </div>
                    <Switch
                      checked={formData.pushNotifications}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, pushNotifications: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
                    <div className="space-y-1">
                      <Label className="text-base">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive email updates about appointments and activity
                      </p>
                    </div>
                    <Switch
                      checked={formData.emailNotifications}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, emailNotifications: checked })
                      }
                    />
                  </div>
                  <Button onClick={sendTestNotification} disabled={sendingTest} variant="outline" className="h-11">
                    <Zap className="mr-2 h-4 w-4" />
                    {sendingTest ? "Sending..." : "Send Test Notification"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Integration Settings */}
            <TabsContent value="integrations" className="space-y-6">
              <div className="grid gap-6">
                {integrations.map((integration) => (
                  <Card key={integration.id} className="border-2 border-border/50 shadow-lg hover:border-primary/20 transition-colors">
                    <CardHeader>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Globe className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="flex items-center gap-3 text-lg">
                              {integration.name}
                              <Badge variant="outline" className="text-xs">{integration.status}</Badge>
                            </CardTitle>
                            <CardDescription className="mt-1">{integration.description}</CardDescription>
                          </div>
                        </div>
                        <Button variant="outline" disabled className="h-11 sm:w-auto w-full">
                          <Zap className="mr-2 h-4 w-4" />
                          Connect Later
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
