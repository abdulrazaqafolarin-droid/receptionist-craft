# Vault master key — set once, rotate rarely

`VAULT_MASTER_KEY` is already set as a Supabase secret (32 random bytes,
base64). It encrypts every provider key in `api_keys` with AES-256-GCM.
It lives ONLY in secrets — never in code, never in the client, never here.

## Rotating it (breaks-glass only)

Rotating the master key orphans every stored ciphertext, so rotation
means re-adding keys:

1. In the Director → lock icon → Key vault, reveal each active key and
   copy it somewhere safe (each reveal is audit-logged).
2. Revoke every key in the panel.
3. Generate and set a new secret (Management API or dashboard):
   `python3 -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"`
   → set as `VAULT_MASTER_KEY`.
4. Redeploy any function importing `_shared/vault.ts` (they cache the key
   per isolate; a fresh deploy picks up the new one).
5. Re-add the keys through the panel.

## If it leaks

Treat it as a full vault breach: rotate as above AND rotate every
provider key at its provider (ElevenLabs, etc.), since ciphertext + a
leaked master key = plaintext.

## Test checklist (vault)

- [ ] Logged in as the vault account: panel lists keys masked (••••1234)
- [ ] Add key → appears masked, audit row `create`
- [ ] Reveal → confirm dialog → plaintext shows, copy works, clears in 30s, audit row `reveal`
- [ ] 11th reveal within an hour → 429 rate limit message
- [ ] Rotate → last4 updates, old value gone, audit row `rotate`
- [ ] Revoke → status flips, Director voice still works only if another active key exists, audit row `revoke`
- [ ] Logged in as any OTHER account: vault functions 403, safe view empty
- [ ] No token: 401. Wrong origin: 403.
- [ ] `director-voice` speaks without any key in the browser (vault proxy path)
