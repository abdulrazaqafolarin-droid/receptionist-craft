import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Builder() {
  const navigate = useNavigate();
  const [user] = useState<any>(null); // Will be populated from auth

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={user} />
      
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
        </Button>

        <Card className="p-8">
          <h1 className="text-3xl font-bold mb-4">Receptionist Builder</h1>
          <p className="text-muted-foreground">Coming soon - Build and customize your AI receptionist</p>
        </Card>
      </div>
    </div>
  );
}
