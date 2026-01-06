import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, DollarSign, Briefcase } from "lucide-react";

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  description?: string;
  price?: number | null;
}

interface ServiceSelectorProps {
  services: Service[];
  onSelect: (serviceId: string, serviceName: string) => void;
  disabled?: boolean;
}

export function ServiceSelector({ services, onSelect, disabled }: ServiceSelectorProps) {
  return (
    <div className="space-y-2 mt-2">
      <p className="text-xs text-muted-foreground mb-2">Select a service:</p>
      {services.map((service) => (
        <Card
          key={service.id}
          className={`p-3 cursor-pointer transition-all hover:border-primary hover:shadow-md ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={() => !disabled && onSelect(service.id, service.name)}
        >
          <div className="flex items-start gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm">{service.name}</h4>
              {service.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{service.description}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {service.duration_minutes > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {service.duration_minutes}m
                </Badge>
              )}
              {service.price !== null && service.price !== undefined && service.price > 0 && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {service.price.toFixed(2)}
                </Badge>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
