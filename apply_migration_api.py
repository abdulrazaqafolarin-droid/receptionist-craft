import json
import urllib.request
import os

# Read migration
migration_path = "C:/Users/HP/Downloads/receptionist-craft-main (3)/receptionist-craft-main/supabase/migrations/20260924000001_fix_receptionist_org_rls.sql"
with open(migration_path, "r") as f:
    sql = f.read()

# Split into individual statements
statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]

token = "sbp_fc612a9f7d4501b5768555be9a36194d6ed91179"
project_ref = "esvrhnlwquunsdduvbnr"

url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

for i, stmt in enumerate(statements):
    if not stmt:
        continue
    print(f"Executing statement {i+1}/{len(statements)}...")
    data = json.dumps({"query": stmt + ";"}).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        response = urllib.request.urlopen(req, timeout=60)
        result = response.read().decode()
        print(f"  OK: {result[:200]}")
    except urllib.error.HTTPError as e:
        print(f"  ERROR: {e.code} - {e.read().decode()}")
    except Exception as e:
        print(f"  EXCEPTION: {e}")

print("Done")
