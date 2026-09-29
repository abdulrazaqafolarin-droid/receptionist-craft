import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, ArrowLeft, Plus, Trash2, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ConfiguratorAffordance } from "@/components/ConfiguratorAffordance";

interface StaffMember {
  id: string;
  name: string;
  role: string | null;
  active: boolean;
  created_at: string;
}

export default function StaffPage() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [saving, setSaving] = useState(false);
  const [receptionistId, setReceptionistId] = useState<string | null>(null);
  const [noReceptionist, setNoReceptionist] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setNoReceptionist(false);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: rec } = await supabase
      .from("receptionists")
      .select("id")
      .eq("user_id", user.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (!rec) {
      setNoReceptionist(true);
      setLoading(false);
      return;
    }

    setReceptionistId(rec.id);

    const { data } = await supabase
      .from("staff")
      .select("*")
      .eq("receptionist_id", rec.id)
      .order("name");

    setStaff(data ?? []);
    setLoading(false);
  }

  async function addStaff() {
    if (!newName.trim() || !receptionistId) return;
    setSaving(true);

    const { error } = await supabase.from("staff").insert({
      receptionist_id: receptionistId,
      name: newName.trim(),
      role: newRole.trim() || null,
    });

    if (error) {
      toast.error("Failed to add staff member");
    } else {
      toast.success(`${newName.trim()} added`);
      setNewName("");
      setNewRole("");
      setDialogOpen(false);
      await loadData();
    }
    setSaving(false);
  }

  async function removeStaff(id: string, name: string) {
    const { error } = await supabase
      .from("staff")
      .update({ active: false })
      .eq("id", id);

    if (error) {
      toast.error("Failed to remove staff member");
    } else {
      toast.success(`${name} removed`);
      await loadData();
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Staff</h1>
            <p className="text-muted-foreground mt-1">
              Manage team members and their availability
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {receptionistId && (
            <ConfiguratorAffordance
              receptionistId={receptionistId}
              context="Staff"
              title="Change staff"
              label="Tell me what to change"
              variant="outline"
              className="h-9"
            />
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Staff
              </Button>
            </DialogTrigger>
          <DialogContent className="glass-3">
            <DialogHeader>
              <DialogTitle>Add Staff Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="e.g. Dr. Amina"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Role (optional)</Label>
                <Input
                  placeholder="e.g. Dentist, Stylist"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                />
              </div>
              <Button
                onClick={addStaff}
                disabled={!newName.trim() || saving}
                className="w-full"
              >
                {saving ? "Adding..." : "Add Staff Member"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : noReceptionist ? (
        <Card className="border-dashed glass-1">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Create your AI operator first</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
              You need to set up your AI receptionist before you can add staff. It takes just a minute.
            </p>
            <Button onClick={() => (window.location.href = "/onboarding")}>
              Set up my AI operator
            </Button>
          </CardContent>
        </Card>
      ) : staff.length === 0 ? (
        <Card className="glass-1">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">No staff members yet</p>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Add team members to assign independent schedules and let the AI
              book the right person for each appointment.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {staff.map((member) => (
            <Card key={member.id} className="glass-1">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{member.name}</p>
                    {member.role && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Briefcase className="h-3 w-3" /> {member.role}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="default">Active</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeStaff(member.id, member.name)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {staff.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Assign staff-specific availability in the{" "}
              <button
                onClick={() => navigate("/availability")}
                className="text-primary underline underline-offset-2"
              >
                Availability
              </button>{" "}
              page by selecting a staff member.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
