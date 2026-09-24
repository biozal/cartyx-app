#!/usr/bin/env python3
"""
Empty the dev environment's media stores, for a clean slate.

Wipes:
  - all locally-served upload files under public/uploads/.
  - all objects in the R2 (S3) object store.

The data itself lives in the graph and is emptied by `npm run dev:clear`
(scripts/seed/cli.ts), which runs this script first. User accounts are kept there,
so the seed can reuse them and you stay logged in.

Usage:
    npm run dev:clear
    npm run dev:clear -- --force    # skip confirmation

Safety: refuses to run if NODE_ENV is "production" or if R2_BUCKET contains "prod"
(the latter enforced by r2_util).
"""

import os
import shutil
import sys
from pathlib import Path

from dotenv import load_dotenv

from r2_util import get_r2_client, r2_env

load_dotenv()

# Repo root anchored to this script's location (scripts/ is one level down)
REPO_ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------

def require_safe_environment() -> None:
    if os.environ.get("NODE_ENV") == "production":
        sys.exit("Refusing to run in production.")


# ---------------------------------------------------------------------------
# Clear steps
# ---------------------------------------------------------------------------

def clear_local_uploads() -> int:
    """Remove every locally-served upload under public/uploads/ (keep the dir)."""
    uploads_dir = REPO_ROOT / "public" / "uploads"
    if not uploads_dir.is_dir():
        print("  skip  public/uploads/ (does not exist)")
        return 0
    removed = 0
    for entry in uploads_dir.iterdir():
        if entry.is_dir():
            shutil.rmtree(entry)
        else:
            entry.unlink()
        removed += 1
    print(f"  clear public/uploads/ — {removed} entr(ies) removed")
    return removed


def clear_r2_bucket() -> int:
    """Delete every object in the R2 bucket. No-op if R2 isn't configured."""
    env = r2_env()  # shared env detection + prod-bucket guard (r2_util)
    if not env:
        print("  skip  R2 (not configured — R2_* env vars missing)")
        return 0
    bucket = env["R2_BUCKET"]

    s3 = get_r2_client(env)
    deleted = 0
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        objs = page.get("Contents", [])
        # delete_objects accepts up to 1000 keys per request.
        for i in range(0, len(objs), 1000):
            batch = [{"Key": o["Key"]} for o in objs[i : i + 1000]]
            if not batch:
                continue
            s3.delete_objects(Bucket=bucket, Delete={"Objects": batch, "Quiet": True})
            deleted += len(batch)
    print(f"  clear R2 bucket '{bucket}' — {deleted} object(s) removed")
    return deleted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    require_safe_environment()
    force = "--force" in sys.argv
    bucket = os.environ.get("R2_BUCKET") or "(not configured)"

    if not force:
        print("\nThis will PERMANENTLY DELETE, for a clean test environment:")
        print("  - all files under public/uploads/")
        print(f"  - all objects in the R2 bucket '{bucket}'")
        if input("Proceed? (y/N) ").strip().lower() != "y":
            print("Aborted.")
            sys.exit(1)

    print("\nLocal uploads:")
    clear_local_uploads()
    print("\nR2 object store:")
    clear_r2_bucket()
    print("\nDone. public/uploads/ and the R2 bucket emptied.")


if __name__ == "__main__":
    main()
