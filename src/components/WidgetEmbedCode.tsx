import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Code, Copy, ExternalLink, TestTube } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface WidgetEmbedCodeProps {
  receptionistId: string;
  receptionistName: string;
}

export function WidgetEmbedCode({ receptionistId, receptionistName }: WidgetEmbedCodeProps) {
  const { toast } = useToast();
  const widgetUrl = `${window.location.origin}/widget?rid=${receptionistId}`;
  
  const embedCode = `<!-- AI Receptionist Chat Widget -->
<iframe 
  src="${widgetUrl}"
  style="position: fixed; bottom: 20px; right: 20px; width: 400px; height: 600px; border: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;"
  title="${receptionistName} - AI Chat"
></iframe>`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Embed code copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Code className="h-5 w-5 text-primary" />
          <CardTitle>Embed Widget on Your Website</CardTitle>
        </div>
        <CardDescription>
          Copy this code and paste it into your website's HTML (before the closing &lt;/body&gt; tag)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Direct Link */}
        <div>
          <label className="text-sm font-medium mb-2 block">Direct Link</label>
          <div className="flex gap-2">
            <input 
              type="text" 
              value={widgetUrl} 
              readOnly 
              className="flex-1 px-3 py-2 border rounded-md bg-muted text-sm"
            />
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => copyToClipboard(widgetUrl)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => window.open(widgetUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Embed Code */}
        <div>
          <label className="text-sm font-medium mb-2 block">Embed Code (Copy & Paste)</label>
          <div className="relative">
            <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto border">
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
        </div>

        {/* Test Widget Button */}
        <Dialog>
          <DialogTrigger asChild>
            <Button className="w-full" size="lg" variant="secondary">
              <TestTube className="mr-2 h-4 w-4" />
              Test Widget in Preview
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[450px] h-[650px] p-0">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle>Widget Preview</DialogTitle>
            </DialogHeader>
            <iframe 
              src={widgetUrl}
              className="w-full h-[calc(100%-60px)] border-none"
              title="Widget Preview"
            />
          </DialogContent>
        </Dialog>

        {/* Instructions */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <h4 className="font-semibold mb-2 text-sm">How to embed:</h4>
          <ol className="text-sm space-y-1 text-muted-foreground list-decimal list-inside">
            <li>Test the widget above to make sure it works</li>
            <li>Copy the embed code</li>
            <li>Open your website's HTML file</li>
            <li>Paste the code just before the closing &lt;/body&gt; tag</li>
            <li>Save and publish your website</li>
            <li>The chat widget will appear in the bottom-right corner</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}