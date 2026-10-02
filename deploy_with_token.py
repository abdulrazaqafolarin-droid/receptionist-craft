import json
import urllib.request

def read_clean(path):
    with open(path, "rb") as f:
        content = f.read()
    return content.decode('utf-8', errors='ignore')

meo_path = "C:/Users/HP/Downloads/receptionist-craft-main (3)/receptionist-craft-main/supabase/functions/meo-insights/index.ts"
widget_path = "C:/Users/HP/Downloads/receptionist-craft-main (3)/receptionist-craft-main/supabase/functions/widget-chat/index.ts"

meo_sql = read_clean(meo_path)
widget_sql = read_clean(widget_path)

token = "sbp_fc6b2217ad1d58b348e747f0bb0898f1346c4ac0"
project_ref = "esvrhnlwquunsdduvbnr"

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# Check existing functions
url = f"https://api.supabase.com/v1/projects/{project_ref}/functions"
req = urllib.request.Request(url, headers=headers, method="GET")
try:
    resp = urllib.request.urlopen(req)
    functions = json.load(resp)
    print("Existing functions:", [f['slug'] for f in functions])
except Exception as e:
    print(f"Error listing functions: {e}")
    functions = []

# Deploy meo-insights
print("\n=== Deploying meo-insights ===")
deploy_url = f"https://api.supabase.com/v1/projects/{project_ref}/functions/meo-insights"
data = json.dumps({"slug": "meo-insights", "name": "meo-insights", "body": meo_sql, "verify_jwt": False}).encode()
req = urllib.request.Request(deploy_url, data=data, headers=headers, method="POST")
try:
    resp = urllib.request.urlopen(req)
    print(f"meo-insights POST: {resp.read().decode()[:200]}")
except urllib.error.HTTPError as e:
    print(f"meo-insights POST error: {e.code} - {e.read().decode()}")
    req = urllib.request.Request(deploy_url, data=data, headers=headers, method="PATCH")
    try:
        resp = urllib.request.urlopen(req)
        print(f"meo-insights PATCH: {resp.read().decode()[:200]}")
    except urllib.error.HTTPError as e2:
        print(f"meo-insights PATCH error: {e2.code} - {e2.read().decode()}")

# Deploy widget-chat
print("\n=== Updating widget-chat ===")
widget_url = f"https://api.supabase.com/v1/projects/{project_ref}/functions/widget-chat"
data = json.dumps({"slug": "widget-chat", "name": "widget-chat", "body": widget_sql, "verify_jwt": False}).encode()
req = urllib.request.Request(widget_url, data=data, headers=headers, method="PATCH")
try:
    resp = urllib.request.urlopen(req)
    print(f"widget-chat PATCH: {resp.read().decode()[:200]}")
except urllib.error.HTTPError as e:
    print(f"widget-chat error: {e.code} - {e.read().decode()}")

print("\nDone")
