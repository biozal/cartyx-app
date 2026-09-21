#!/usr/bin/env node
/**
 * Generate local PNG banner images for seeded lore entries.
 *
 * Each lore slug gets a deterministic banner: a gradient-style background
 * derived from the slug hash, the entry's human title, and a book glyph (📖).
 * Images are written to `public/uploads/seed-lore/<slug>.png`.
 *
 * Idempotent: files are always regenerated (overwritten) on each run, exactly
 * like gen_seed_avatars.mjs. The public path the app references is:
 *   /uploads/seed-lore/<slug>.png
 *
 * When the app's CDN is configured (CDN_URL + R2_* env vars) the PNGs are also
 * uploaded to R2 — exactly like gen_seed_org_images.mjs — so the deployed dev
 * app (which can't serve local public/uploads/ writes) resolves them via the
 * CDN. The Python seed sets each image URL via `public_url(...)`, so the stored
 * URL and the uploaded R2 key agree. Idempotent: local files are overwritten
 * and R2 objects already present are skipped.
 *
 * Usage:
 *   node scripts/gen_seed_lore_images.mjs
 *   npm run dev:seed   (called automatically as part of the chain)
 *
 * Safety: r2Env() refuses a production-looking R2 bucket.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Minimal .env loader (mirrors gen_seed_avatars.mjs) ----------------------
function loadEnv() {
  const envPath = join(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// --- CDN / R2 (mirrors gen_seed_avatars.mjs) ---------------------------------
function r2Env() {
  const keys = [
    'CDN_URL',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ];
  const env = Object.fromEntries(keys.map((k) => [k, process.env[k] ?? '']));
  if (!keys.every((k) => env[k])) return null;
  if (/prod/i.test(env.R2_BUCKET)) {
    console.error('R2_BUCKET looks like a production bucket. Aborting.');
    process.exit(1);
  }
  return env;
}

function r2ClientFor(env) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
}

async function listExistingKeys(s3, bucket, prefix) {
  const keys = new Set();
  let token;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of page.Contents ?? []) keys.add(obj.Key);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

const LORE_SLUGS = [
  { slug: 'elf-origins', title: 'Origins of the Elves' },
  { slug: 'phandalin-history', title: 'A Short History of Phandalin' },
  { slug: 'dragon-legend', title: 'Legend of the Sleeping Dragon' },
  { slug: 'black-spider', title: "The Black Spider's Web" },
];

// ---------------------------------------------------------------------------
// Deterministic banner SVG
// ---------------------------------------------------------------------------

/**
 * Derive a stable hue (0–359) and a secondary hue offset from the slug hash.
 */
function hashToHues(slug) {
  const bytes = createHash('sha1').update(slug).digest();
  const hue1 = bytes[0] % 360;
  const hue2 = (hue1 + 40 + (bytes[1] % 60)) % 360;
  return { hue1, hue2 };
}

/**
 * Escape XML entities so title text is safe inside SVG.
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Wrap long title text into at most two lines, splitting on the last space
 * before the midpoint so neither line is too long for the banner width.
 */
function wrapTitle(title) {
  if (title.length <= 22) return [title];
  // Try to find a space near the middle to split on.
  const mid = Math.floor(title.length / 2);
  const before = title.lastIndexOf(' ', mid);
  const after = title.indexOf(' ', mid);
  let splitAt;
  if (before === -1 && after === -1) return [title];
  if (before === -1) splitAt = after;
  else if (after === -1) splitAt = before;
  else splitAt = mid - before <= after - mid ? before : after;
  return [title.slice(0, splitAt).trim(), title.slice(splitAt + 1).trim()];
}

/**
 * Build a deterministic 320×160 banner SVG for a lore entry.
 *
 * Layout:
 *   - Two-stop linear gradient background (hue1 → hue2, dark tones)
 *   - Book glyph (unicode ᛒ rune-like circle initial) on the left
 *   - Title text (one or two lines) centred in the right portion
 *   - Subtle decorative rule line below the title
 */
