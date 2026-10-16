import {
  canArchiveWorker,
  canCreateOrganizationWorker,
  canEditWorker,
  canReadWorker,
  type WorkerScope,
} from "./workerAccess.ts";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const personal: WorkerScope = { organization_id: null, created_by: "user-a" };
const organizationWorker: WorkerScope = { organization_id: "org-a", created_by: "user-a" };
const member = { role: "member" };
const admin = { role: "admin" };
const viewer = { role: "viewer" };

Deno.test("personal worker access belongs to its creator", () => {
  assert(canEditWorker("user-a", personal, null), "creator edits personal worker");
  assert(canArchiveWorker("user-a", personal, null), "creator archives personal worker");
  assert(!canEditWorker("user-b", personal, admin), "other user cannot edit personal worker");
  assert(!canArchiveWorker("user-b", personal, admin), "other user cannot archive personal worker");
});

Deno.test("active organization creator can edit but not archive as a member", () => {
  assert(canReadWorker("user-a", organizationWorker, member), "active creator can read");
  assert(canEditWorker("user-a", organizationWorker, member), "active creator can edit");
  assert(!canArchiveWorker("user-a", organizationWorker, member), "member creator cannot archive org worker");
});

Deno.test("organization admins can edit and archive shared workers", () => {
  assert(canReadWorker("user-b", organizationWorker, admin), "admin can read shared worker");
  assert(canEditWorker("user-b", organizationWorker, admin), "admin can edit shared worker");
  assert(canArchiveWorker("user-b", organizationWorker, admin), "admin can archive shared worker");
});

Deno.test("viewers can create no workers and cannot edit or archive", () => {
  assert(!canCreateOrganizationWorker(viewer), "viewer cannot create org worker");
  assert(canReadWorker("user-b", organizationWorker, viewer), "viewer can read shared worker");
  assert(!canEditWorker("user-b", organizationWorker, viewer), "viewer cannot edit another creator's worker");
  assert(!canArchiveWorker("user-b", organizationWorker, viewer), "viewer cannot archive org worker");
});

Deno.test("missing membership denies organization access", () => {
  assert(!canCreateOrganizationWorker(null), "no membership cannot create");
  assert(!canReadWorker("user-a", organizationWorker, null), "former member cannot read org worker");
  assert(!canEditWorker("user-a", organizationWorker, null), "former member cannot edit org worker");
  assert(!canArchiveWorker("user-a", organizationWorker, null), "former member cannot archive org worker");
});
