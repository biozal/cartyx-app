import type * as Party from 'partykit/server';
import { jwtVerify } from 'jose';

const HISTORY_LIMIT = 50;

type ChatMessage = {
  type: 'CHAT';
  id: string;
  seq?: number;
  sessionId: string;
  campaignId: string;
  channel: 'general' | 'gm';
  authorId: string;
  authorName: string;
  text: string;
  timestamp: number;
};

type DiceMessage = {
  type: 'DICE';
  id: string;
  seq?: number;
  sessionId: string;
  campaignId: string;
  channel: 'general' | 'gm';
  character: string;
  title: string;
  rollType: string;
  attackRolls: Array<{
    roll: number;
    type: string;
    total: number;
    formula: string;
    discarded: boolean;
    dice: number[];
  }>;
  damageRolls: Array<{
    damageType: string;
    dice: number[];
    total: number;
    flags: number;
    formula: string;
  }>;
  totalDamages: Record<string, number>;
  rollInfo: Array<[string, string]>;
  description?: string;
  timestamp: number;
};

type SpellCardMessage = {
  type: 'SPELL_CARD';
  id: string;
  seq?: number;
  sessionId: string;
  campaignId: string;
  channel: 'general' | 'gm';
  character: string;
  title: string;
  source: string;
  description: string;
  properties: Record<string, string>;
  timestamp: number;
};

type RoomMessage = ChatMessage | DiceMessage | SpellCardMessage;

type ConnectionAuth = { userId: string; role: string };

export default class SessionRoom implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };

  private history: RoomMessage[] = [];
  private seq: number = 0;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const storedSeq = await this.room.storage.get<number>('seq');
    if (storedSeq !== undefined) this.seq = storedSeq;

    // Load individual message keys (msg:<seq>)
    const msgEntries = await this.room.storage.list<RoomMessage>({ prefix: 'msg:' });
    this.history = [...msgEntries.values()].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  }

  static async onBeforeConnect(request: Party.Request, lobby: Party.Lobby) {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) {
      return new Response('Unauthorized', { status: 401 });
    }

    const sessionSecret = lobby.env.SESSION_SECRET;
    if (typeof sessionSecret !== 'string' || sessionSecret.trim() === '') {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const secret = new TextEncoder().encode(sessionSecret);
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
      });

      const userId = typeof payload.sub === 'string' ? payload.sub.trim() : '';
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }

      // Verify the token was issued for this specific room/session
      const tokenSessionId = typeof payload.sessionId === 'string' ? payload.sessionId : '';
      const roomId = new URL(request.url).pathname.split('/').pop() ?? '';
      if (tokenSessionId && roomId && tokenSessionId !== roomId) {
        return new Response('Forbidden', { status: 403 });
      }

      const role = typeof payload.role === 'string' ? payload.role : 'player';
      request.headers.set('X-User-ID', userId);
      request.headers.set('X-User-Role', role);
      return request;
    } catch {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  async onConnect(connection: Party.Connection<ConnectionAuth>, ctx: Party.ConnectionContext) {
    // Store authenticated user ID and role on the connection (survives hibernation)
    const userId = ctx.request.headers.get('X-User-ID') ?? '';
    const role = ctx.request.headers.get('X-User-Role') ?? 'player';
    if (userId) {
      connection.setState({ userId, role });
    }

    // Filter GM messages from history for non-GM connections
    const visibleHistory =
      role === 'gm' ? this.history : this.history.filter((m) => m.channel !== 'gm');

    connection.send(JSON.stringify({ type: 'HISTORY', messages: visibleHistory }));
  }

  async onMessage(raw: string, sender: Party.Connection) {
    let msg: RoomMessage;
    try {
      msg = JSON.parse(raw) as RoomMessage;
    } catch {
      return; // Ignore malformed messages
    }

    if (!msg.type || !msg.id) return; // Validate required fields

    // Strict type validation — only allow known message types
    const validTypes = ['CHAT', 'DICE', 'SPELL_CARD'];
    if (!validTypes.includes(msg.type)) return;

    // Validate sessionId matches this room
    if ('sessionId' in msg && msg.sessionId !== this.room.id) return;

    // Per-type shape validation
    if (msg.type === 'CHAT' && typeof (msg as any).text !== 'string') return;
    if (msg.type === 'DICE' && !Array.isArray((msg as any).attackRolls)) return;
    if (msg.type === 'SPELL_CARD' && typeof (msg as any).title !== 'string') return;

    // Enforce sender identity — override authorId with authenticated user
    const connectionInfo = (sender as Party.Connection<ConnectionAuth>).state;
    if (!connectionInfo?.userId) return; // reject if no auth record

    // Only GMs can send on the gm channel
    if (msg.channel === 'gm' && connectionInfo.role !== 'gm') return;

    if ('authorId' in msg) {
      (msg as ChatMessage).authorId = connectionInfo.userId;
    }

    this.seq++;
    msg.seq = this.seq;

    this.history = [...this.history, msg];

    // Trim oldest messages beyond limit and remove their storage keys
    if (this.history.length > HISTORY_LIMIT) {
      const evicted = this.history.splice(0, this.history.length - HISTORY_LIMIT);
      const keysToDelete = evicted.map((m) => `msg:${m.seq}`);
      await this.room.storage.delete(keysToDelete);
    }

    await this.room.storage.put({ [`msg:${this.seq}`]: msg, seq: this.seq });

    // Filter GM channel messages — only send to GM connections
    if (msg.channel === 'gm') {
      const payload = JSON.stringify(msg);
      for (const conn of this.room.getConnections<ConnectionAuth>()) {
        if (conn.state?.role === 'gm') {
          conn.send(payload);
        }
      }
    } else {
      this.room.broadcast(JSON.stringify(msg));
    }
  }
}
