import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, Copy, ExternalLink, CheckCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WidgetSettings } from "@/components/WidgetSettings";
import { WidgetCustomization } from "@/components/WidgetCustomization";

export default function WidgetInstall() {
  const { id: receptionistId } = useParams();
  const [receptionist, setReceptionist] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (receptionistId) {
      loadReceptionist();
    }
  }, [receptionistId]);

  async function loadReceptionist() {
    const { data } = await supabase
      .from("receptionists")
      .select("*")
      .eq("id", receptionistId)
      .single();
    
    if (data) {
      setReceptionist(data);
    }
  }

  const widgetUrl = `${window.location.origin}/widget?rid=${receptionistId}`;
  
  const embedCode = `<!-- AI Receptionist Widget -->
<iframe 
  src="${widgetUrl}"
  width="100%" 
  height="600" 
  frameborder="0"
  style="border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"
></iframe>`;

  const floatingButtonCode = `<!-- Floating AI Receptionist Button -->
<script>
  (function() {
    const btn = document.createElement('button');
    btn.innerHTML = '💬';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;background:#667eea;color:white;border:none;font-size:24px;cursor:pointer;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    btn.onclick = () => window.open('${widgetUrl}', 'AIChat', 'width=400,height=600');
    document.body.appendChild(btn);
  })();
</script>`;

  const reactCode = `// React Component Integration
import { useState } from 'react';

export function AIReceptionistWidget() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 bg-primary text-white p-4 rounded-full shadow-lg"
      >
        💬 Chat with us
      </button>
      
      {isOpen && (
        <div className="fixed bottom-20 right-4 w-96 h-[600px] shadow-2xl rounded-lg overflow-hidden">
          <iframe 
            src="${widgetUrl}"
            width="100%" 
            height="100%" 
            frameBorder="0"
          />
        </div>
      )}
    </>
  );
}`;

  const wordpressCode = `<!-- Add to WordPress Theme or Widget -->
<div class="ai-receptionist-container" style="max-width: 600px; margin: 2rem auto;">
  <iframe 
    src="${widgetUrl}"
    width="100%" 
    height="600" 
    frameborder="0"
    loading="lazy"
  ></iframe>
</div>`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied to clipboard!`);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!receptionist) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto p-6">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      
      
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Install Your AI Receptionist</h1>
          <p className="text-muted-foreground">
            Add {receptionist.name} to your website in minutes
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Preview Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Live Preview
              </CardTitle>
              <CardDescription>
                See how your widget looks to customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="aspect-[4/5] border rounded-lg overflow-hidden bg-muted">
                <iframe 
                  src={widgetUrl}
                  width="100%" 
                  height="100%" 
                  frameBorder="0"
                  className="bg-white"
                />
              </div>
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => window.open(widgetUrl, "_blank")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open in New Tab
              </Button>
            </CardContent>
          </Card>

          {/* Direct Link */}
          <Card>
            <CardHeader>
              <CardTitle>Direct Link</CardTitle>
              <CardDescription>
                Share this link directly with customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input value={widgetUrl} readOnly className="font-mono text-sm" />
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(widgetUrl, "Link")}
                >
                  {copied === "Link" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Use cases:
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  <li>Add to email signatures</li>
                  <li>Share on social media</li>
                  <li>Include in marketing materials</li>
                  <li>Send to customers directly</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Installation Code */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              Installation Code
            </CardTitle>
            <CardDescription>
              Copy and paste these snippets into your website
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="install">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="install">Installation</TabsTrigger>
                <TabsTrigger value="customization">Customization</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
              
              <TabsContent value="install">
                <Tabs defaultValue="embed">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="embed">Embed</TabsTrigger>
                    <TabsTrigger value="floating">Floating Button</TabsTrigger>
                    <TabsTrigger value="react">React</TabsTrigger>
                    <TabsTrigger value="wordpress">WordPress</TabsTrigger>
                  </TabsList>

              <TabsContent value="embed" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Simple iFrame Embed</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(embedCode, "Embed Code")}
                    >
                      {copied === "Embed Code" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs">
                    <code>{embedCode}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground">
                    Perfect for dedicated chat pages or landing pages. Paste this anywhere in your HTML.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="floating" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Floating Chat Button</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(floatingButtonCode, "Floating Button Code")}
                    >
                      {copied === "Floating Button Code" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs">
                    <code>{floatingButtonCode}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground">
                    Adds a floating chat button in the bottom-right corner. Paste before closing &lt;/body&gt; tag.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="react" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">React Component</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(reactCode, "React Code")}
                    >
                      {copied === "React Code" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs">
                    <code>{reactCode}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground">
                    For React, Next.js, or other modern frameworks. Import and use this component.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="wordpress" className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">WordPress Embed</h4>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(wordpressCode, "WordPress Code")}
                    >
                      {copied === "WordPress Code" ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <pre className="p-4 bg-muted rounded-lg overflow-x-auto text-xs">
                    <code>{wordpressCode}</code>
                  </pre>
                  <p className="text-sm text-muted-foreground">
                    Add to WordPress using a Custom HTML block or HTML widget. Works with any theme.
                  </p>
                </div>
                </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="customization" className="space-y-4">
                <WidgetCustomization receptionistId={receptionistId!} />
              </TabsContent>

              <TabsContent value="settings" className="space-y-4">
                <WidgetSettings receptionistId={receptionistId!} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Help Section */}
        <Card className="mt-6 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Need Help?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Having trouble installing? Here are some quick tips:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-4">
              <li>Make sure your receptionist is set to "Active" in settings</li>
              <li>Test the widget in the preview before installing</li>
              <li>For WordPress, use a Custom HTML block in the page editor</li>
              <li>The floating button works on any website - just paste before &lt;/body&gt;</li>
              <li>For React/Next.js apps, use the React component code</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}