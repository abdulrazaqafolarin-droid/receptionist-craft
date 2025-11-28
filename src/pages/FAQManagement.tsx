import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { FAQManager } from "@/components/FAQManager";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { HelpCircle } from "lucide-react";

export default function FAQManagement() {
  const [receptionists, setReceptionists] = useState<any[]>([]);
  const [selectedReceptionist, setSelectedReceptionist] = useState<string>("");

  useEffect(() => {
    loadReceptionists();
  }, []);

  const loadReceptionists = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("receptionists")
      .select("id, name, business_name")
      .eq("user_id", user.id);

    if (data && data.length > 0) {
      setReceptionists(data);
      setSelectedReceptionist(data[0].id);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container mx-auto p-6 max-w-5xl">
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
    </>
  );
}