function loreBannerSvg(slug, title) {
  const { hue1, hue2 } = hashToHues(slug);
  const W = 320;
  const H = 160;

  // Background gradient colours (dark, themed)
  const bg1 = `hsl(${hue1} 38% 14%)`;
  const bg2 = `hsl(${hue2} 28% 20%)`;
  // Accent colour for glyph + rule
  const accent = `hsl(${hue1} 62% 60%)`;
  // Dim accent for secondary elements
  const accentDim = `hsl(${hue1} 40% 40%)`;

  const gradId = `g${slug.replace(/[^a-z0-9]/g, '')}`;

  // Glyph circle — left side
  const glyphCx = 60;
  const glyphCy = H / 2;
  const glyphR = 34;

  // Pick a letter from the title for the glyph initial
  const initial = escapeXml(title.charAt(0).toUpperCase());

  // Title text lines
  const lines = wrapTitle(title);
  const titleX = 116;
  const titleAreaWidth = W - titleX - 16;

  let titleSvg = '';
  if (lines.length === 1) {
    titleSvg = `<text x="${titleX}" y="${H / 2 + 6}" font-family="Georgia, 'Times New Roman', serif" font-size="22" font-weight="bold" fill="white" dominant-baseline="middle">${escapeXml(lines[0])}</text>`;
  } else {
    const y1 = H / 2 - 12;
    const y2 = H / 2 + 14;
    titleSvg =
      `<text x="${titleX}" y="${y1}" font-family="Georgia, 'Times New Roman', serif" font-size="20" font-weight="bold" fill="white">${escapeXml(lines[0])}</text>` +
      `<text x="${titleX}" y="${y2}" font-family="Georgia, 'Times New Roman', serif" font-size="20" font-weight="bold" fill="white">${escapeXml(lines[1])}</text>`;
  }

  // Decorative rule under title text
  const ruleY = lines.length === 1 ? H / 2 + 22 : H / 2 + 28;
  const ruleX2 = titleX + titleAreaWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#${gradId})"/>
  <!-- Subtle corner ornament lines -->
  <line x1="8" y1="8" x2="28" y2="8" stroke="${accentDim}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="8" y1="8" x2="8" y2="28" stroke="${accentDim}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${W - 8}" y1="8" x2="${W - 28}" y2="8" stroke="${accentDim}" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="${W - 8}" y1="8" x2="${W - 8}" y2="28" stroke="${accentDim}" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Glyph circle -->
  <circle cx="${glyphCx}" cy="${glyphCy}" r="${glyphR}" fill="none" stroke="${accent}" stroke-width="2"/>
  <circle cx="${glyphCx}" cy="${glyphCy}" r="${glyphR - 6}" fill="${accent}" fill-opacity="0.15"/>
  <!-- Book pages icon: two overlapping rectangles to suggest an open book -->
  <rect x="${glyphCx - 14}" y="${glyphCy - 14}" width="12" height="18" rx="2" fill="none" stroke="${accent}" stroke-width="1.8"/>
  <rect x="${glyphCx + 2}" y="${glyphCy - 14}" width="12" height="18" rx="2" fill="none" stroke="${accent}" stroke-width="1.8"/>
  <line x1="${glyphCx}" y1="${glyphCy - 14}" x2="${glyphCx}" y2="${glyphCy + 4}" stroke="${accent}" stroke-width="1.2"/>
  <!-- Initial letter inside glyph -->
  <text x="${glyphCx}" y="${glyphCy + 22}" font-family="Georgia, 'Times New Roman', serif" font-size="11" fill="${accent}" fill-opacity="0.7" text-anchor="middle">${initial}</text>
  <!-- Vertical separator -->
  <line x1="108" y1="28" x2="108" y2="${H - 28}" stroke="${accentDim}" stroke-width="1" stroke-dasharray="3,3"/>
  <!-- Title -->
  ${titleSvg}
  <!-- Decorative rule -->
  <line x1="${titleX}" y1="${ruleY}" x2="${ruleX2}" y2="${ruleY}" stroke="${accent}" stroke-width="1" stroke-opacity="0.5"/>
</svg>`;
}

function renderPng(svg) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: 320 } }).render().asPng();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnv();
  if (
    process.env.NODE_ENV === 'production' ||
    /prod/i.test(`${process.env.GREMLIN_URL ?? ''} ${process.env.CQL_STATE_KEYSPACE ?? ''}`)
  ) {
    console.error('Refusing to run against a production-looking environment.');
    process.exit(1);
  }

  const outDir = join(REPO_ROOT, 'public', 'uploads', 'seed-lore');
  mkdirSync(outDir, { recursive: true });

  // When the CDN is configured, mirror every image into R2 (the deployed dev
  // app can't serve local public/uploads/ writes).
  let cdn = null;
  const env = r2Env();
  if (env) {
    const s3 = r2ClientFor(env);
    cdn = {
      s3,
      bucket: env.R2_BUCKET,
      existingKeys: await listExistingKeys(s3, env.R2_BUCKET, 'uploads/seed-lore/'),
    };
    console.log(`CDN configured — uploading lore images to R2 bucket '${env.R2_BUCKET}'`);
  }

  let uploaded = 0;
  const uploads = [];
  for (const { slug, title } of LORE_SLUGS) {
    const png = renderPng(loreBannerSvg(slug, title));
    writeFileSync(join(outDir, `${slug}.png`), png);
    console.log(`  wrote /uploads/seed-lore/${slug}.png  («${title}»)`);
    if (cdn) {
      const objKey = `uploads/seed-lore/${slug}.png`;
      if (!cdn.existingKeys.has(objKey)) {
        uploads.push(
          cdn.s3
            .send(
              new PutObjectCommand({
                Bucket: cdn.bucket,
                Key: objKey,
                Body: png,
                ContentType: 'image/png',
              })
            )
            .then(() => {
              uploaded += 1;
            })
        );
      }
    }
  }
  await Promise.all(uploads);

  console.log(
    `\ngen_seed_lore_images: ${LORE_SLUGS.length} PNGs generated in public/uploads/seed-lore/` +
      (cdn ? `, ${uploaded} uploaded to R2` : '')
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
