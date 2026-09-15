import { exportIdentity, verifyArchive } from './archive';

try {
  const [command, argument, ...extra] = process.argv.slice(2);
  if (extra.length) throw new Error('Unexpected arguments');
  if (command === 'verify' && argument) {
    const report = await verifyArchive(argument);
    console.log(
      `Verified identity preflight: ${report.counts.users} users, ${report.counts.campaigns} campaigns, ${Object.keys(report.findings).length} finding categories.`
    );
  } else if (command === 'export' && ['local', 'dev', 'prod'].includes(argument)) {
    if (!process.env.MONGODB_URI) throw new Error('Missing source URI');
    const result = await exportIdentity({
      uri: process.env.MONGODB_URI,
      database: process.env.MONGODB_DB || undefined,
      source: argument as 'local' | 'dev' | 'prod',
      root: process.cwd(),
    });
    console.log(
      `Verified identity preflight: ${result.report.counts.users} users, ${result.report.counts.campaigns} campaigns, ${Object.keys(result.report.findings).length} finding categories. Private archive: ${result.directory}`
    );
  } else {
    console.error(
      'Usage: npm run identity:archive -- export local|dev|prod OR verify <private-directory>'
    );
    process.exitCode = 1;
  }
} catch {
  // Driver, BSON and filesystem errors may contain credentials or source values.
  console.error(
    'Identity preflight failed. Check the source configuration, snapshot support, archive integrity and private file permissions. Incomplete directories must be discarded; retry creates a new snapshot. No source data was changed.'
  );
  process.exitCode = 1;
}
