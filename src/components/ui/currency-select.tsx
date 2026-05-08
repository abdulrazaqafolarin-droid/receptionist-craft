import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_CURRENCIES, formatCurrency } from "@/lib/currency";

interface CurrencySelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function CurrencySelect({ value, onChange, disabled }: CurrencySelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Select currency" />
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_CURRENCIES.map((currency) => (
          <SelectItem key={currency} value={currency}>
            {currency} ({formatCurrency(1, currency)})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
