import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeAppointmentAction } from "./authorization.ts";

Deno.test("confirmation token authorizes confirm only", () => {
  assertEquals(authorizeAppointmentAction({
    action: "confirm",
    token: "confirm-secret",
    confirmationToken: "confirm-secret",
    cancellationToken: "cancel-secret",
  }), { allowed: true, viaToken: true, actorId: null, reason: null });

  assertEquals(authorizeAppointmentAction({
    action: "cancel",
    token: "confirm-secret",
    confirmationToken: "confirm-secret",
    cancellationToken: "cancel-secret",
  }).allowed, false);
});

Deno.test("cancellation token authorizes cancel only", () => {
  assertEquals(authorizeAppointmentAction({
    action: "cancel",
    token: "cancel-secret",
    confirmationToken: "confirm-secret",
    cancellationToken: "cancel-secret",
  }), { allowed: true, viaToken: true, actorId: null, reason: null });

  assertEquals(authorizeAppointmentAction({
    action: "confirm",
    token: "cancel-secret",
    confirmationToken: "confirm-secret",
    cancellationToken: "cancel-secret",
  }).allowed, false);
});

Deno.test("wrong supplied token cannot fall back to owner authentication", () => {
  assertEquals(authorizeAppointmentAction({
    action: "cancel",
    token: "wrong-secret",
    cancellationToken: "cancel-secret",
    authenticatedUserId: "owner-id",
    receptionistOwnerId: "owner-id",
  }), { allowed: false, viaToken: false, actorId: null, reason: "invalid_token" });
});

Deno.test("missing token and anonymous caller are denied", () => {
  for (const action of ["confirm", "cancel", "reschedule"] as const) {
    assertEquals(authorizeAppointmentAction({ action }).allowed, false);
  }
});

Deno.test("authenticated owner may use the in-app action flow", () => {
  for (const action of ["confirm", "cancel", "reschedule"] as const) {
    assertEquals(authorizeAppointmentAction({
      action,
      authenticatedUserId: "owner-id",
      receptionistOwnerId: "owner-id",
    }), { allowed: true, viaToken: false, actorId: "owner-id", reason: null });
  }
});

Deno.test("non-owner cannot change appointment even with a caller-chosen user id", () => {
  assertEquals(authorizeAppointmentAction({
    action: "cancel",
    authenticatedUserId: "other-user",
    receptionistOwnerId: "owner-id",
  }).allowed, false);
});
