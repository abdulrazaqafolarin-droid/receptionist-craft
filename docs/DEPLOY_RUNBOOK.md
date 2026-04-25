# Deploy Runbook (Termux + Vercel)

Use this when local edits are not showing on the live link.

## 1) Preflight diagnostics

```bash
python scripts/check_deploy_sync.py
```

If this reports branch/remote/upstream blockers, fix those before expecting live changes.

## 2) Push the deploy branch

```bash
git checkout main
git pull --ff-only
# (merge/cherry-pick your work here)
git push origin main
```

## 3) Trigger Vercel deploy (optional)

If you use a deploy webhook:

```bash
export VERCEL_DEPLOY_HOOK_URL='https://api.vercel.com/v1/integrations/deploy/...'
```

## 4) Verify the live URL

```bash
export APP_VERIFY_URL='https://receptionist-craft.vercel.app/money-mode'
python scripts/release_verify_vercel.py --branch main
```

## 5) Confirm UI manifestation

- Open `/money-mode`
- Confirm sidebar has **Money Mode**
- Confirm Dashboard has **Open Money Mode** card
- Confirm page shows `Build <sha>` label

If build SHA is old, deployment did not pick latest commit.
