#!/usr/bin/env python3
"""
Repair missing seed-generated images WITHOUT re-seeding.

Why this exists: without the CDN configured, the dev seed writes campaign
images (generated SVGs) and player portraits into `public/uploads/`, which is
gitignored and therefore absent in a fresh checkout, a different working copy,
or after a clean. With the CDN configured (CDN_URL + R2_* env vars) the seed
uploads to R2 instead, and the bucket can likewise lose objects (e.g. a
`dev:clear` that was not followed by a full re-seed). Either way the
campaign/player documents still point at those URLs, so the images 404. This
script reads the existing documents and regenerates the files at the exact
paths they reference — local or R2 — and never touches the database.

Usage:
    npm run dev:repair-images

Safety: refuses to run if NODE_ENV is "production". Run it through
`npm run dev:repair-images`, which reads the campaigns from the graph first.
"""

import hashlib
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Reuse the seed's SVG generator + repo anchor (importing is safe — dev_seed
# guards its insertion logic behind `if __name__ == "__main__"`) and the
# shared CDN/R2 helpers.
from dev_seed import REPO_ROOT, copy_player_portraits, generate_campaign_svg
from r2_util import cdn_base, list_r2_keys, upload_to_r2

load_dotenv()

# A handful of on-theme palettes; chosen deterministically per campaign name so
# a given campaign always regenerates to the same artwork.
PALETTES = [
    {"bg": "#1a3a2a", "fg": "#e8e0d0", "accent": "#2d5a3f"},
    {"bg": "#2a1a2e", "fg": "#d4c8e0", "accent": "#4a2a5a"},
    {"bg": "#1a2a3a", "fg": "#d0e0f0", "accent": "#2a4a6a"},
    {"bg": "#3a2a1a", "fg": "#f0e4d0", "accent": "#6a4a2a"},
    {"bg": "#2a1a1a", "fg": "#f0d4d4", "accent": "#5a2a2a"},
]


def palette_for(name: str) -> dict[str, str]:
    digest = hashlib.sha1(name.encode("utf-8")).hexdigest()
    return PALETTES[int(digest, 16) % len(PALETTES)]


def public_path(image_path: str) -> Path:
    """Map a served URL like /uploads/campaigns/x.svg to its file on disk."""
    return REPO_ROOT / "public" / image_path.lstrip("/")


def served_rel_path(image_path: str) -> str | None:
    """Reduce an imagePath to its /uploads/... form, whether it is a local
    relative path or a full URL on the configured CDN. None if it is neither
    (e.g. a user upload on a different origin — not ours to recreate)."""
    if image_path.startswith("/uploads/"):
        return image_path
    base = cdn_base()
    if base and image_path.startswith(f"{base}/uploads/"):
        return image_path[len(base):]
    return None


def main() -> None:
    if os.environ.get("NODE_ENV") == "production":
        sys.exit("Refusing to run in production.")
    # Campaigns live in the graph, which this script cannot read; `scripts/repair-images.ts`
    # lists them and hands over the two fields needed here.
    listing = os.environ.get("CARTYX_REPAIR_CAMPAIGNS", "").strip()
    if not listing:
        sys.exit(
            "No campaign listing. Run `npm run dev:repair-images`, which reads the campaigns "
            "and passes CARTYX_REPAIR_CAMPAIGNS."
        )
    campaigns = json.loads(Path(listing).read_text(encoding="utf-8"))

    # 1) Player portraits — republish the committed assets (R2 upload when the
    #    CDN is configured, local copy otherwise).
    copy_player_portraits()

    # 2) Campaign images — regenerate any missing generated SVGs at whichever
    #    location the document references.
    use_cdn = bool(cdn_base())
    existing_keys = list_r2_keys("uploads/campaigns/") if use_cdn else set()
    regenerated = 0
    ok = 0
    skipped = 0
    stale_origin = 0
    for c in campaigns:
        image_path = c.get("imagePath")
        name = c.get("name") or "Campaign"
        rel = served_rel_path(image_path) if image_path else None
        if (not rel and image_path and image_path.startswith("https://")
                and "/uploads/" in image_path):
            # A seed image on some OTHER https origin — the CDN_URL was
            # rotated, or this env lacks the CDN config that wrote it. This
            # script never touches the DB, so it can't fix the doc; surface
            # it distinctly instead of lumping it in with "not ours".
            print(f"  WARNING stale CDN origin (re-seed to fix): {image_path}  ({name})")
            stale_origin += 1
            continue
        if not rel or not rel.endswith(".svg"):
            # Missing, foreign-origin, or a non-generated raster — not ours.
            skipped += 1
            continue
        cdn_hosted = rel != image_path
        if cdn_hosted:
            if rel.lstrip("/") in existing_keys:
                ok += 1
                continue
            svg = generate_campaign_svg(name, palette_for(name))
            upload_to_r2(rel, svg.encode("utf-8"), "image/svg+xml")
        else:
            dest = public_path(rel)
            if dest.exists():
                ok += 1
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(generate_campaign_svg(name, palette_for(name)), encoding="utf-8")
        print(f"  regenerated  {image_path}  ({name})")
        regenerated += 1

    summary = (
        f"\nCampaign images: {regenerated} regenerated, {ok} already present, "
        f"{skipped} skipped (no generated SVG path)."
    )
    if stale_origin:
        summary += f" {stale_origin} on a stale CDN origin (see warnings above)."
    print(summary)


if __name__ == "__main__":
    main()
