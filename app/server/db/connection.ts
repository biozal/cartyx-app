import { entityStore } from '../repositories/entity-store';
import { serverCaptureException } from '../utils/telemetry';

let connected = false;

/**
 * Makes the data runtime ready for a request: composes the graph entity store, whose
 * first use validates the graph and CQL settings. Server functions call this before
 * touching data; a failure carries status 503 so it reads as an outage, not a bug.
 */
export async function connectDB(): Promise<void> {
  try {
    await entityStore();
    connected = true;
  } catch (e) {
    serverCaptureException(e, undefined, { action: 'connectDB' });
    // Still useful server-side (logging, any in-process caller), but this does NOT
    // survive server-fn serialization — the client-side circuit breaker classifier
    // matches on the error message instead.
    if (e instanceof Error && !Object.prototype.hasOwnProperty.call(e, 'status')) {
      Object.assign(e, { status: 503 });
    }
    throw e;
  }
}

/** Whether the data runtime has been composed in this process. */
export function isDBConnected(): boolean {
  return connected;
}

/** @internal Reset module state — test-only. */
export function __resetConnectPromiseForTests(): void {
  connected = false;
}
