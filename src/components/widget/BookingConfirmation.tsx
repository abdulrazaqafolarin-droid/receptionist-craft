import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User, Phone, CheckCircle, Download } from "lucide-react";
import { format } from "date-fns";

interface BookingConfirmationProps {
  service: string;
  date: string;
  time: string;
  customerName: string;
  customerPhone: string;
  confirmationId: string;
}

export function BookingConfirmation({
  service,
  date,
  time,
  customerName,
  customerPhone,
  confirmationId,
}: BookingConfirmationProps) {
  const generateICS = () => {
    const startDate = new Date(date);
    const formattedDate = format(startDate, "yyyyMMdd'T'HHmmss");
    
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `DTSTART:${formattedDate}`,
      `SUMMARY:${service} Appointment`,
      `DESCRIPTION:Appointment for ${customerName}`,
      `UID:${confirmationId}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    const blob = new Blob([icsContent], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "appointment.ics";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-4 mt-2 bg-primary/5 border-primary/20">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <CheckCircle className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="font-semibold text-sm">Booking Confirmed!</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Confirmation ID: {confirmationId.slice(0, 8)}
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{service}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{time}</span>
            </div>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{customerName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{customerPhone}</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={generateICS}
            className="w-full"
          >
            <Download className="h-3 w-3 mr-2" />
            Add to Calendar
          </Button>
        </div>
      </div>
    </Card>
  );
}
