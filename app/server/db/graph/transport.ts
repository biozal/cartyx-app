import { randomUUID } from 'node:crypto';
import gremlin from 'gremlin';
import { Agent } from 'node:https';
import { connect, type ConnectionOptions } from 'node:tls';
import type { GraphConnectionConfig } from './config';

export class GraphRequestError extends Error {
  constructor(public readonly code: 'aborted' | 'timeout' | 'failed' | 'conflict') {
    // Do not attach driver errors: they may contain traversal data or server script output.
    super(
      `Graph request ${code}; a submitted write may have committed. Reconcile before retrying.`
    );
    this.name = 'GraphRequestError';
  }
}

/**
 * JanusGraph reports a lost lock on a consistency-locked key as a commit failure rather
 * than an empty result, so a compare-and-set that loses a race is indistinguishable from
 * a real fault unless it is classified here. Matching uses fixed phrases only; no server
 * text, traversal data or cause is ever carried into the thrown error. A genuine
 * persistence failure classified this way is retried and then surfaces as a conflict,
 * which callers must treat as "re-read and decide", never as a completed write.
 */
const CONFLICT_MESSAGES = [
  // JanusGraph wraps a lost lock on a consistency-locked key in this commit failure.
  'Could not commit transaction due to exception during persistence',
  'PermanentLockingException',
  'TemporaryLockingException',
  'Could not acquire lock',
];

function isConflict(error: unknown): boolean {
  const candidate = error as { statusMessage?: unknown; message?: unknown };
  const text = `${typeof candidate?.statusMessage === 'string' ? candidate.statusMessage : ''} ${
    typeof candidate?.message === 'string' ? candidate.message : ''
  }`;
  return CONFLICT_MESSAGES.some((name) => text.includes(name));
}

/** Internal transport. Application callers use client.ts; scripts are reserved for operators. */
export async function submitGraphRequest(
  config: GraphConnectionConfig,
  request: gremlin.process.Bytecode | string,
  bindings: Record<string, unknown> = {},
  signal?: AbortSignal
): Promise<unknown[]> {
  if (signal?.aborted) throw new GraphRequestError('aborted');
  // A connection per operation isolates cancellation from unrelated requests and makes
  // the next operation reconnect without ever replaying an uncertain mutation.
  const deadline = Date.now() + config.timeoutMs;
  class DeadlineAgent extends Agent {
    createConnection(options: ConnectionOptions) {
      const socket = connect(options);
      const remaining = Math.max(1, deadline - Date.now());
      const expiry = setTimeout(() => socket.destroy(), remaining);
      socket.once('close', () => clearTimeout(expiry));
      return socket;
    }
  }
  const agent = new DeadlineAgent();
  const client = new gremlin.driver.Client(config.url, {
    authenticator: new gremlin.driver.auth.PlainTextSaslAuthenticator(
      config.username,
      config.password
    ),
    agent,
    ca: config.ca,
    rejectUnauthorized: true,
    mimeType: 'application/vnd.gremlin-v3.0+json',
    traversalSource: 'g',
    pingEnabled: false,
  });
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      stopped = true;
      reject(new GraphRequestError('timeout'));
    }, config.timeoutMs);
    abort = () => {
      stopped = true;
      reject(new GraphRequestError('aborted'));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
  try {
    const result: gremlin.driver.ResultSet = await Promise.race([
      client.open().then(() => {
        if (stopped) {
          agent.destroy();
          throw new GraphRequestError('aborted');
        }
        return client.submit(request, bindings, {
          requestId: randomUUID(),
          batchSize: 64,
          userAgent: 'cartyx-graph-foundation',
          evaluationTimeout: Math.max(50, config.timeoutMs - 50),
        });
      }),
      interrupted,
    ]);
    const values: unknown[] = [];
    for (const item of result.toArray() as unknown[]) {
      if (
        request instanceof gremlin.process.Bytecode &&
        item instanceof gremlin.process.Traverser
      ) {
        const traverser = item as unknown as { bulk: number; object: unknown };
        if (
          !Number.isSafeInteger(traverser.bulk) ||
          traverser.bulk < 0 ||
          values.length + traverser.bulk > 1000
        )
          throw new GraphRequestError('failed');
        for (let i = 0; i < traverser.bulk; i++) values.push(traverser.object);
      } else {
        if (values.length >= 1000) throw new GraphRequestError('failed');
        values.push(item);
      }
    }
    return values;
  } catch (error) {
    if (error instanceof GraphRequestError) throw error;
    // A lost lock is a conflict the caller may retry; everything else stays opaque.
    throw new GraphRequestError(isConflict(error) ? 'conflict' : 'failed');
  } finally {
    stopped = true;
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
    // Do not let a broken socket extend the caller's deadline. Closing does not
    // guarantee cancellation/rollback on the server.
    void client.close().catch(() => undefined);
    agent.destroy();
  }
}
