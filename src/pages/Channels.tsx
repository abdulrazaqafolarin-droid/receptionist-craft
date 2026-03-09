import { useState, useEffect } from "react";
import { MessageSquare, Phone, CheckCircle2, XCircle, Copy, ExternalLink, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Receptionist {
  id: string;
  name: string;
  business_name: string;
}

interface ChannelConfig {
  receptionist_id?: string;
  phone_number_id?: string;
  account_sid?: string;
  phone_number?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;

const webhookUrl = (fnName: string) =>
  `https://${PROJECT_ID}.supabase.co/functions/v1/${fnName}`;

export default function Channels() {
  const { toast } = useToast();
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  const [loading, setLoading] = useState(true);

  // WhatsApp state
  const [waConfig, setWaConfig] = useState<ChannelConfig>({});
  const [waEnabled, setWaEnabled] = useState(false);
  const [waSaving, setWaSaving] = useState(false);

  // Phone / Twilio state
  const [phoneConfig, setPhoneConfig] = useState<ChannelConfig>({});
  const [phoneEnabled, setPhoneEnabled] = useState(false);
  const [phoneSaving, setPhoneSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: recs }, { data: integrations }] = await Promise.all([
      supabase.from("receptionists").select("id, name, business_name").eq("user_id", user.id).eq("active", true),
      supabase.from("integrations").select("*").eq("user_id", user.id),
    ]);

    setReceptionists(recs ?? []);

    const wa = integrations?.find((i) => i.type === "whatsapp");
    if (wa) {
      setWaEnabled(wa.enabled ?? false);
      setWaConfig((wa.config_json as ChannelConfig) ?? {});
    }

    const ph = integrations?.find((i) => i.type === "twilio");
    if (ph) {
      setPhoneEnabled(ph.enabled ?? false);
      setPhoneConfig((ph.config_json as ChannelConfig) ?? {});
    }

    setLoading(false);
  }

  async function saveIntegration(type: "whatsapp" | "twilio", config: ChannelConfig, enabled: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from("integrations")
      .select("id")
      .eq("type", type)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("integrations")
        .update({ config_json: config as Record<string, string>, enabled })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("integrations")
        .insert({ type, user_id: user.id, config_json: config as Record<string, string>, enabled });
      if (error) throw error;
    }
  }

  async function handleSaveWhatsApp() {
    setWaSaving(true);
    try {
      await saveIntegration("whatsapp", waConfig, waEnabled);
      toast({ title: "WhatsApp channel saved" });
    } catch (e: unknown) {
      toast({ title: "Error saving", description: (e as Error).message, variant: "destructive" });
    } finally {
      setWaSaving(false);
    }
  }

  async function handleSavePhone() {
    setPhoneSaving(true);
    try {
      await saveIntegration("twilio", phoneConfig, phoneEnabled);
      toast({ title: "Phone channel saved" });
    } catch (e: unknown) {
      toast({ title: "Error saving", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPhoneSaving(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Channels</h1>
        <p className="text-muted-foreground mt-1">
          Connect your AI receptionist to WhatsApp, phone calls, and more.
        </p>
      </div>

      <Tabs defaultValue="whatsapp">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> WhatsApp
          </TabsTrigger>
          <TabsTrigger value="phone" className="flex items-center gap-2">
            <Phone className="h-4 w-4" /> Phone (Twilio)
          </TabsTrigger>
        </TabsList>

        {/* ── WhatsApp Tab ─────────────────────────────────────────── */}
        <TabsContent value="whatsapp" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    WhatsApp Business
                  </CardTitle>
                  <CardDescription>
                    Receive and reply to WhatsApp messages through your AI receptionist via Meta Cloud API.
                  </CardDescription>
                </div>
                <Badge variant={waEnabled ? "default" : "secondary"} className="flex items-center gap-1">
                  {waEnabled ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {waEnabled ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Receptionist selector */}
              <div className="space-y-2">
                <Label>Receptionist</Label>
                <Select
                  value={waConfig.receptionist_id ?? ""}
                  onValueChange={(v) => setWaConfig((c) => ({ ...c, receptionist_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a receptionist…" />
                  </SelectTrigger>
                  <SelectContent>
                    {receptionists.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} – {r.business_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Phone Number ID */}
              <div className="space-y-2">
                <Label htmlFor="wa-phone-id">Phone Number ID</Label>
                <Input
                  id="wa-phone-id"
                  placeholder="Meta phone number ID"
                  value={waConfig.phone_number_id ?? ""}
                  onChange={(e) => setWaConfig((c) => ({ ...c, phone_number_id: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Found in Meta Developer Portal → WhatsApp → API Setup
                </p>
              </div>

              {/* Webhook URL */}
              <div className="space-y-2">
                <Label>Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={webhookUrl("whatsapp-webhook")} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(webhookUrl("whatsapp-webhook"), "Webhook URL")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste this URL in Meta Developer Portal → Webhooks. Verify Token: <code className="bg-muted px-1 rounded">rutex_verify</code>
                </p>
              </div>

              {/* Setup instructions */}
              <Card className="bg-muted/40 border-border/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Info className="h-4 w-4 text-primary" /> Setup Steps
                  </div>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Create a Meta Developer App with WhatsApp product enabled.</li>
                    <li>Add the Webhook URL above and set the Verify Token to <code>rutex_verify</code>.</li>
                    <li>Subscribe to the <strong>messages</strong> webhook field.</li>
                    <li>Add your <strong>WHATSAPP_ACCESS_TOKEN</strong> and <strong>WHATSAPP_PHONE_NUMBER_ID</strong> as backend secrets.</li>
                    <li>Select a receptionist above and enable the channel.</li>
                  </ol>
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-xs text-primary"
                    onClick={() => window.open("https://developers.facebook.com/docs/whatsapp/cloud-api/get-started", "_blank")}
                  >
                    Meta Cloud API Docs <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={waEnabled}
                    onChange={(e) => setWaEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  Enable WhatsApp channel
                </label>
                <Button onClick={handleSaveWhatsApp} disabled={waSaving}>
                  {waSaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Phone Tab ────────────────────────────────────────────── */}
        <TabsContent value="phone" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="h-5 w-5 text-primary" />
                    Phone Calls (Twilio)
                  </CardTitle>
                  <CardDescription>
                    Handle inbound phone calls through your AI receptionist using Twilio.
                  </CardDescription>
                </div>
                <Badge variant={phoneEnabled ? "default" : "secondary"} className="flex items-center gap-1">
                  {phoneEnabled ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                  {phoneEnabled ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Receptionist */}
              <div className="space-y-2">
                <Label>Receptionist</Label>
                <Select
                  value={phoneConfig.receptionist_id ?? ""}
                  onValueChange={(v) => setPhoneConfig((c) => ({ ...c, receptionist_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a receptionist…" />
                  </SelectTrigger>
                  <SelectContent>
                    {receptionists.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} – {r.business_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Twilio phone number */}
              <div className="space-y-2">
                <Label htmlFor="twilio-phone">Twilio Phone Number</Label>
                <Input
                  id="twilio-phone"
                  placeholder="+1 (555) 000-0000"
                  value={phoneConfig.phone_number ?? ""}
                  onChange={(e) => setPhoneConfig((c) => ({ ...c, phone_number: e.target.value }))}
                />
              </div>

              {/* Account SID */}
              <div className="space-y-2">
                <Label htmlFor="twilio-sid">Account SID</Label>
                <Input
                  id="twilio-sid"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={phoneConfig.account_sid ?? ""}
                  onChange={(e) => setPhoneConfig((c) => ({ ...c, account_sid: e.target.value }))}
                />
              </div>

              {/* Voice Webhook */}
              <div className="space-y-2">
                <Label>Voice Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={webhookUrl("ai-phone-call")} className="font-mono text-xs" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(webhookUrl("ai-phone-call"), "Webhook URL")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Set this as the Voice Webhook URL in Twilio Console for your phone number (HTTP POST).
                </p>
              </div>

              {/* Instructions */}
              <Card className="bg-muted/40 border-border/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Info className="h-4 w-4 text-primary" /> Setup Steps
                  </div>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Create or log in to your Twilio account.</li>
                    <li>Purchase a phone number with Voice capability.</li>
                    <li>Set the Voice Webhook URL above (HTTP POST).</li>
                    <li>Add <strong>TWILIO_ACCOUNT_SID</strong> and <strong>TWILIO_AUTH_TOKEN</strong> as backend secrets.</li>
                    <li>Select a receptionist above and enable the channel.</li>
                  </ol>
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-xs text-primary"
                    onClick={() => window.open("https://www.twilio.com/docs/voice/twiml", "_blank")}
                  >
                    Twilio TwiML Docs <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={phoneEnabled}
                    onChange={(e) => setPhoneEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  Enable phone channel
                </label>
                <Button onClick={handleSavePhone} disabled={phoneSaving}>
                  {phoneSaving ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
