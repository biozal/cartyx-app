import mongoose from 'mongoose'

let isConnected = false

export async function connectDB(): Promise<void> {
  if (isConnected) return

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.warn('⚠️  MONGODB_URI not set — running without database')
    return
  }

  try {
    await mongoose.connect(uri)
    isConnected = true
    console.warn('✅ MongoDB connected')
  } catch (err) {
    console.error('❌ MongoDB connection error:', err)
  }
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1
}
