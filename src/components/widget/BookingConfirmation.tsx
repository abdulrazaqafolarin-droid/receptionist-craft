import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User, Phone, Mail, CheckCircle, Download, MapPin, Briefcase, Hash } from "lucide-react";
import { format } from "date-fns";

interface BookingConfirmationProps {
  serviceName?: string;
  service?: string;
  dateTime?: string;
  date?: string;
  time?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  contactInfo?: string;
  confirmationId?: string;
  location?: string;
  duration?: number;
  onEdit?: () => void;
  onCancel?: () => void;
}

export function BookingConfirmation({
  serviceName,
  service,
  dateTime,
  date,
  time,
  customerName,
  customerPhone,
  customerEmail,
  contactInfo,
  confirmationId,
  location,
  duration,
  onEdit,
  onCancel,
}: BookingConfirmationProps) {
  // Normalize the data - handle both old and new prop formats
  const displayService = serviceName || service || "Appointment";
  const displayDateTime = dateTime || date;
  const displayContact = contactInfo || customerEmail || customerPhone || "";
  const isEmail = displayContact?.includes('@');
  const displayId = confirmationId || crypto.randomUUID();

  const formattedDateTime = displayDateTime 
    ? format(new Date(displayDateTime), "EEEE, MMMM d, yyyy 'at' h:mm a")
    : time || "TBD";

  const formattedDate = displayDateTime
    ? format(new Date(displayDateTime), "MMMM d, yyyy")
    : "";

  const formattedTime = displayDateTime
    ? format(new Date(displayDateTime), "h:mm a")
    : time || "";

  const generateICS = () => {
    if (!displayDateTime) return;
    
    const startDate = new Date(displayDateTime);
    const endDate = new Date(startDate);
    if (duration) {
      endDate.setMinutes(endDate.getMinutes() + duration);
    } else {
      endDate.setHours(endDate.getHours() + 1); // Default 1 hour
    }
    
    const formatICSDate = (d: Date) => {
      return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AI Receptionist//Booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `DTSTART:${formatICSDate(startDate)}`,
      `DTEND:${formatICSDate(endDate)}`,
      `SUMMARY:${displayService}`,
      `DESCRIPTION:Appointment for ${customerName}${location ? `\\nLocation: ${location}` : ''}`,
      location ? `LOCATION:${location}` : "",
      `UID:${displayId}@aireceptionist.app`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");

    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `appointment-${displayId.slice(0, 8)}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4 mt-2 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="font-semibold text-sm text-green-800 dark:text-green-200">Booking Confirmed!</h4>
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <Hash className="h-3 w-3" />
              Confirmation: {displayId.slice(0, 8).toUpperCase()}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            {/* Service */}
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{displayService}</span>
              {duration && (
                <span className="text-xs text-muted-foreground">({duration} min)</span>
              )}
            </div>

            {/* Date */}
            {formattedDate && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formattedDate}</span>
              </div>
            )}

            {/* Time */}
            {formattedTime && (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{formattedTime}</span>
              </div>
            )}

            {/* Customer Name */}
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{customerName}</span>
            </div>

            {/* Contact Info */}
            {displayContact && (
              <div className="flex items-center gap-2">
                {isEmail ? (
                  <Mail className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Phone className="h-4 w-4 text-muted-foreground" />
                )}
                <span>{displayContact}</span>
              </div>
            )}

            {/* Location if provided */}
            {location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>{location}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {isEmail 
              ? "A confirmation email has been sent to your inbox."
              : "You'll receive a confirmation message shortly."
            }
          </p>

          <div className="flex gap-2 mt-2">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                className="flex-1 text-xs pressable"
                aria-label="Edit booking details"
              >
                Edit Details
              </Button>
            )}
            {onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="flex-1 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950 pressable"
                aria-label="Cancel booking"
              >
                Cancel
              </Button>
            )}
          </div>
          {displayDateTime && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateICS}
              disabled={!displayDateTime}
              className="w-full bg-green-100 dark:bg-green-900/50 border-green-200 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-900 pressable"
            >
              <Download className="h-3 w-3 mr-2" />
              Add to Calendar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}