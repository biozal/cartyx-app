import mongoose from 'mongoose'
import { bootstrapDB, isBootstrapped } from './bootstrap'
import { serverCaptureException } from '../utils/posthog'

let connectPromise: Promise<typeof mongoose> | null = null

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) return

  try {
    if (connectPromise) {
      // A connection attempt is already in flight — wait for it regardless
      // of readyState, so concurrent callers always share one attempt.
      await connectPromise
    } else if (mongoose.connection.readyState === 0) {
      // Disconnected — start a new connection and track the promise so
      // concurrent callers can await it.
      //
      // autoIndex is disabled in production so that index creation is never
      // a side-effect of app startup. Operators should use `npm run db:sync`
      // to manage indexes explicitly. In non-production environments autoIndex
      // stays on for convenience, and bootstrap also calls createIndexes.
      const isProduction = process.env.NODE_ENV === 'production'
      connectPromise = mongoose.connect(uri, {
        autoIndex: !isProduction,
      })
      await connectPromise
      connectPromise = null
    }
    // readyState 1 (connected) with no in-flight promise — nothing to do

    // Always attempt bootstrap — it's idempotent and must succeed even if
    // a previous connect succeeded but bootstrap failed partway through.
    if (!isBootstrapped()) {
      await bootstrapDB()
    }
  } catch (e) {
    connectPromise = null
    serverCaptureException(e, undefined, { action: 'connectDB' })
    throw e
  }
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1
}

/** @internal Reset module state — test-only. */
export function __resetConnectPromiseForTests(): void {
  connectPromise = null
}
