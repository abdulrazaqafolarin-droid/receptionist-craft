export interface BookingPreValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PreValidationInput {
  serviceId: string | null;
  startTime: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s\-\+\(\)]{7,20}$/;

export function preValidateBooking(input: PreValidationInput): BookingPreValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!input.serviceId) {
    errors.push("Service is required");
  }

  if (!input.startTime) {
    errors.push("Date and time are required");
  } else {
    const start = new Date(input.startTime);
    if (isNaN(start.getTime())) {
      errors.push("Invalid date/time format");
    } else {
      const now = new Date();
      if (start < now) {
        errors.push("Cannot book in the past");
      }
      const msUntilBooking = start.getTime() - now.getTime();
      const hoursUntilBooking = msUntilBooking / (1000 * 60 * 60);
      if (hoursUntilBooking < 1) {
        errors.push("Booking must be at least 1 hour in advance");
      }
      const daysUntilBooking = msUntilBooking / (1000 * 60 * 60 * 24);
      if (daysUntilBooking > 60) {
        errors.push("Cannot book more than 60 days in advance");
      }
    }
  }

  if (!input.customerName || input.customerName.length < 2) {
    errors.push("Customer name is required (minimum 2 characters)");
  }

  if (!input.customerEmail && !input.customerPhone) {
    errors.push("At least one contact method (email or phone) is required");
  }

  if (input.customerEmail && !EMAIL_REGEX.test(input.customerEmail)) {
    warnings.push("Email format appears invalid");
  }

  if (input.customerPhone && !PHONE_REGEX.test(input.customerPhone)) {
    warnings.push("Phone format appears invalid");
  }

  return { valid: errors.length === 0, errors, warnings };
}
