import { useState } from "react";
import { useOrganization, Organization } from "@/hooks/useOrganization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Building2, Users, MapPin, Palette, Plus, Trash2, Crown, Shield, User, Eye, Globe } from "lucide-react";
import { LoadingState } from "@/components/LoadingState";

const roleIcons: Record<string, typeof Crown> = {
  owner: Crown,
  admin: Shield,
  member: User,
  viewer: Eye,
};

const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  owner: "default",
  admin: "secondary",
  member: "outline",
  viewer: "outline",
};

export default function OrganizationPage() {
  const {
    organizations, currentOrg, setCurrentOrg, members, locations, loading,
    createOrganization, updateOrganization, addMember, removeMember, addLocation, removeLocation,
  } = useOrganization();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationPhone, setLocationPhone] = useState("");

  const handleCreateOrg = async () => {
    if (!newOrgName || !newOrgSlug) return;
    const result = await createOrganization(newOrgName, newOrgSlug);
    if (result) {
      setShowCreateDialog(false);
      setNewOrgName("");
      setNewOrgSlug("");
      setCurrentOrg(result as Organization);
    }
  };

  const handleAddMember = async () => {
    if (!currentOrg || !memberEmail) return;
    const ok = await addMember(currentOrg.id, memberEmail, memberRole);
    if (ok) {
      setShowAddMember(false);
      setMemberEmail("");
      setMemberRole("member");
    }
  };

  const handleAddLocation = async () => {
    if (!currentOrg || !locationName) return;
    const ok = await addLocation(currentOrg.id, {
      name: locationName,
      address: locationAddress || undefined,
      phone: locationPhone || undefined,
    });
    if (ok) {
      setShowAddLocation(false);
      setLocationName("");
      setLocationAddress("");
      setLocationPhone("");
    }
  };

  if (loading) return <LoadingState message="Loading organizations..." />;

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organization</h1>
          <p className="text-muted-foreground">Manage your agency, team, and locations</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New Organization
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Organization</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  placeholder="My Agency"
                  value={newOrgName}
                  onChange={(e) => {
                    setNewOrgName(e.target.value);
                    setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-"));
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input placeholder="my-agency" value={newOrgSlug} onChange={(e) => setNewOrgSlug(e.target.value)} />
              </div>
              <Button onClick={handleCreateOrg} className="w-full" disabled={!newOrgName || !newOrgSlug}>
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Org Selector */}
      {organizations.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {organizations.map((org) => (
            <Button
              key={org.id}
              variant={currentOrg?.id === org.id ? "default" : "outline"}
              size="sm"
              onClick={() => setCurrentOrg(org)}
            >
              <Building2 className="h-4 w-4 mr-1" />
              {org.name}
            </Button>
          ))}
        </div>
      )}

      {!currentOrg && organizations.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Organization Yet</h3>
            <p className="text-muted-foreground mb-4 max-w-md">
              Create an organization to manage multiple receptionists, team members, and locations from one place.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Organization
            </Button>
          </CardContent>
        </Card>
      )}

      {currentOrg && (
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general" className="gap-2"><Building2 className="h-4 w-4" /> General</TabsTrigger>
            <TabsTrigger value="members" className="gap-2"><Users className="h-4 w-4" /> Members</TabsTrigger>
            <TabsTrigger value="locations" className="gap-2"><MapPin className="h-4 w-4" /> Locations</TabsTrigger>
            <TabsTrigger value="branding" className="gap-2"><Palette className="h-4 w-4" /> White Label</TabsTrigger>
          </TabsList>

          {/* General Tab */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>Basic information about your organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={currentOrg.name}
                      onChange={(e) => setCurrentOrg({ ...currentOrg, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug</Label>
                    <Input value={currentOrg.slug} disabled className="bg-muted" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plan</Label>
                    <Badge variant="secondary">{currentOrg.plan}</Badge>
                  </div>
                  <div className="space-y-2">
                    <Label>Limits</Label>
                    <p className="text-sm text-muted-foreground">
                      {currentOrg.max_receptionists} receptionists · {currentOrg.max_members} members
                    </p>
                  </div>
                </div>
                <Separator />
                <Button onClick={() => updateOrganization(currentOrg.id, { name: currentOrg.name })}>
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>{members.length} member{members.length !== 1 ? "s" : ""}</CardDescription>
                </div>
                <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Member</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input placeholder="team@example.com" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={memberRole} onValueChange={setMemberRole}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button onClick={handleAddMember} className="w-full" disabled={!memberEmail}>Add Member</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {members.map((member) => {
                    const RoleIcon = roleIcons[member.role] || User;
                    return (
                      <div key={member.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-accent flex items-center justify-center">
                            <RoleIcon className="h-4 w-4 text-accent-foreground" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{member.user_id.slice(0, 8)}...</p>
                            <Badge variant={roleBadgeVariant[member.role] || "outline"} className="text-xs">
                              {member.role}
                            </Badge>
                          </div>
                        </div>
                        {member.role !== "owner" && (
                          <Button variant="ghost" size="icon" onClick={() => removeMember(member.id, currentOrg.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {members.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">No team members yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Locations Tab */}
          <TabsContent value="locations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Locations</CardTitle>
                  <CardDescription>Manage multiple business locations</CardDescription>
                </div>
                <Dialog open={showAddLocation} onOpenChange={setShowAddLocation}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Add Location</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Add Location</DialogTitle></DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Name</Label>
                        <Input placeholder="Main Office" value={locationName} onChange={(e) => setLocationName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Address</Label>
                        <Input placeholder="123 Main St" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input placeholder="+1 234 567 890" value={locationPhone} onChange={(e) => setLocationPhone(e.target.value)} />
                      </div>
                      <Button onClick={handleAddLocation} className="w-full" disabled={!locationName}>Add Location</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {locations.map((loc) => (
                    <Card key={loc.id} className="border border-border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center mt-0.5">
                              <MapPin className="h-4 w-4 text-accent-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{loc.name}</p>
                              {loc.address && <p className="text-sm text-muted-foreground">{loc.address}</p>}
                              {loc.phone && <p className="text-sm text-muted-foreground">{loc.phone}</p>}
                              <p className="text-xs text-muted-foreground mt-1">{loc.timezone}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeLocation(loc.id, currentOrg.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {locations.length === 0 && (
                    <div className="col-span-2 text-center text-muted-foreground py-8">
                      No locations added yet
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* White Label Tab */}
          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle>White Label Configuration</CardTitle>
                <CardDescription>Customize branding for your clients</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Enable White Label</Label>
                    <p className="text-sm text-muted-foreground">Remove platform branding for your clients</p>
                  </div>
                  <Switch
                    checked={currentOrg.white_label}
                    onCheckedChange={(checked) => updateOrganization(currentOrg.id, { white_label: checked })}
                  />
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Primary Color</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={currentOrg.primary_color}
                        onChange={(e) => setCurrentOrg({ ...currentOrg, primary_color: e.target.value })}
                        className="h-10 w-10 rounded cursor-pointer border border-border"
                      />
                      <Input value={currentOrg.primary_color} onChange={(e) => setCurrentOrg({ ...currentOrg, primary_color: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Accent Color</Label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={currentOrg.accent_color}
                        onChange={(e) => setCurrentOrg({ ...currentOrg, accent_color: e.target.value })}
                        className="h-10 w-10 rounded cursor-pointer border border-border"
                      />
                      <Input value={currentOrg.accent_color} onChange={(e) => setCurrentOrg({ ...currentOrg, accent_color: e.target.value })} />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Custom Domain</Label>
                  <div className="flex gap-2 items-center">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="chat.yourdomain.com"
                      value={currentOrg.custom_domain || ""}
                      onChange={(e) => setCurrentOrg({ ...currentOrg, custom_domain: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <Input
                    placeholder="https://yourdomain.com/logo.png"
                    value={currentOrg.logo_url || ""}
                    onChange={(e) => setCurrentOrg({ ...currentOrg, logo_url: e.target.value })}
                  />
                </div>
                <Separator />
                <Button onClick={() => updateOrganization(currentOrg.id, {
                  primary_color: currentOrg.primary_color,
                  accent_color: currentOrg.accent_color,
                  custom_domain: currentOrg.custom_domain,
                  logo_url: currentOrg.logo_url,
                  white_label: currentOrg.white_label,
                })}>
                  Save Branding
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
