import mongoose from 'mongoose'

export async function connectDB(): Promise<void> {
  // Already connected or connecting — skip
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) return

  const uri = process.env.MONGODB_URI
  if (!uri) return

  await mongoose.connect(uri)
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1
}
