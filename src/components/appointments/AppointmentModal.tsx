import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Appointment } from "@/types/appointments";

interface AppointmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: Appointment | null;
  onSuccess?: () => void;
}

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
}

interface Receptionist {
  id: string;
  name: string;
  business_name: string;
}

export function AppointmentModal({ open, onOpenChange, appointment, onSuccess }: AppointmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [receptionists, setReceptionists] = useState<Receptionist[]>([]);
  
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [selectedService, setSelectedService] = useState("");
  const [selectedReceptionist, setSelectedReceptionist] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTime, setSelectedTime] = useState("");

  const isEditMode = !!appointment;

  useEffect(() => {
    if (open) {
      loadServices();
      loadReceptionists();
      
      if (appointment) {
        setCustomerName(appointment.customer_name);
        setCustomerPhone(appointment.customer_phone || "");
        setCustomerEmail(appointment.customer_email || "");
        setSelectedService(appointment.service_id || "");
        setSelectedReceptionist(appointment.receptionist_id);
        setSelectedDate(new Date(appointment.start_time));
        setSelectedTime(format(new Date(appointment.start_time), "HH:mm"));
      } else {
        resetForm();
      }
    }
  }, [open, appointment]);

  const resetForm = () => {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setSelectedService("");
    setSelectedDate(undefined);
    setSelectedTime("");
  };

  const loadServices = async () => {
    const { data, error } = await supabase
      .from("services")
      .select("id, name, duration_minutes")
      .eq("active", true);
    
    if (!error && data) {
      setServices(data);
    }
  };

  const loadReceptionists = async () => {
    const { data, error } = await supabase
      .from("receptionists")
      .select("id, name, business_name")
      .eq("active", true);
    
    if (!error && data) {
      setReceptionists(data);
      if (data.length === 1 && !selectedReceptionist) {
        setSelectedReceptionist(data[0].id);
      }
    }
  };

  const handleCheckAvailability = async () => {
    if (!selectedDate || !selectedTime || !selectedReceptionist) {
      toast({ title: "Missing fields", description: "Please select date, time, and receptionist", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const startDateTime = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(":");
      startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const { data, error } = await supabase.functions.invoke("check-availability", {
        body: {
          receptionist_id: selectedReceptionist,
          service_id: selectedService || null,
          startDate: startDateTime.toISOString(),
          endDate: new Date(startDateTime.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          desiredStart: startDateTime.toISOString(),
        },
      });

      if (error) throw error;

      if (data?.available) {
        toast({ title: "Available!", description: "This time slot is available for booking." });
      } else {
        toast({ 
          title: "Not available", 
          description: data?.alternatives?.length 
            ? `This slot is taken. ${data.alternatives.length} alternatives found.`
            : "This time slot is not available.",
          variant: "destructive"
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!customerName || !selectedDate || !selectedTime || !selectedReceptionist) {
      toast({ title: "Missing fields", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const startDateTime = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(":");
      startDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      const service = services.find(s => s.id === selectedService);
      const endDateTime = new Date(startDateTime.getTime() + (service?.duration_minutes || 30) * 60 * 1000);

      const { data, error } = await supabase.functions.invoke("book-appointment", {
        body: {
          receptionistId: selectedReceptionist,
          serviceId: selectedService || null,
          startTime: startDateTime.toISOString(),
          endTime: endDateTime.toISOString(),
          customerName,
          customerPhone: customerPhone || null,
          customerEmail: customerEmail || null,
          source: "manual",
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: "Success!", description: "Appointment booked successfully." });
        onSuccess?.();
        onOpenChange(false);
      } else {
        throw new Error(data?.error || "Failed to book appointment");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: "confirm" | "cancel" | "reschedule") => {
    if (!appointment?.id) return;

    setLoading(true);
    try {
      let body: any = {
        action,
        appointment_id: appointment.id,
      };

      if (action === "reschedule") {
        if (!selectedDate || !selectedTime) {
          toast({ title: "Missing fields", description: "Please select new date and time", variant: "destructive" });
          setLoading(false);
          return;
        }

        const newStartDateTime = new Date(selectedDate);
        const [hours, minutes] = selectedTime.split(":");
        newStartDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        body.new_start_time = newStartDateTime.toISOString();
      }

      const { data, error } = await supabase.functions.invoke("appointment-action", {
        body,
      });

      if (error) throw error;

      if (data?.success) {
        toast({ title: "Success!", description: `Appointment ${action}ed successfully.` });
        onSuccess?.();
        onOpenChange(false);
      } else {
        throw new Error(data?.error || `Failed to ${action} appointment`);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit Appointment" : "New Appointment"}</DialogTitle>
          <DialogDescription>
            {isEditMode ? "Update appointment details" : "Create a new appointment"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="customerName">Customer Name *</Label>
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="John Doe"
              disabled={isEditMode}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customerPhone">Customer Phone</Label>
              <Input
                id="customerPhone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+1234567890"
                disabled={isEditMode}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customerEmail">Customer Email</Label>
              <Input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="john@example.com"
                disabled={isEditMode}
              />
            </div>
          </div>

          {receptionists.length > 1 && (
            <div className="space-y-2">
              <Label>Receptionist *</Label>
              <Select value={selectedReceptionist} onValueChange={setSelectedReceptionist} disabled={isEditMode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select receptionist" />
                </SelectTrigger>
                <SelectContent>
                  {receptionists.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.business_name} ({r.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Service</Label>
            <Select value={selectedService} onValueChange={setSelectedService} disabled={isEditMode && !!appointment.service_id}>
              <SelectTrigger>
                <SelectValue placeholder="Select service" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes} min)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Time *</Label>
              <Input
                id="time"
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
              />
            </div>
          </div>

          {!isEditMode && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCheckAvailability}
              disabled={loading || !selectedDate || !selectedTime || !selectedReceptionist}
            >
              Check Availability
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-end">
          {isEditMode ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Close
              </Button>
              {appointment?.status !== "cancelled" && (
                <Button variant="destructive" onClick={() => handleAction("cancel")} disabled={loading}>
                  {loading ? "Canceling..." : "Cancel Appointment"}
                </Button>
              )}
              {appointment?.status === "booked" && (
                <Button variant="secondary" onClick={() => handleAction("confirm")} disabled={loading}>
                  {loading ? "Confirming..." : "Confirm"}
                </Button>
              )}
              <Button onClick={() => handleAction("reschedule")} disabled={loading}>
                {loading ? "Saving..." : "Reschedule"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleBookAppointment} disabled={loading}>
                {loading ? "Booking..." : "Book Appointment"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
