import { Navbar } from "@/components/Navbar";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const navigate = useNavigate();

  const integrations = [
    { id: "twilio", name: "Twilio", description: "Connect your phone number for real calls", status: "Not Connected" },
    { id: "openai", name: "OpenAI", description: "Advanced AI capabilities", status: "Not Connected" },
    { id: "google_calendar", name: "Google Calendar", description: "Sync appointments automatically", status: "Not Connected" },
    { id: "stripe", name: "Stripe", description: "Accept payments", status: "Not Connected" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold mb-8">Settings & Integrations</h1>

        <div className="grid gap-6">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {integration.name}
                      <Badge variant="outline">{integration.status}</Badge>
                    </CardTitle>
                    <CardDescription>{integration.description}</CardDescription>
                  </div>
                  <Button variant="outline" disabled>
                    <Zap className="mr-2 h-4 w-4" />
                    Connect Later
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
