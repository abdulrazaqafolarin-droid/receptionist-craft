import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";

export default function CancelAppointment() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<any>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (token) {
      loadAppointment();
    } else {
      setError("Invalid cancellation link");
      setLoading(false);
    }
  }, [token]);

  async function loadAppointment() {
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

      if (appt.status === "cancelled") {
        setError("This appointment has already been cancelled");
        return;
      }

      setAppointment(appt);
    } catch (err: any) {
      console.error("Load appointment error:", err);
      setError("Failed to load appointment");
    } finally {
      setLoading(false);
    }
  }

  async function cancelAppointment() {
    if (!appointment) return;
    
    setCancelling(true);
    try {
      const { data, error: cancelErr } = await supabase.functions.invoke("appointment-action", {
        body: {
          appointmentId: appointment.id,
          action: "cancel",
          token,
          cancellationToken: token,
          reason: reason || "Customer cancelled via link"
        }
      });

      if (cancelErr) throw cancelErr;
      
      if (!data?.success) {
        throw new Error(data?.error || "Cancellation failed");
      }

      setSuccess(true);
    } catch (err: any) {
      console.error("Cancel error:", err);
      setError(err.message || "Failed to cancel appointment");
    } finally {
      setCancelling(false);
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
              <CardTitle>Appointment Cancelled</CardTitle>
            </div>
            <CardDescription>Your appointment has been successfully cancelled</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p><strong>Service:</strong> {appointment.service}</p>
              <p><strong>Date:</strong> {new Date(appointment.start_time).toLocaleDateString()}</p>
              <p><strong>Time:</strong> {new Date(appointment.start_time).toLocaleTimeString()}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              If you'd like to reschedule, please contact the business directly.
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
            <AlertTriangle className="h-6 w-6 text-destructive" />
            <CardTitle>Cancel Appointment</CardTitle>
          </div>
          <CardDescription>Are you sure you want to cancel this appointment?</CardDescription>
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
          </div>

          <div>
            <Label htmlFor="reason">Cancellation Reason (Optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Let us know why you're cancelling..."
              className="mt-2"
            />
          </div>

          <Button 
            onClick={cancelAppointment} 
            disabled={cancelling}
            variant="destructive"
            className="w-full"
            size="lg"
          >
            {cancelling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              <>
                <XCircle className="mr-2 h-4 w-4" />
                Cancel Appointment
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            This action cannot be undone. You'll need to book a new appointment if you change your mind.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
