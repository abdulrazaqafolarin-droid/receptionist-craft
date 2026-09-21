import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Clock, User, Mail, Phone, CalendarIcon, Ban, Loader2 } from "lucide-react";
import { useState } from "react";
import type { CalendarEvent } from "./types";
import type { Appointment } from "@/types/appointments";

interface AppointmentMetadata {
  booked_via_chat?: boolean;
  [key: string]: unknown;
}

interface SlotDetailDialogProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlockSlot: (start: Date, end: Date, reason: string) => Promise<void>;
}

export function SlotDetailDialog({ event, open, onOpenChange, onBlockSlot }: SlotDetailDialogProps) {
  const [blocking, setBlocking] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [showBlockForm, setShowBlockForm] = useState(false);

  if (!event) return null;

  const handleBlock = async () => {
    setBlocking(true);
    try {
      await onBlockSlot(event.start, event.end, blockReason);
      setBlockReason("");
      setShowBlockForm(false);
      onOpenChange(false);
    } finally {
      setBlocking(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setShowBlockForm(false);
      setBlockReason("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {event.type === "appointment" && <User className="h-5 w-5 text-primary" />}
            {event.type === "available" && <CalendarIcon className="h-5 w-5 text-success" />}
            {event.type === "blocked" && <Ban className="h-5 w-5 text-destructive" />}
            {event.type === "appointment"
              ? event.appointment?.customer_name || "Appointment"
              : event.type === "blocked"
              ? "Blocked Time"
              : "Available Slot"}
          </DialogTitle>
          <DialogDescription>
            {format(event.start, "EEEE, MMMM d, yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Time */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              {format(event.start, "h:mm a")} – {format(event.end, "h:mm a")}
            </span>
          </div>

          {/* Status badge */}
          <Badge
            variant={
              event.type === "appointment"
                ? "default"
                : event.type === "available"
                ? "secondary"
                : "destructive"
            }
          >
            {event.type === "appointment"
              ? event.appointment?.status || "booked"
              : event.type === "available"
              ? "Available"
              : "Blocked"}
          </Badge>

          {/* Appointment details */}
          {event.type === "appointment" && event.appointment && (
            <div className="space-y-3 border-t pt-3">
              {event.appointment.service && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Service:</span>
                  <p className="font-medium">{event.appointment.service}</p>
                </div>
              )}
              {event.appointment.customer_email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${event.appointment.customer_email}`} className="hover:underline">
                    {event.appointment.customer_email}
                  </a>
                </div>
              )}
              {event.appointment.customer_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${event.appointment.customer_phone}`} className="hover:underline">
                    {event.appointment.customer_phone}
                  </a>
                </div>
              )}
              {event.appointment.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Notes:</span>
                  <p className="mt-1">{event.appointment.notes}</p>
                </div>
              )}
              {(event.appointment.metadata as AppointmentMetadata)?.booked_via_chat && (
                <Badge variant="outline" className="text-xs">
                  Booked via AI Chat
                </Badge>
              )}
            </div>
          )}

          {/* Blocked reason */}
          {event.type === "blocked" && event.reason && (
            <div className="text-sm border-t pt-3">
              <span className="text-muted-foreground">Reason:</span>
              <p className="mt-1">{event.reason}</p>
            </div>
          )}

          {/* Block action for available slots */}
          {event.type === "available" && !showBlockForm && (
            <Button
              variant="outline"
              className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => setShowBlockForm(true)}
            >
              <Ban className="mr-2 h-4 w-4" />
              Block This Slot
            </Button>
          )}

          {showBlockForm && (
            <div className="space-y-3 border-t pt-3">
              <div className="space-y-2">
                <Label htmlFor="blockReason">Reason (optional)</Label>
                <Textarea
                  id="blockReason"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Lunch break, Personal time..."
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleBlock}
                  disabled={blocking}
                >
                  {blocking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm Block
                </Button>
                <Button variant="outline" onClick={() => setShowBlockForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
