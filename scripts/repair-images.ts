/**
 * Regenerates missing seed images without re-seeding. Campaigns live in the graph, so
 * this lists them (name and image path, nothing else) and hands them to the Python
 * image tool, which owns the SVG generation and the R2 or local writes.
 *
 * Usage: npm run dev:repair-images
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to run in production');

const { campaigns } = await import('../app/server/repositories/campaigns');
const listing = (await campaigns.listAll()).map((c) => ({ name: c.name, imagePath: c.imagePath }));
const { closeData } = await import('../app/server/db/data-runtime');
await closeData();

const dir = mkdtempSync(join(tmpdir(), 'cartyx-repair-'));
try {
  const file = join(dir, 'campaigns.json');
  writeFileSync(file, JSON.stringify(listing));
  execFileSync(
    process.execPath,
    [resolve(root, 'scripts/run-python.cjs'), 'repair_seed_images.py'],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, CARTYX_REPAIR_CAMPAIGNS: file },
    }
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
