import psycopg2
from urllib.parse import quote_plus

password = "Folarin2103"
host = "aws-1-eu-west-2.pooler.supabase.com"
port = "5432"
user = "postgres.esvrhnlwquunsdduvbnr"
dbname = "postgres"

conn_str = f"postgresql://{user}:{quote_plus(password)}@{host}:{port}/{dbname}"

try:
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    cur = conn.cursor()
    
    with open("supabase/migrations/20260924000001_fix_receptionist_org_rls.sql", "r") as f:
        sql = f.read()
    
    print("Applying migration...")
    cur.execute(sql)
    print("Migration applied successfully!")
    
    # Verify
    cur.execute("""
        SELECT policyname, tablename FROM pg_policies 
        WHERE tablename IN ('receptionists', 'staff')
        ORDER BY tablename, policyname;
    """)
    policies = cur.fetchall()
    print("\nCurrent policies:")
    for p in policies:
        print(f"  - {p[1]}: {p[0]}")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
