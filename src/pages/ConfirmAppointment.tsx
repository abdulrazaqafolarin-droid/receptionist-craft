import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Calendar } from "lucide-react";

interface AppointmentData {
  id: string;
  service: string;
  start_time: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  [key: string]: unknown;
}

export default function ConfirmAppointment() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<AppointmentData | null>(null);

  useEffect(() => {
    if (token) {
      loadAppointment();
    } else {
      setError("Invalid confirmation link");
      setLoading(false);
    }
  }, [token]);

  async function loadAppointment() {
    if (!token) return;
    try {
      // Use the secure RPC function that works without auth
      const { data, error: rpcError } = await supabase
        .rpc("get_appointment_by_token", { p_token: token });

      if (rpcError) throw rpcError;

      const appt = Array.isArray(data) ? data[0] : data;

      if (!appt) {
        setError("Appointment not found or token expired");
        return;
      }

      setAppointment(appt);
    } catch (err) {
      console.error("Load appointment error:", err);
      setError("Failed to load appointment");
    } finally {
      setLoading(false);
    }
  }

  async function confirmAppointment() {
    if (!appointment) return;
    
    setConfirming(true);
    try {
      const { data, error: confirmErr } = await supabase.functions.invoke("appointment-action", {
        body: {
          appointmentId: appointment.id,
          action: "confirm",
          token,
          confirmationToken: token
        }
      });

      if (confirmErr) throw confirmErr;
      
      if (!data?.success) {
        throw new Error(data?.error || "Confirmation failed");
      }

      setSuccess(true);
    } catch (err) {
      console.error("Confirm error:", err);
      const message = err instanceof Error ? err.message : "Failed to confirm appointment";
      setError(message);
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Error</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-4">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <CardTitle>Appointment Confirmed!</CardTitle>
            </div>
            <CardDescription>Your appointment has been successfully confirmed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p><strong>Service:</strong> {appointment?.service ?? "Unknown"}</p>
              <p><strong>Date:</strong> {appointment?.start_time ? new Date(appointment.start_time).toLocaleDateString() : "Unknown"}</p>
              <p><strong>Time:</strong> {appointment?.start_time ? new Date(appointment.start_time).toLocaleTimeString() : "Unknown"}</p>
              <p><strong>Customer:</strong> {appointment?.customer_name ?? "Unknown"}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              You will receive a reminder 24 hours before your appointment.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            <CardTitle>Confirm Your Appointment</CardTitle>
          </div>
          <CardDescription>Please confirm your appointment details below</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg space-y-2">
            <p><strong>Service:</strong> {appointment?.service ?? "Unknown"}</p>
            <p><strong>Date:</strong> {appointment?.start_time ? new Date(appointment.start_time).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }) : "Unknown"}</p>
            <p><strong>Time:</strong> {appointment?.start_time ? new Date(appointment.start_time).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            }) : "Unknown"}</p>
            <p><strong>Customer:</strong> {appointment?.customer_name ?? "Unknown"}</p>
            {appointment?.customer_phone && (
              <p><strong>Phone:</strong> {appointment.customer_phone}</p>
            )}
            {appointment?.customer_email && (
              <p><strong>Email:</strong> {appointment.customer_email}</p>
            )}
          </div>

          <Button 
            onClick={confirmAppointment} 
            disabled={confirming}
            className="w-full"
            size="lg"
          >
            {confirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirming...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Confirm Appointment
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            By confirming, you agree to attend this appointment at the scheduled time.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
