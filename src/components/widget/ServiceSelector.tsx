import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, DollarSign, Briefcase, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

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
  initialLimit?: number;
}

export function ServiceSelector({ services, onSelect, disabled, initialLimit = 10 }: ServiceSelectorProps) {
  const [showAll, setShowAll] = useState(false);
  
  const displayedServices = showAll ? services : services.slice(0, initialLimit);
  const hasMore = services.length > initialLimit;
  const remainingCount = services.length - initialLimit;

  return (
    <div className="space-y-2 mt-3 animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <p className="text-xs text-muted-foreground mb-2 font-medium">Choose a service:</p>
      {displayedServices.map((service, idx) => (
        <Card
          key={service.id}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={`Select ${service.name}${service.price ? `, $${service.price.toFixed(0)}` : ''}`}
          className={cn(
            "p-3 cursor-pointer transition-all duration-200",
            "hover:border-primary hover:shadow-lg hover:scale-[1.01] active:scale-[0.98]",
            "group relative overflow-hidden",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onClick={() => !disabled && onSelect(service.id, service.name)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) onSelect(service.id, service.name); }}
          style={{ animationDelay: `${idx * 75}ms` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/0 to-primary/5 group-hover:from-primary/5 group-hover:via-primary/3 group-hover:to-primary/10 transition-all duration-300" />
          <div className="relative flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-200">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm group-hover:text-primary transition-colors">{service.name}</h4>
              {service.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{service.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                {service.duration_minutes > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                    <Clock className="h-2.5 w-2.5 mr-0.5" />
                    {service.duration_minutes} min
                  </Badge>
                )}
                {service.price !== null && service.price !== undefined && service.price > 0 && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 text-primary border-primary/30">
                    <DollarSign className="h-2.5 w-2.5" />
                    {service.price.toFixed(0)}
                  </Badge>
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all duration-200 flex-shrink-0" />
          </div>
        </Card>
      ))}
      
      {/* Show More / Show Less Button */}
      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground hover:text-primary mt-2 pressable"
          onClick={() => setShowAll(!showAll)}
          disabled={disabled}
          aria-label={showAll ? "Show fewer services" : `Show ${remainingCount} more services`}
        >
          {showAll ? (
            <>
              Show Less
              <ChevronDown className="h-4 w-4 ml-1 rotate-180" />
            </>
          ) : (
            <>
              Show More ({remainingCount} more)
              <ChevronDown className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      )}
    </div>
  );
}