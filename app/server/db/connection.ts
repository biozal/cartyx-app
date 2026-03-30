import mongoose from 'mongoose'
import { bootstrapDB, isBootstrapped } from './bootstrap'
import { serverCaptureException } from '../utils/posthog'

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) return

  try {
    // Only open a new connection if not already connected/connecting
    if (mongoose.connection.readyState !== 1 && mongoose.connection.readyState !== 2) {
      await mongoose.connect(uri)
    }

    // Always attempt bootstrap — it's idempotent and must succeed even if
    // a previous connect succeeded but bootstrap failed partway through.
    if (!isBootstrapped()) {
      await bootstrapDB()
    }
  } catch (e) {
    serverCaptureException(e, undefined, { action: 'connectDB' })
    throw e
  }
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1
}
