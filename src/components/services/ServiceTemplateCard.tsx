import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { BusinessTemplate } from "@/data/serviceTemplates";

interface ServiceTemplateCardProps {
  template: BusinessTemplate;
  onImport: () => void;
  disabled?: boolean;
}

export function ServiceTemplateCard({ template, onImport, disabled }: ServiceTemplateCardProps) {
  return (
    <Card className="h-full hover:border-primary transition-colors">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <CardDescription className="text-sm mt-1">
                {template.services.length} services
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{template.description}</p>
        <div className="space-y-1">
          {template.services.slice(0, 3).map((service, idx) => (
            <div key={idx} className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              {service.name}
            </div>
          ))}
          {template.services.length > 3 && (
            <div className="text-xs text-muted-foreground">
              +{template.services.length - 3} more...
            </div>
          )}
        </div>
        <Button 
          onClick={onImport} 
          disabled={disabled}
          className="w-full"
          variant="outline"
        >
          Import Services
        </Button>
      </CardContent>
    </Card>
  );
}
