import mongoose from 'mongoose'
import { bootstrapDB, isBootstrapped } from './bootstrap'
import { serverCaptureException } from '../utils/posthog'

let connectPromise: Promise<typeof mongoose> | null = null

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) return

  try {
    if (mongoose.connection.readyState === 0) {
      // Disconnected — start a new connection and track the promise so
      // concurrent callers that arrive while readyState is 2 can await it.
      connectPromise = mongoose.connect(uri)
      await connectPromise
      connectPromise = null
    } else if (mongoose.connection.readyState === 2) {
      // Connection is in progress — wait for the existing attempt to finish
      // rather than proceeding to bootstrap before the connection is ready.
      if (connectPromise) {
        await connectPromise
      }
    }
    // readyState 1 (connected) — nothing to do

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
