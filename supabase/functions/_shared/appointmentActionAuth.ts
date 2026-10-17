export type AppointmentAction = "confirm" | "cancel" | "reschedule";

export interface AppointmentActionAccess {
  action: AppointmentAction;
  callerUserId: string | null;
  receptionistOwnerId: string | null;
  providedToken: string | null;
  cancellationToken: string | null;
  confirmationToken: string | null;
}

/** Owner JWT or action-specific appointment token is required for mutations. */
export function canPerformAppointmentAction(input: AppointmentActionAccess): boolean {
  if (input.callerUserId && input.receptionistOwnerId && input.callerUserId === input.receptionistOwnerId) {
    return true;
  }

  const expected = input.action === "confirm"
    ? input.confirmationToken
    : input.cancellationToken;
  if (!input.providedToken || !expected) return false;

  // Tokens are random secrets. Compare without an early exit on differing
  // characters so token verification does not reveal the matching prefix.
  let difference = input.providedToken.length ^ expected.length;
  const length = Math.max(input.providedToken.length, expected.length);
  for (let i = 0; i < length; i++) {
    difference |= (input.providedToken.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return difference === 0;
}
