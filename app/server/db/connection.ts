import mongoose from 'mongoose'

export async function connectDB(): Promise<void> {
  // Already connected or connecting — skip
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return

  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.warn('⚠️  MONGODB_URI not set — running without database')
    return
  }

  try {
    await mongoose.connect(uri)
    console.warn('✅ MongoDB connected')
  } catch (err) {
    console.error('❌ MongoDB connection error:', err)
  }
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1
}
