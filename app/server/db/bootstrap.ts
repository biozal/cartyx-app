import type { BootstrapEnvironment, BootstrapPolicy } from './policy'
import { getBootstrapPolicy } from './policy'
import { ensureCollections, syncCollectionsAndIndexes, inspectIndexes } from './inspect'
import { serverCaptureEvent } from '../utils/posthog'

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
    public readonly environment: BootstrapEnvironment,
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
      await runBootstrap(resolved)
      bootstrapped = true
    } finally {
      bootstrapPromise = null
    }
  })()

  return bootstrapPromise
}

async function runBootstrap(policy: BootstrapPolicy): Promise<void> {
  const env = policy.environment
  const start = performance.now()

  console.log(`[bootstrap] start env=${env} sync=${policy.syncIndexes} verify=${policy.verifyCriticalIndexes}`)
  serverCaptureEvent('server', 'db.bootstrap.start', {
    bootstrap_env: env,
    sync_indexes: policy.syncIndexes,
    verify_critical: policy.verifyCriticalIndexes,
    timeout_ms: policy.timeoutMs,
  })

  try {
    await withTimeout(
      (async () => {
        if (policy.syncIndexes) {
          // Development: full sync for convenience — creates collections + indexes.
          await syncCollectionsAndIndexes()
          const durationMs = Math.round(performance.now() - start)
          console.log(`[bootstrap] success env=${env} action=sync duration_ms=${durationMs}`)
          serverCaptureEvent('server', 'db.bootstrap.success', {
            bootstrap_env: env,
            action: 'sync',
            duration_ms: durationMs,
          })
          return
        }

        // Production / staging: lightweight path — collections only, then verify.
        await ensureCollections()

        if (!policy.verifyCriticalIndexes) {
          const durationMs = Math.round(performance.now() - start)
          console.log(`[bootstrap] success env=${env} action=ensure_collections duration_ms=${durationMs}`)
          serverCaptureEvent('server', 'db.bootstrap.success', {
            bootstrap_env: env,
            action: 'ensure_collections',
            duration_ms: durationMs,
          })
          return
        }

        const result = await inspectIndexes()
        const durationMs = Math.round(performance.now() - start)
        const totalMissing = result.diffs.reduce((sum, d) => sum + d.missing.length, 0)
        const totalMismatches = result.diffs.reduce((sum, d) => sum + d.optionMismatches.length, 0)
        const modelsChecked = result.diffs.length

        if (result.ok) {
          console.log(
            `[bootstrap] success env=${env} action=verify duration_ms=${durationMs} models_checked=${modelsChecked}`,
          )
          serverCaptureEvent('server', 'db.bootstrap.success', {
            bootstrap_env: env,
            action: 'verify',
            duration_ms: durationMs,
            models_checked: modelsChecked,
            indexes_ok: true,
          })
          return
        }

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
            `Runtime bootstrap [${env}]: ${details.length} critical index problem(s) detected.\n` +
            `Run "npm run db:sync" to fix before deploying.\n` +
            details.map((d) => `  • ${d}`).join('\n')

          if (policy.failOnCriticalDrift) {
            console.error(
              `[bootstrap] failure env=${env} action=verify duration_ms=${durationMs}` +
                ` missing=${totalMissing} mismatches=${totalMismatches} critical_drift=true`,
            )
            serverCaptureEvent('server', 'db.bootstrap.failure', {
              bootstrap_env: env,
              action: 'verify',
              duration_ms: durationMs,
              missing_indexes: totalMissing,
              option_mismatches: totalMismatches,
              critical_drift: true,
              details,
            })
            throw new BootstrapError(message, env, details)
          }

          // Staging: warn but don't abort so preview deploys stay functional.
          console.warn(`[bootstrap] WARNING — ${message}`)
          serverCaptureEvent('server', 'db.bootstrap.warning', {
            bootstrap_env: env,
            action: 'verify',
            duration_ms: durationMs,
            missing_indexes: totalMissing,
            option_mismatches: totalMismatches,
            critical_drift: true,
            details,
          })
        } else {
          // Optional drift only — log success with advisory note.
          console.log(
            `[bootstrap] success env=${env} action=verify duration_ms=${durationMs}` +
              ` models_checked=${modelsChecked} optional_drift=true missing=${totalMissing} mismatches=${totalMismatches}`,
          )
          serverCaptureEvent('server', 'db.bootstrap.success', {
            bootstrap_env: env,
            action: 'verify',
            duration_ms: durationMs,
            models_checked: modelsChecked,
            indexes_ok: false,
            optional_drift: true,
            missing_indexes: totalMissing,
            option_mismatches: totalMismatches,
          })
        }
      })(),
      policy.timeoutMs,
      'bootstrap',
    )
  } catch (error) {
    // BootstrapError is already logged above — only log unexpected errors
    // (including timeouts, which now flow through this catch block).
    if (!(error instanceof BootstrapError)) {
      const durationMs = Math.round(performance.now() - start)
      console.error(
        `[bootstrap] failure env=${env} duration_ms=${durationMs}` +
          ` error=${error instanceof Error ? error.message : String(error)}`,
      )
      serverCaptureEvent('server', 'db.bootstrap.failure', {
        bootstrap_env: env,
        duration_ms: durationMs,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    throw error
  }
}

/** Wrap a promise with a timeout that produces an actionable error. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  if (ms <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms — possible causes: MongoDB connectivity issues, slow collection/index operations, or high cluster load`)),
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
