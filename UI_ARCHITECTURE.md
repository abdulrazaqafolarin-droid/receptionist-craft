# UI Architecture

## Component Registry
- service_selector, product_selector, date_picker, time_picker, booking_confirmation, order_summary, lead_form.

## Trigger Graph
1. bookingResult -> booking_confirmation
2. orderResult -> order_summary
3. flow_step intent suggestion -> selector/picker
4. engine ui_hints -> selector/picker

## State Ownership
- `widget-chat/index.ts` owns final component resolution via `resolveDeterministicUIComponent`.

## Never do this
- Never merge multiple UI trigger sources without precedence.
