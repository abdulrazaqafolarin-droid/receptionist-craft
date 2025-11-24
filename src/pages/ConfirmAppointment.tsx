import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Calendar } from "lucide-react";

export default function ConfirmAppointment() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<any>(null);

  useEffect(() => {
    if (token) {
      loadAppointment();
    } else {
      setError("Invalid confirmation link");
      setLoading(false);
    }
  }, [token]);

  async function loadAppointment() {
    try {
      // Try new column first, fall back to metadata
      let query = supabase
        .from("appointments")
        .select("*");
      
      const { data: byColumn } = await query.eq("confirmation_token", token).maybeSingle();
      
      if (byColumn) {
        setAppointment(byColumn);
        return;
      }

      // Fallback to metadata check
      const { data: byMetadata } = await supabase
        .from("appointments")
        .select("*")
        .eq("metadata->>confirmation_token", token)
        .maybeSingle();

      if (byMetadata) {
        setAppointment(byMetadata);
        return;
      }

      setError("Appointment not found or token expired");
    } catch (err: any) {
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
    } catch (err: any) {
      console.error("Confirm error:", err);
      setError(err.message || "Failed to confirm appointment");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background p-4">
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
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background p-4">
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
              <p><strong>Service:</strong> {appointment.service}</p>
              <p><strong>Date:</strong> {new Date(appointment.start_time).toLocaleDateString()}</p>
              <p><strong>Time:</strong> {new Date(appointment.start_time).toLocaleTimeString()}</p>
              <p><strong>Customer:</strong> {appointment.customer_name}</p>
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
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/10 to-background p-4">
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
            <p><strong>Service:</strong> {appointment.service}</p>
            <p><strong>Date:</strong> {new Date(appointment.start_time).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}</p>
            <p><strong>Time:</strong> {new Date(appointment.start_time).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit'
            })}</p>
            <p><strong>Customer:</strong> {appointment.customer_name}</p>
            {appointment.customer_phone && (
              <p><strong>Phone:</strong> {appointment.customer_phone}</p>
            )}
            {appointment.customer_email && (
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
