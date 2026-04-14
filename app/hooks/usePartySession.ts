import usePartySocket from 'partysocket/react';
import { useCallback, useRef } from 'react';

const PARTYKIT_HOST = import.meta.env.VITE_PUBLIC_PARTYKIT_HOST ?? 'localhost:1999';

export function usePartySession(
  sessionId: string | null,
  getToken: () => Promise<string>,
  onMessage: (msg: unknown) => void
) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const stableOnMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      onMessageRef.current(data);
    } catch (err) {
      console.error('[PartyKit] Failed to parse message', err);
    }
  }, []);

  const socket = usePartySocket({
    host: PARTYKIT_HOST,
    room: sessionId ?? '__disabled__',
    party: 'main',
    query: sessionId ? async () => ({ token: await getToken() }) : () => ({ token: '' }),
    onOpen() {
      console.info(`[PartyKit] Connected to room sessionId=${sessionId}`);
    },
    onClose(event) {
      // Suppress warnings for disabled socket (no session) and normal closures
      if (sessionId && event.code !== 1000) {
        console.warn(
          `[PartyKit] Disconnected sessionId=${sessionId} code=${event.code} reason=${event.reason}`
        );
      }
    },
    onMessage: stableOnMessage,
    startClosed: !sessionId,
    maxRetries: sessionId ? undefined : 0,
  });

  return socket;
}
