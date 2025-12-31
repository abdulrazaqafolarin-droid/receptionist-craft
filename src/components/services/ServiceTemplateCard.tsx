import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, ShoppingBag, Briefcase } from "lucide-react";
import { BusinessTemplate } from "@/data/serviceTemplates";

interface ServiceTemplateCardProps {
  template: BusinessTemplate;
  onImport: () => void;
  disabled?: boolean;
}

export function ServiceTemplateCard({ template, onImport, disabled }: ServiceTemplateCardProps) {
  const getTypeIcon = () => {
    if (template.type === 'products') return <ShoppingBag className="h-5 w-5 text-primary" />;
    if (template.type === 'both') return <Briefcase className="h-5 w-5 text-primary" />;
    return <Package className="h-5 w-5 text-primary" />;
  };

  const getTypeBadge = () => {
    if (template.type === 'products') return <Badge variant="secondary">Products</Badge>;
    if (template.type === 'both') return <Badge variant="outline">Services & Products</Badge>;
    return <Badge variant="default">Services</Badge>;
  };

  return (
    <Card className="h-full hover:border-primary transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              {getTypeIcon()}
            </div>
            <div>
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <CardDescription className="text-sm mt-1">
                {template.services.length} items
              </CardDescription>
            </div>
          </div>
          {getTypeBadge()}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{template.description}</p>
        <div className="space-y-1">
          {template.services.slice(0, 3).map((service, idx) => (
            <div key={idx} className="text-xs text-muted-foreground flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
              {service.name}
              {service.type === 'product' && service.price && (
                <span className="text-primary">${service.price}</span>
              )}
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
          Import Items
        </Button>
      </CardContent>
    </Card>
  );
}
