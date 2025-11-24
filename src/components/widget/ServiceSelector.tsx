import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface Service {
  id: string;
  name: string;
  duration_minutes: number;
  description?: string;
}

interface ServiceSelectorProps {
  services: Service[];
  onSelect: (serviceId: string, serviceName: string) => void;
  disabled?: boolean;
}

export function ServiceSelector({ services, onSelect, disabled }: ServiceSelectorProps) {
  return (
    <div className="space-y-2 mt-2">
      {services.map((service) => (
        <Card
          key={service.id}
          className={`p-3 cursor-pointer transition-all hover:border-primary ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={() => !disabled && onSelect(service.id, service.name)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h4 className="font-medium text-sm">{service.name}</h4>
              {service.description && (
                <p className="text-xs text-muted-foreground mt-1">{service.description}</p>
              )}
            </div>
            <Badge variant="secondary" className="ml-2 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {service.duration_minutes}m
            </Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}
