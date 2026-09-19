import mongoose from 'mongoose';
import { getBootstrapPolicy } from './policy';
import { serverCaptureException } from '../utils/telemetry';

let connectPromise: Promise<typeof mongoose> | null = null;

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return;

  const policy = getBootstrapPolicy();

  try {
    if (connectPromise) {
      // A connection attempt is already in flight — wait for it regardless
      // of readyState, so concurrent callers always share one attempt.
      await connectPromise;
    } else if (mongoose.connection.readyState === 0) {
      // Disconnected — start a new connection and track the promise so
      // concurrent callers can await it.
      //
      // autoIndex is driven by the bootstrap policy: disabled in production
      // and staging so index creation is never a side-effect of app startup.
      // In development autoIndex stays on for convenience.
      connectPromise = mongoose.connect(uri, {
        autoIndex: policy.autoIndex,
      });
      await connectPromise;
      connectPromise = null;
    }
    // readyState 1 (connected) with no in-flight promise — nothing to do
  } catch (e) {
    connectPromise = null;
    serverCaptureException(e, undefined, { action: 'connectDB' });
    // Still useful server-side (logging, any in-process caller), but this
    // does NOT survive server-fn serialization — the client-side circuit
    // breaker classifier matches on the error message instead.
    if (e instanceof Error && !Object.prototype.hasOwnProperty.call(e, 'status')) {
      Object.assign(e, { status: 503 });
    }
    throw e;
  }
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/** @internal Reset module state — test-only. */
export function __resetConnectPromiseForTests(): void {
  connectPromise = null;
}
