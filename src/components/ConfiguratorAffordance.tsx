import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wand2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ConversationalManagement } from "@/components/ConversationalManagement";

interface ConfiguratorAffordanceProps {
  receptionistId: string;
  context: string;
  title?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  className?: string;
}

export function ConfiguratorAffordance({
  receptionistId,
  context,
  title = "Tell me what to change",
  label = "Tell me what to change",
  variant = "outline",
  className,
}: ConfiguratorAffordanceProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={variant} className={className}>
          <Wand2 className="h-4 w-4 mr-2" />
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-2 border-b border-border">
          <SheetTitle>
            <span className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              {title}
            </span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {context}
            </Badge>
            <Badge variant="outline" className="text-xs text-primary">
              On this page
            </Badge>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-hidden relative">
          <ConversationalManagement receptionistId={receptionistId} />
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-background">
          <p className="text-xs text-muted-foreground">
            Approve a change anytime, or test it in a live conversation first.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setOpen(false);
              navigate(`/test/${receptionistId}`);
            }}
          >
            <FlaskConical className="h-4 w-4 mr-1.5" />
            Test conversation
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
