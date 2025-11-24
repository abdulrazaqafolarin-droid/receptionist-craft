import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  receptionistId?: string;
  appointment?: any;
}

export function AppointmentModal({ open, onOpenChange, onSuccess, receptionistId, appointment }: AppointmentModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<any[]>([]);
  const [receptionists, setReceptionists] = useState<any[]>([]);
  
  const [selectedReceptionist, setSelectedReceptionist] = useState(receptionistId || appointment?.receptionist_id || "");
  const [serviceId, setServiceId] = useState(appointment?.service_id || "");
  const [date, setDate] = useState<Date | undefined>(appointment ? new Date(appointment.start_time) : undefined);
  const [time, setTime] = useState(appointment ? format(new Date(appointment.start_time), "HH:mm") : "09:00");
  const [customerName, setCustomerName] = useState(appointment?.customer_name || "");
  const [customerEmail, setCustomerEmail] = useState(appointment?.customer_email || "");
  const [customerPhone, setCustomerPhone] = useState(appointment?.customer_phone || "");
  const [notes, setNotes] = useState(appointment?.notes || "");

  useEffect(() => {
    if (open) {
      loadServices();
      loadReceptionists();
    }
  }, [open]);

  async function loadServices() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("services")
      .select("*")
      .eq("user_id", user.id)
      .eq("active", true);

    setServices(data || []);
  }

  async function loadReceptionists() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("receptionists")
      .select("id, name, business_name")
      .eq("user_id", user.id);

    setReceptionists(data || []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!selectedReceptionist || !serviceId || !date || !time || !customerName) {
      toast({ title: "Validation Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    if (!customerEmail && !customerPhone) {
      toast({ title: "Contact Required", description: "Please provide email or phone number", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const [hours, minutes] = time.split(":");
      const startTime = new Date(date);
      startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (appointment?.id) {
        // Update existing appointment
        const { error } = await supabase
          .from("appointments")
          .update({
            service_id: serviceId,
            start_time: startTime.toISOString(),
            customer_name: customerName,
            customer_email: customerEmail || null,
            customer_phone: customerPhone || null,
            notes: notes || null,
          })
          .eq("id", appointment.id);

        if (error) throw error;
        toast({ title: "Success", description: "Appointment updated successfully" });
      } else {
        // Create new appointment via edge function
        const { data, error } = await supabase.functions.invoke("book-appointment", {
          body: {
            receptionistId: selectedReceptionist,
            serviceId,
            startTime: startTime.toISOString(),
            customerName,
            customerEmail: customerEmail || null,
            customerPhone: customerPhone || null,
            notes: notes || null,
            bookingSource: "manual",
          }
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Failed to create appointment");
        
        toast({ title: "Success", description: "Appointment created successfully" });
      }

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      console.error("Save appointment error:", err);
      toast({ 
        title: "Error", 
        description: err.message || "Failed to save appointment", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setSelectedReceptionist(receptionistId || "");
    setServiceId("");
    setDate(undefined);
    setTime("09:00");
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{appointment ? "Edit Appointment" : "Create Appointment"}</DialogTitle>
          <DialogDescription>
            {appointment ? "Update appointment details" : "Create a new appointment manually"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!receptionistId && (
            <div className="space-y-2">
              <Label htmlFor="receptionist">Receptionist *</Label>
              <Select value={selectedReceptionist} onValueChange={setSelectedReceptionist}>
                <SelectTrigger>
                  <SelectValue placeholder="Select receptionist" />
                </SelectTrigger>
                <SelectContent>
                  {receptionists.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} - {r.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="service">Service *</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes}min)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Time *</Label>
              <Input
                id="time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerName">Customer Name *</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerEmail">Email</Label>
              <Input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerPhone">Phone</Label>
              <Input
                id="customerPhone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+1234567890"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {appointment ? "Update" : "Create"} Appointment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
