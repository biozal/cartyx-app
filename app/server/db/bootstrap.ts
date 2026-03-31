import type { BootstrapPolicy } from './policy'
import { getBootstrapPolicy } from './policy'
import { ensureCollections, syncCollectionsAndIndexes, inspectIndexes } from './inspect'

let bootstrapped = false
let bootstrapPromise: Promise<void> | null = null

/**
 * Error thrown when runtime bootstrap detects missing critical prerequisites.
 * Includes actionable details so operators can resolve the issue.
 */
export class BootstrapError extends Error {
  override readonly name = 'BootstrapError'
  constructor(
    message: string,
    public readonly environment: string,
    public readonly details: string[],
  ) {
    super(message)
  }
}

/**
 * Runtime bootstrap — runs once per process on first database access.
 *
 * Behaviour is controlled by a {@link BootstrapPolicy} that varies by
 * environment:
 *
 * | Environment | Collections | Indexes | Critical check | Failure mode |
 * |-------------|-------------|---------|----------------|--------------|
 * | production  | ensure      | —       | yes            | abort        |
 * | staging     | ensure      | —       | yes            | warn         |
 * | development | ensure      | sync    | —              | —            |
 *
 * The policy is resolved automatically from `BOOTSTRAP_ENV`, `VERCEL_ENV`,
 * or `NODE_ENV` unless provided explicitly.
 *
 * All work is bounded by `policy.timeoutMs` so startup cannot hang
 * indefinitely without an actionable error.
 *
 * Safe to call multiple times — runs only once per process. If it throws,
 * the flag stays `false` so the next `connectDB()` call will retry.
 */
export async function bootstrapDB(policy?: BootstrapPolicy): Promise<void> {
  if (bootstrapped) return

  // If a bootstrap is already in flight, share the same attempt so
  // concurrent callers don't duplicate work.
  if (bootstrapPromise) return bootstrapPromise

  const resolved = policy ?? getBootstrapPolicy()

  bootstrapPromise = (async () => {
    try {
      await withTimeout(runBootstrap(resolved), resolved.timeoutMs, 'bootstrap')
      bootstrapped = true
    } finally {
      bootstrapPromise = null
    }
  })()

  return bootstrapPromise
}

async function runBootstrap(policy: BootstrapPolicy): Promise<void> {
  if (policy.syncIndexes) {
    // Development: full sync for convenience — creates collections + indexes.
    await syncCollectionsAndIndexes()
    return
  }

  // Production / staging: lightweight path — collections only, then verify.
  await ensureCollections()

  if (!policy.verifyCriticalIndexes) return

  const result = await inspectIndexes()
  if (result.ok) return

  // Build actionable details for every critical drift item.
  const details: string[] = []
  for (const diff of result.diffs) {
    for (const m of diff.missing) {
      if (m.severity === 'critical') {
        details.push(`${diff.model} (${diff.collection}): missing index ${JSON.stringify(m.key)}`)
      }
    }
    for (const m of diff.optionMismatches) {
      if (m.severity === 'critical') {
        details.push(
          `${diff.model} (${diff.collection}): option mismatch on ${JSON.stringify(m.key)}` +
            ` — expected ${JSON.stringify(m.expected)}, actual ${JSON.stringify(m.actual)}`,
        )
      }
    }
  }

  if (result.hasCriticalDrift) {
    const message =
      `Runtime bootstrap [${policy.environment}]: ${details.length} critical index problem(s) detected.\n` +
      `Run "npm run db:sync" to fix before deploying.\n` +
      details.map((d) => `  • ${d}`).join('\n')

    if (policy.failOnCriticalDrift) {
      throw new BootstrapError(message, policy.environment, details)
    }

    // Staging: warn but don't abort so preview deploys stay functional.
    console.warn(`[bootstrap] WARNING — ${message}`)
  }
}

/** Wrap a promise with a timeout that produces an actionable error. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms — check MongoDB connectivity`)),
      ms,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Returns whether bootstrap has completed successfully. */
export function isBootstrapped(): boolean {
  return bootstrapped
}

/** @internal Reset module state — test-only. Not part of the public API. */
export function __resetBootstrapForTests(): void {
  bootstrapped = false
  bootstrapPromise = null
}
