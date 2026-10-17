import { isDirectorVoiceOwner } from "./directorVoiceAuth.ts";

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

Deno.test("Director voice is only available to the account whose vault key it uses", () => {
  check(isDirectorVoiceOwner("owner-id", "owner-id"), "vault owner accepted");
  check(!isDirectorVoiceOwner("different-user", "owner-id"), "other authenticated user denied");
  check(!isDirectorVoiceOwner(null, "owner-id"), "unauthenticated caller denied");
  check(!isDirectorVoiceOwner("", "owner-id"), "empty identity denied");
});
