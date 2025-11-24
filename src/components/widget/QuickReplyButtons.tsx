import { Button } from "@/components/ui/button";

interface QuickReplyButton {
  label: string;
  value: string;
}

interface QuickReplyButtonsProps {
  buttons: QuickReplyButton[];
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function QuickReplyButtons({ buttons, onSelect, disabled }: QuickReplyButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {buttons.map((button) => (
        <Button
          key={button.value}
          variant="outline"
          size="sm"
          onClick={() => onSelect(button.value)}
          disabled={disabled}
          className="text-xs"
        >
          {button.label}
        </Button>
      ))}
    </div>
  );
}
