import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  custom_domain: string | null;
  white_label: boolean;
  plan: string;
  max_receptionists: number;
  max_members: number;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: string;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  profile?: { email: string; full_name: string | null };
}

export interface OrgLocation {
  id: string;
  organization_id: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  is_primary: boolean;
  metadata: any;
  created_at: string;
}

export function useOrganization() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOrganizations = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching organizations:", error);
    } else {
      setOrganizations(data || []);
      if (data && data.length > 0 && !currentOrg) {
        setCurrentOrg(data[0]);
      }
    }
    setLoading(false);
  };

  const fetchMembers = async (orgId: string) => {
    const { data, error } = await supabase
      .from("organization_members")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at");

    if (error) {
      console.error("Error fetching members:", error);
    } else {
      setMembers(data || []);
    }
  };

  const fetchLocations = async (orgId: string) => {
    const { data, error } = await supabase
      .from("organization_locations")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at");

    if (error) {
      console.error("Error fetching locations:", error);
    } else {
      setLocations(data || []);
    }
  };

  const createOrganization = async (name: string, slug: string) => {
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name, slug })
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return null;
    }
    toast({ title: "Organization created", description: `${name} is ready` });
    await fetchOrganizations();
    return data;
  };

  const updateOrganization = async (id: string, updates: Partial<Organization>) => {
    const { error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Updated", description: "Organization settings saved" });
    await fetchOrganizations();
    return true;
  };

  const addMember = async (orgId: string, email: string, role: string) => {
    // Find user by email in profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (!profile) {
      toast({ title: "User not found", description: "No user with that email exists", variant: "destructive" });
      return false;
    }

    const { error } = await supabase
      .from("organization_members")
      .insert({
        organization_id: orgId,
        user_id: profile.id,
        role: role as any,
      });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Member added", description: `${email} added as ${role}` });
    await fetchMembers(orgId);
    return true;
  };

  const removeMember = async (memberId: string, orgId: string) => {
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Member removed" });
    await fetchMembers(orgId);
    return true;
  };

  const addLocation = async (orgId: string, location: { name: string; address?: string; phone?: string; timezone?: string }) => {
    const { error } = await supabase
      .from("organization_locations")
      .insert({ organization_id: orgId, ...location });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Location added" });
    await fetchLocations(orgId);
    return true;
  };

  const removeLocation = async (locationId: string, orgId: string) => {
    const { error } = await supabase
      .from("organization_locations")
      .delete()
      .eq("id", locationId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Location removed" });
    await fetchLocations(orgId);
    return true;
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  useEffect(() => {
    if (currentOrg) {
      fetchMembers(currentOrg.id);
      fetchLocations(currentOrg.id);
    }
  }, [currentOrg?.id]);

  return {
    organizations,
    currentOrg,
    setCurrentOrg,
    members,
    locations,
    loading,
    createOrganization,
    updateOrganization,
    addMember,
    removeMember,
    addLocation,
    removeLocation,
    refetch: fetchOrganizations,
  };
}
