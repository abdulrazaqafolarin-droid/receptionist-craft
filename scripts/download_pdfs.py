#!/usr/bin/env python3
"""
Download PDFs from Supabase Storage for OCR processing.
"""
import os
import sys
from pathlib import Path
from supabase import create_client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

PDF_FILES = {
    "biology": "jamb-pdfs/biology.pdf",
    "physics": "jamb-pdfs/physics.pdf",
    "chemistry": "jamb-pdfs/chemistry.pdf",
    "mathematics": "jamb-pdfs/mathematics.pdf",
    "english": "jamb-pdfs/english.pdf",
}

LOCAL_DIR = Path("pdfs")
LOCAL_DIR.mkdir(exist_ok=True)

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
        sys.exit(1)
    
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    for subject, storage_path in PDF_FILES.items():
        local_path = LOCAL_DIR / f"{subject}.pdf"
        
        if local_path.exists():
            print(f"✓ {subject}.pdf already exists")
            continue
        
        print(f"Downloading {subject}.pdf...")
        try:
            response = supabase.storage.from_("jamb-pdfs").download(storage_path)
            
            with open(local_path, "wb") as f:
                f.write(response)
            
            print(f"✓ Downloaded {subject}.pdf ({local_path.stat().st_size} bytes)")
        except Exception as e:
            print(f"✗ Failed to download {subject}.pdf: {e}")
            local_path.touch()
    
    print("PDF download complete")

if __name__ == "__main__":
    main()