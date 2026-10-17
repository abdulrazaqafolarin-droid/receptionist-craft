import { canCreateNotification } from "./notificationAuth.ts";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

Deno.test("notification target cannot be redirected to another user", () => {
  check(canCreateNotification({ callerUserId: "user-a", hasReceptionistTarget: false }), "own notification allowed");
  check(!canCreateNotification({ callerUserId: "user-a", requestedUserId: "user-b", hasReceptionistTarget: false }), "other user target denied");
});

Deno.test("receptionist-scoped notification requires ownership", () => {
  check(canCreateNotification({ callerUserId: "user-a", hasReceptionistTarget: true, receptionistOwnerId: "user-a" }), "owned receptionist allowed");
  check(!canCreateNotification({ callerUserId: "user-a", hasReceptionistTarget: true, receptionistOwnerId: "user-b" }), "foreign receptionist denied");
  check(!canCreateNotification({ callerUserId: "user-a", hasReceptionistTarget: true, receptionistOwnerId: null }), "missing owner denied");
});
