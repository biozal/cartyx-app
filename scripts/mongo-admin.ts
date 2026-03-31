#!/usr/bin/env npx tsx
/**
 * MongoDB administration CLI — verify or sync collections and indexes.
 *
 * Usage:
 *   npx tsx scripts/mongo-admin.ts verify   # read-only check, exits non-zero on drift
 *   npx tsx scripts/mongo-admin.ts sync     # creates missing collections + indexes
 *
 * Shortcut via npm scripts:
 *   npm run db:verify
 *   npm run db:sync
 *
 * Requires MONGODB_URI to be set (e.g. via .env or shell export).
 */
import mongoose from 'mongoose'
import { inspectIndexes, syncCollectionsAndIndexes } from '../app/server/db/inspect.js'

const COMMANDS = ['verify', 'sync'] as const
type Command = (typeof COMMANDS)[number]

function usage(): never {
  console.error('Usage: npx tsx scripts/mongo-admin.ts <verify|sync>')
  console.error('')
  console.error('Commands:')
  console.error('  verify  Check expected collections/indexes against the database (read-only).')
  console.error('          Exits 0 if everything matches, 1 if there is drift.')
  console.error('  sync    Create any missing collections and indexes.')
  process.exit(2)
}

function printDiffs(result: Awaited<ReturnType<typeof inspectIndexes>>): void {
  for (const diff of result.diffs) {
    const status = diff.missing.length === 0 ? '✓' : '✗'
    console.log(`\n${status} ${diff.model} (${diff.collection})`)

    if (diff.missing.length > 0) {
      console.log('  Missing indexes:')
      for (const idx of diff.missing) {
        console.log(`    - ${JSON.stringify(idx.key)}`)
      }
    }

    if (diff.extra.length > 0) {
      console.log('  Extra indexes (in DB but not in schema):')
      for (const idx of diff.extra) {
        console.log(`    - ${JSON.stringify(idx.key)}`)
      }
    }

    if (diff.missing.length === 0 && diff.extra.length === 0) {
      console.log('  All indexes match.')
    }
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined
  if (!command || !COMMANDS.includes(command)) {
    usage()
  }

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('Error: MONGODB_URI environment variable is not set.')
    process.exit(2)
  }

  // Connect without autoIndex — we manage indexes explicitly.
  await mongoose.connect(uri, { autoIndex: false })

  try {
    if (command === 'verify') {
      console.log('Verifying MongoDB collections and indexes...')
      const result = await inspectIndexes()
      printDiffs(result)

      if (result.ok) {
        console.log('\nAll expected indexes are present.')
        process.exit(0)
      } else {
        console.error('\nIndex drift detected — run `npm run db:sync` to fix.')
        process.exit(1)
      }
    }

    if (command === 'sync') {
      console.log('Syncing MongoDB collections and indexes...')
      await syncCollectionsAndIndexes()
      console.log('Sync complete. Verifying...')

      const result = await inspectIndexes()
      printDiffs(result)

      if (result.ok) {
        console.log('\nAll collections and indexes are up to date.')
        process.exit(0)
      } else {
        console.error('\nSync completed but some indexes are still missing — investigate manually.')
        process.exit(1)
      }
    }
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(2)
})
