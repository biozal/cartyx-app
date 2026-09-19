import { verifyBroadcastToken } from './auth.js';
import { GraphHistoryStore, MemoryHistoryStore, type HistoryStore } from './history.js';
import { createSessionHandler } from './parties/session.js';
import { tabletopHandler } from './parties/tabletop.js';
import { createTabletopMapHandler } from './parties/tabletopMap.js';
import { createRealtimeServer } from './server.js';
import { log } from './logger.js';

const PORT = Number(process.env.PORT ?? 1999);
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.trim() === '') {
  log.error('SESSION_SECRET is required');
  process.exit(1);
}

// The graph is configured (with the rest of the data settings) wherever the app's
// data stores are; without it, history lives only as long as this process.
let store: HistoryStore;
let closeData: (() => Promise<void>) | null = null;
if (process.env.GREMLIN_URL) {
  const runtime = await import('../../app/server/db/data-runtime');
  closeData = runtime.closeData;
  store = new GraphHistoryStore();
  log.info('chat history persisted to the graph');
} else {
  store = new MemoryHistoryStore();
  log.warn('GREMLIN_URL not set — chat history is in-memory only');
}

const server = createRealtimeServer({
  sessionSecret: SESSION_SECRET,
  handlers: {
    main: createSessionHandler(store),
    tabletop: tabletopHandler,
    tabletop_map: createTabletopMapHandler({
      verifyBroadcastToken: (h) => verifyBroadcastToken(h, SESSION_SECRET),
    }),
  },
});

server.listen(PORT, () => log.info({ port: PORT }, 'listening'));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    log.info({ signal }, 'shutting down');
    server.close(() => {
      void (closeData ? closeData() : Promise.resolve()).finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

process.on('uncaughtException', (err) => {
  log.error({ err }, 'uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'unhandledRejection');
});
