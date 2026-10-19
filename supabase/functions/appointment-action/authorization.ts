export type AppointmentAction = "confirm" | "cancel" | "reschedule";

export interface AppointmentActionAuthorizationInput {
  action: AppointmentAction;
  token?: string | null;
  confirmationToken?: string | null;
  cancellationToken?: string | null;
  authenticatedUserId?: string | null;
  receptionistOwnerId?: string | null;
}

export interface AppointmentActionAuthorization {
  allowed: boolean;
  viaToken: boolean;
  actorId: string | null;
  reason: "invalid_token" | "owner_auth_required" | null;
}

/**
 * A public confirmation/cancellation link is a bearer credential and must match
 * the token for that exact action. Without a token, only the authenticated
 * receptionist owner may change the appointment. A caller-supplied userId is
 * deliberately not part of this contract.
 */
export function authorizeAppointmentAction(
  input: AppointmentActionAuthorizationInput,
): AppointmentActionAuthorization {
  if (input.action !== "reschedule" && input.token) {
    const expectedToken = input.action === "confirm"
      ? input.confirmationToken
      : input.cancellationToken;

    if (!expectedToken || input.token !== expectedToken) {
      return {
        allowed: false,
        viaToken: false,
        actorId: null,
        reason: "invalid_token",
      };
    }

    return {
      allowed: true,
      viaToken: true,
      actorId: null,
      reason: null,
    };
  }

  const isOwner = Boolean(
    input.authenticatedUserId &&
      input.receptionistOwnerId &&
      input.authenticatedUserId === input.receptionistOwnerId,
  );

  if (!isOwner) {
    return {
      allowed: false,
      viaToken: false,
      actorId: null,
      reason: "owner_auth_required",
    };
  }

  return {
    allowed: true,
    viaToken: false,
    actorId: input.authenticatedUserId!,
    reason: null,
  };
}
