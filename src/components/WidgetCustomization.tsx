import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Palette, Type, Image as ImageIcon, Save } from "lucide-react";

interface BusinessInfo {
  widget_customization?: {
    primary_color?: string;
    secondary_color?: string;
    logo_url?: string;
  };
  [key: string]: unknown;
}

interface ReceptionistRow {
  id: string;
  business_info: BusinessInfo | null;
  greeting_message: string | null;
  [key: string]: unknown;
}

interface WidgetCustomizationProps {
  receptionistId: string;
}

export function WidgetCustomization({ receptionistId }: WidgetCustomizationProps) {
  const queryClient = useQueryClient();
  const [primaryColor, setPrimaryColor] = useState("#667eea");
  const [secondaryColor, setSecondaryColor] = useState("#764ba2");
  const [logoUrl, setLogoUrl] = useState("");
  const [greetingMessage, setGreetingMessage] = useState("");

  const { data: receptionist, isLoading } = useQuery({
    queryKey: ["receptionist", receptionistId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("receptionists")
        .select("*")
        .eq("id", receptionistId)
        .single<ReceptionistRow>();

      if (error) throw error;

      // Load existing customization from business_info
      const businessInfo = data.business_info as BusinessInfo | null;
      const customization = businessInfo?.widget_customization || {};
      setPrimaryColor(customization.primary_color || "#667eea");
      setSecondaryColor(customization.secondary_color || "#764ba2");
      setLogoUrl(customization.logo_url || "");
      setGreetingMessage(data.greeting_message || "");

      return data;
    },
  });

  const updateCustomization = useMutation({
    mutationFn: async () => {
      const customization = {
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        logo_url: logoUrl,
      };

      const businessInfo = (receptionist?.business_info as BusinessInfo | null) || {};
      const { error } = await supabase
        .from("receptionists")
        .update({
          business_info: {
            ...businessInfo,
            widget_customization: customization,
          },
          greeting_message: greetingMessage,
        })
        .eq("id", receptionistId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["receptionist", receptionistId] });
      toast.success("Widget customization saved successfully!");
    },
    onError: (error) => {
      toast.error(`Failed to save customization: ${error.message}`);
    },
  });

  if (isLoading) {
    return <div>Loading customization options...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Widget Appearance
          </CardTitle>
          <CardDescription>
            Customize the look and feel of your AI receptionist widget
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primary-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-20 cursor-pointer"
                />
                <Input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#667eea"
                  className="flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondary-color">Secondary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="secondary-color"
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-10 w-20 cursor-pointer"
                />
                <Input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  placeholder="#764ba2"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo-url" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Logo URL
            </Label>
            <Input
              id="logo-url"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-muted-foreground">
              Enter a URL to your business logo (recommended: 200x200px)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="greeting" className="flex items-center gap-2">
              <Type className="h-4 w-4" />
              Greeting Message
            </Label>
            <Textarea
              id="greeting"
              value={greetingMessage}
              onChange={(e) => setGreetingMessage(e.target.value)}
              placeholder="Hi! How can I help you today?"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              This message will be shown when customers first open the widget
            </p>
          </div>

          <Button
            onClick={() => updateCustomization.mutate()}
            disabled={updateCustomization.isPending}
            className="w-full gap-2"
          >
            <Save className="h-4 w-4" />
            {updateCustomization.isPending ? "Saving..." : "Save Customization"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
          <CardDescription>See how your widget will look</CardDescription>
        </CardHeader>
        <CardContent>
          <div 
            className="rounded-lg p-6 shadow-lg" 
            style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              color: "white",
            }}
          >
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Business Logo"
                className="h-12 w-12 rounded-full mb-4 bg-white p-1"
              />
            )}
            <p className="font-medium">{greetingMessage || "Hi! How can I help you today?"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
