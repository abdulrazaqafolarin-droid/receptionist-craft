import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Palette, Sparkles, MessageSquare } from "lucide-react";

interface WidgetSettingsProps {
  receptionistId: string;
}

export function WidgetSettings({ receptionistId }: WidgetSettingsProps) {
  const [colors, setColors] = useState({
    primary: "#667eea",
    background: "#ffffff",
    text: "#000000",
  });

  const [greeting, setGreeting] = useState("");
  const [quickReplies, setQuickReplies] = useState([
    "Book Appointment",
    "View Services",
    "Contact Us"
  ]);

  const widgetUrl = `${window.location.origin}/widget?rid=${receptionistId}`;
  const embedCode = `<iframe src="${widgetUrl}" width="100%" height="600" frameborder="0"></iframe>`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Widget Customization
        </CardTitle>
        <CardDescription>
          Customize how your chat widget looks and behaves
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="appearance">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="appearance">
              <Palette className="mr-2 h-4 w-4" />
              Appearance
            </TabsTrigger>
            <TabsTrigger value="behavior">
              <MessageSquare className="mr-2 h-4 w-4" />
              Behavior
            </TabsTrigger>
            <TabsTrigger value="install">Install</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primary-color">Primary Color</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="primary-color"
                    type="color"
                    value={colors.primary}
                    onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                    className="w-20 h-10"
                  />
                  <Input
                    value={colors.primary}
                    onChange={(e) => setColors({ ...colors, primary: e.target.value })}
                    placeholder="#667eea"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bg-color">Background Color</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="bg-color"
                    type="color"
                    value={colors.background}
                    onChange={(e) => setColors({ ...colors, background: e.target.value })}
                    className="w-20 h-10"
                  />
                  <Input
                    value={colors.background}
                    onChange={(e) => setColors({ ...colors, background: e.target.value })}
                    placeholder="#ffffff"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="text-color">Text Color</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="text-color"
                    type="color"
                    value={colors.text}
                    onChange={(e) => setColors({ ...colors, text: e.target.value })}
                    className="w-20 h-10"
                  />
                  <Input
                    value={colors.text}
                    onChange={(e) => setColors({ ...colors, text: e.target.value })}
                    placeholder="#000000"
                  />
                </div>
              </div>

              <Button className="w-full">Save Appearance Settings</Button>
            </div>
          </TabsContent>

          <TabsContent value="behavior" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="greeting">Custom Greeting Message</Label>
                <Input
                  id="greeting"
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  placeholder="Hi! How can I help you today?"
                />
              </div>

              <div className="space-y-2">
                <Label>Quick Reply Buttons</Label>
                {quickReplies.map((reply, idx) => (
                  <Input
                    key={idx}
                    value={reply}
                    onChange={(e) => {
                      const newReplies = [...quickReplies];
                      newReplies[idx] = e.target.value;
                      setQuickReplies(newReplies);
                    }}
                  />
                ))}
                <Button variant="outline" className="w-full">
                  Add Quick Reply
                </Button>
              </div>

              <Button className="w-full">Save Behavior Settings</Button>
            </div>
          </TabsContent>

          <TabsContent value="install" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Direct Link</Label>
                <div className="flex gap-2">
                  <Input value={widgetUrl} readOnly />
                  <Button
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(widgetUrl)}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Embed Code (iFrame)</Label>
                <div className="flex gap-2">
                  <Input value={embedCode} readOnly />
                  <Button
                    variant="outline"
                    onClick={() => navigator.clipboard.writeText(embedCode)}
                  >
                    Copy
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2">Installation Instructions</h4>
                <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                  <li>Copy the embed code above</li>
                  <li>Paste it into your website's HTML where you want the chat to appear</li>
                  <li>The widget will automatically match your customization settings</li>
                  <li>Test the widget to ensure it's working correctly</li>
                </ol>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}