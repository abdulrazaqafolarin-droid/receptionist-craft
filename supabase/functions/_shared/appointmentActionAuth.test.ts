import { canPerformAppointmentAction } from "./appointmentActionAuth.ts";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

const base = {
  action: "cancel" as const,
  callerUserId: null,
  receptionistOwnerId: "owner-1",
  providedToken: null,
  cancellationToken: "cancel-secret",
  confirmationToken: "confirm-secret",
};

Deno.test("rejects unauthenticated appointment mutations without a token", () => {
  check(!canPerformAppointmentAction({ ...base, receptionistOwnerId: "owner-1" }), "no identity or token denied");
  check(!canPerformAppointmentAction({ ...base, providedToken: "wrong" }), "wrong token denied");
});

Deno.test("accepts only the action-specific customer token", () => {
  check(canPerformAppointmentAction({ ...base, providedToken: "cancel-secret" }), "cancellation token accepted for cancel");
  check(!canPerformAppointmentAction({ ...base, action: "confirm", providedToken: "cancel-secret" }), "cancel token cannot confirm");
  check(canPerformAppointmentAction({ ...base, action: "confirm", providedToken: "confirm-secret" }), "confirmation token accepted for confirm");
  check(canPerformAppointmentAction({ ...base, action: "reschedule", providedToken: "cancel-secret" }), "cancellation token allows reschedule");
});

Deno.test("accepts a verified receptionist owner without a customer token", () => {
  check(canPerformAppointmentAction({
    ...base, callerUserId: "owner-1", providedToken: null,
  }), "owner JWT authorizes owner action");
  check(!canPerformAppointmentAction({
    ...base, callerUserId: "other-user", providedToken: null,
  }), "another user is denied");
});
