/**
 * MongoDB administration CLI — verify or sync collections and indexes.
 *
 * Usage:
 *   npx tsx scripts/mongo-admin.ts verify          # exits non-zero on critical drift
 *   npx tsx scripts/mongo-admin.ts verify --strict  # exits non-zero on any drift
 *   npx tsx scripts/mongo-admin.ts verify --json    # machine-readable JSON output
 *   npx tsx scripts/mongo-admin.ts sync             # creates missing collections + indexes
 *
 * Shortcut via npm scripts:
 *   npm run db:verify
 *   npm run db:sync
 *
 * Requires MONGODB_URI to be set (e.g. via .env or shell export).
 */
import mongoose from 'mongoose'
import { inspectIndexes, syncCollectionsAndIndexes } from '../app/server/db/inspect.js'
import type { InspectResult } from '../app/server/db/inspect.js'

const COMMANDS = ['verify', 'sync'] as const
type Command = (typeof COMMANDS)[number]

function usage(): void {
  console.error('Usage: npx tsx scripts/mongo-admin.ts <verify|sync> [options]')
  console.error('')
  console.error('Commands:')
  console.error('  verify  Check expected collections/indexes against the database (read-only).')
  console.error('          Exits 0 if no critical drift, 1 if critical drift detected.')
  console.error('          Options:')
  console.error('            --strict  Exit 1 on any drift (including optional indexes).')
  console.error('            --json    Output machine-readable JSON instead of text.')
  console.error('  sync    Create any missing collections and indexes.')
  process.exitCode = 2
}

function severityLabel(severity: string | undefined): string {
  if (severity === 'critical') return '[CRITICAL]'
  if (severity === 'optional') return '[optional]'
  return '[unclassified]'
}

function printDiffs(result: InspectResult): void {
  for (const diff of result.diffs) {
    const hasDrift =
      diff.missing.length > 0 || diff.extra.length > 0 || diff.optionMismatches.length > 0
    const status = hasDrift ? '✗' : '✓'
    console.log(`\n${status} ${diff.model} (${diff.collection})`)

    if (diff.missing.length > 0) {
      console.log('  Missing indexes:')
      for (const idx of diff.missing) {
        console.log(`    ${severityLabel(idx.severity)} ${JSON.stringify(idx.key)}`)
      }
    }

    if (diff.extra.length > 0) {
      console.log('  Extra indexes (in DB but not in schema):')
      for (const idx of diff.extra) {
        console.log(`    - ${JSON.stringify(idx.key)}`)
      }
    }

    if (diff.optionMismatches.length > 0) {
      console.log('  Option mismatches:')
      for (const m of diff.optionMismatches) {
        console.log(`    ${severityLabel(m.severity)} ${JSON.stringify(m.key)}`)
        console.log(`      expected: ${JSON.stringify(m.expected)}`)
        console.log(`      actual:   ${JSON.stringify(m.actual)}`)
      }
    }

    if (!hasDrift) {
      console.log('  All indexes match.')
    }
  }
}

function printJson(result: InspectResult): void {
  console.log(JSON.stringify(result, null, 2))
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0] as Command | undefined
  if (!command || !COMMANDS.includes(command)) {
    usage()
    return
  }

  const flags = new Set(args.slice(1))
  const strict = flags.has('--strict')
  const json = flags.has('--json')

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Error: MONGODB_URI environment variable is not set.')
    process.exitCode = 2
    return
  }

  // Connect without autoIndex — we manage indexes explicitly.
  await mongoose.connect(uri, { autoIndex: false })

  try {
    if (command === 'verify') {
      if (!json) console.log('Verifying MongoDB collections and indexes...')
      const result = await inspectIndexes()

      if (json) {
        printJson(result)
      } else {
        printDiffs(result)
      }

      if (result.ok) {
        if (!json) console.log('\nAll expected indexes are present.')
      } else if (result.hasCriticalDrift) {
        if (!json) console.error('\nCritical index drift detected — run `npm run db:sync` to fix.')
        process.exitCode = 1
      } else if (strict) {
        if (!json) console.error('\nOptional index drift detected (strict mode) — run `npm run db:sync` to fix.')
        process.exitCode = 1
      } else {
        if (!json) console.warn('\nOptional index drift detected (warning only). Run `npm run db:sync` to fix.')
      }
      return
    }

    if (command === 'sync') {
      console.log('Syncing MongoDB collections and indexes...')
      await syncCollectionsAndIndexes()
      console.log('Sync complete. Verifying...')

      const result = await inspectIndexes()
      printDiffs(result)

      if (result.ok) {
        console.log('\nAll collections and indexes are up to date.')
      } else {
        console.error('\nSync completed but drift remains — investigate manually.')
        process.exitCode = 1
      }
      return
    }
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exitCode = 2
})
