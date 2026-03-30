import mongoose from 'mongoose'
import { bootstrapDB } from './bootstrap'
import { serverCaptureException } from '../utils/posthog'

export async function connectDB(): Promise<void> {
  // Already connected or connecting — skip
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return

  const uri = process.env.MONGODB_URI
  if (!uri) return

  try {
    await mongoose.connect(uri)
    await bootstrapDB()
  } catch (e) {
    serverCaptureException(e, undefined, { action: 'connectDB' })
    throw e
  }
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1
}
