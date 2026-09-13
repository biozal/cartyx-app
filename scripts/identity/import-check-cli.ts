import { checkIdentityImportArchive } from './import-source';
try {
  const [directory, ...extra] = process.argv.slice(2);
  if (!directory || extra.length) throw new Error('Expected one private archive directory');
  const report = await checkIdentityImportArchive(directory);
  console.log(JSON.stringify(report)); // Fixed categories/counts only, no IDs or source values.
  if (report.mapped !== report.users || report.sourceFindingCategories) process.exitCode = 1;
} catch {
  console.error(
    'Identity import check failed. Verify archive integrity and private permissions. No database was changed.'
  );
  process.exitCode = 1;
}
