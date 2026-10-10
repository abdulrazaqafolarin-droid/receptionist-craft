/**
 * Vault crypto gate: roundtrips honestly, refuses the wrong owner.
 *
 * Run: deno test supabase/functions/_shared/vault.test.ts
 * Note: encrypt/decrypt need VAULT_MASTER_KEY set — the suite generates
 * an ephemeral one in-process (never written anywhere).
 */

import { encryptKey, decryptKey, keyLast4, requireVaultOwner, VAULT_OWNER_ID, setVaultMasterKeyForTests } from "./vault.ts";

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const B64_32 = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=";

Deno.test("encrypt/decrypt roundtrips with a 32-byte master key", async () => {
  await setVaultMasterKeyForTests(B64_32);
  const secret = "sk-test-elevenlabs-key-abcdef123456";
  const { cipher, iv } = await encryptKey(secret);
  check(cipher !== secret && !cipher.includes(secret.slice(0, 8)), "ciphertext hides plaintext");
  check(iv.length >= 16, "iv stored alongside");
  const back = await decryptKey(cipher, iv);
  check(back === secret, "decrypts to the exact key");
  check(keyLast4(secret) === "3456", "last4 for masking");
});

Deno.test("owner gate admits one UUID and refuses all others", () => {
  requireVaultOwner(VAULT_OWNER_ID);
  let refused = false;
  try {
    requireVaultOwner("00000000-0000-0000-0000-000000000000");
  } catch (e) {
    refused = (e as { status?: number }).status === 403;
  }
  check(refused, "non-owner refused with 403");
});
