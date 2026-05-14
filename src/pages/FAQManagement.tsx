import { useState, useEffect } from "react";
import { FAQManager } from "@/components/FAQManager";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { HelpCircle, Loader2 } from "lucide-react";
import { FloatingBackground } from "@/components/FloatingBackground";

export default function FAQManagement() {
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReceptionists();
  }, []);

  const loadReceptionists = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("receptionists")
        .select("id, name, business_name")
        .eq("user_id", user.id);

      if (fetchError) throw fetchError;

      if (data && data.length > 0) {
        setReceptionists(data);
        setSelectedReceptionist(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load receptionists:", err);
      setError("Could not load receptionists. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="animate-in fade-in-0 duration-300">
        <FloatingBackground variant="minimal" />
        <div className="relative z-10 container mx-auto p-6 max-w-5xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2">FAQ Management</h1>
          </div>
          <ErrorState message={error} onRetry={loadReceptionists} />
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="animate-in fade-in-0 duration-300">
        <FloatingBackground variant="minimal" />
        <div className="relative z-10 container mx-auto p-6 max-w-5xl">
          <div className="flex items-center justify-center min-h-[40vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in-0 duration-300 relative min-h-screen">
      <FloatingBackground variant="minimal" />
      <div className="relative z-10 container mx-auto p-6 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">FAQ Management</h1>
          <p className="text-muted-foreground">
            Manage frequently asked questions for your AI receptionist
          </p>
        </div>

        {receptionists.length > 0 ? (
          <>
            {receptionists.length > 1 && (
              <Card className="mb-6">
                <CardContent className="pt-6">
                  <label className="text-sm font-medium mb-2 block">Select Receptionist</label>
                  <select 
                    className="w-full px-4 py-2 border rounded-md bg-background"
                    value={selectedReceptionist} 
                    onChange={(e) => setSelectedReceptionist(e.target.value)}
                  >
                    {receptionists.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} - {r.business_name}
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>
            )}

            {selectedReceptionist && (
              <FAQManager receptionistId={selectedReceptionist} />
            )}
          </>
        ) : (
          <EmptyState
            icon={HelpCircle}
            title="No receptionists found"
            description="Create a receptionist first to manage FAQs"
          />
        )}
      </div>
    </div>
  );
}
