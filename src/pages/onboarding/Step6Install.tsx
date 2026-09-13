import { useNavigate } from "react-router-dom";
import { useOnboardingStore } from "@/store/onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Code, Copy, ExternalLink, Check, Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordSignal } from "@/lib/successSignals";

export default function Step6Install() {
  const navigate = useNavigate();
  const { receptionist, receptionistId, reset } = useOnboardingStore();
  const widgetUrl = `${window.location.origin}/widget?rid=${receptionistId}`;

  const embedCode = `<!-- AI Receptionist Chat Widget -->
<iframe 
  src="${widgetUrl}"
  style="position: fixed; bottom: 20px; right: 20px; width: 400px; height: 600px; border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;"
  title="${receptionist.name} - AI Chat"
></iframe>`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  const handleFinish = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
      }
      recordSignal("configured_operator", { path: "form", receptionist_id: receptionistId });
      reset();
      toast.success("🎉 Your AI Receptionist is live!");
      navigate("/dashboard");
    } catch (error) {
      console.error("Error completing onboarding:", error);
      navigate("/dashboard");
    }
  };

  return (
    <Card className="liquid-glass">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <CardTitle>Install Your Widget</CardTitle>
        </div>
        <CardDescription>
          Choose how you want to add your AI receptionist to your website
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Success Message */}
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold mb-2">
            <Check className="h-5 w-5" />
            Your AI Receptionist is Ready!
          </div>
          <p className="text-sm text-muted-foreground">
            {receptionist.name} is configured and ready to handle customer inquiries 24/7
          </p>
        </div>

        {/* Option 1: Copy Embed Code */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="default">Option 1</Badge>
            <h4 className="font-semibold">Copy/Paste HTML Embed Code</h4>
          </div>
          <div className="relative">
            <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto border max-h-32">
              <code>{embedCode}</code>
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2"
              onClick={() => copyToClipboard(embedCode)}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 text-xs">
            <p className="font-medium mb-1">How to embed:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground">
              <li>Copy the code above</li>
              <li>Paste it into your website's HTML before the closing &lt;/body&gt; tag</li>
              <li>Save and publish your website</li>
            </ol>
          </div>
        </div>

        {/* Option 2: Direct Link */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Option 2</Badge>
            <h4 className="font-semibold">Share Direct Link</h4>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={widgetUrl}
              readOnly
              className="flex-1 px-3 py-2 border rounded-md bg-muted text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => copyToClipboard(widgetUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open(widgetUrl, "_blank")}>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Share this link directly with customers or use it to test your receptionist
          </p>
        </div>

        {/* Option 3: Coming Soon */}
        <div className="space-y-3 opacity-50">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Coming Soon</Badge>
            <h4 className="font-semibold">WordPress Plugin</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            One-click installation for WordPress websites. Stay tuned!
          </p>
        </div>

        {/* Option 4: Webhooks */}
        <div className="space-y-3 opacity-50">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Advanced</Badge>
            <h4 className="font-semibold">Webhook Integrations</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Connect to Zapier, Make, or custom webhooks for advanced workflows
          </p>
        </div>

        {/* Finish Button */}
        <Button onClick={handleFinish} size="lg" className="w-full">
          <Check className="mr-2 h-5 w-5" />
          Go to Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
