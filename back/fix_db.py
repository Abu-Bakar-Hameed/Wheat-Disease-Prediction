"""
WheatGuard AI – Database Fix Script
1. Adds image_url column to predictions table
2. Backfills image_url for all records whose filename exists in storage
Run: .\.venv\Scripts\python.exe fix_db.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.database.database import get_supabase_client

BUCKET = "wheat-images"
BASE_URL = "https://foudommhzaoxaacokzht.supabase.co/storage/v1/object/public/wheat-images"

client = get_supabase_client()

# ── Step 1: Add image_url column using direct HTTP to Supabase SQL endpoint ──
print("Step 1: Adding image_url column via Supabase SQL API...")

import urllib.request, json as _json

# Credentials come from the environment / .env via the app config — never
# hardcode a Supabase secret key in source (it would leak into git history).
from app.core.config import settings

SUPABASE_URL = settings.supabase_url
SERVICE_KEY  = settings.supabase_service_role_key

# Use Supabase REST SQL execution endpoint
sql_payload = _json.dumps({"query": "ALTER TABLE predictions ADD COLUMN IF NOT EXISTS image_url TEXT;"}).encode()
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
    data=sql_payload,
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    },
    method="POST"
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(f"  SQL API response: {resp.status}")
except Exception as e:
    print(f"  SQL RPC not available ({e}) — trying column detection...")

# Verify column exists now
try:
    client.table("predictions").select("image_url").limit(1).execute()
    print("  image_url column exists ✓")
except Exception as e:
    if "42703" in str(e) or "does not exist" in str(e).lower():
        print("\n  MANUAL STEP REQUIRED:")
        print("  1. Open https://supabase.com/dashboard/project/foudommhzaoxaacokzht/sql")
        print("  2. Run this SQL:")
        print("     ALTER TABLE predictions ADD COLUMN IF NOT EXISTS image_url TEXT;")
        print("  3. Then re-run this script.")
        sys.exit(1)

# ── Step 2: List all files in storage ────────────────────────────────────────
print("\nStep 2: Listing files in storage...")
try:
    files = client.storage.from_(BUCKET).list("images")
    storage_files = {f["name"]: f for f in (files or [])}
    print(f"  Found {len(storage_files)} files in storage")
    for name in sorted(storage_files.keys()):
        print(f"    • {name}")
except Exception as e:
    print(f"  ERROR listing storage: {e}")
    sys.exit(1)

# ── Step 3: Fetch all records with null image_url ────────────────────────────
print("\nStep 3: Fetching records with null image_url...")
try:
    resp = client.table("predictions").select("id, filename, image_url").execute()
    all_records = resp.data or []
    null_records = [r for r in all_records if not r.get("image_url")]
    print(f"  Total records: {len(all_records)}")
    print(f"  Records with null image_url: {len(null_records)}")
except Exception as e:
    print(f"  ERROR fetching records: {e}")
    sys.exit(1)

# ── Step 4: Backfill image_url for matching filenames ────────────────────────
print("\nStep 4: Backfilling image_url...")
updated = 0
skipped = 0

for record in null_records:
    record_id = record["id"]
    filename = record["filename"]

    # Check if this exact filename exists in storage
    if filename in storage_files:
        public_url = f"{BASE_URL}/images/{filename}"
        try:
            client.table("predictions").update({"image_url": public_url}).eq("id", record_id).execute()
            print(f"  ✓ Updated {filename[:50]:50s} → {public_url[:70]}...")
            updated += 1
        except Exception as e:
            print(f"  ✗ Failed to update {filename}: {e}")
    else:
        skipped += 1

print(f"\n  Updated: {updated} records")
print(f"  Skipped (no matching file in storage): {skipped} records")

# ── Step 5: Reset the cached column check so backend picks up the new column ─
print("\nStep 5: Verifying result...")
try:
    resp = client.table("predictions").select("id, filename, image_url").limit(5).order("created_at", desc=True).execute()
    for row in resp.data or []:
        url_display = (row.get("image_url") or "NULL")[:80]
        print(f"  {row['filename'][:40]:40s} | {url_display}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\nDone! ✓")
print("\nNOTE: Restart the backend server so it picks up the updated column cache.")
print("  venv\\Scripts\\uvicorn.exe app.main:app --reload --port 8000")
