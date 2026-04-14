import type * as Party from 'partykit/server';

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
  attackRolls: Array<{ roll: number; type: string; total: number }>;
  damageRolls: Array<{
    damageType: string;
    dice: number[];
    total: number;
    flags: number;
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

export default class SessionRoom implements Party.Server {
  options: Party.ServerOptions = { hibernate: true };

  private history: RoomMessage[] = [];
  private seq: number = 0;
  private connectionUsers: Map<string, string> = new Map();

  constructor(readonly room: Party.Room) {}

  async onStart() {
    const stored = await this.room.storage.get<RoomMessage[] | number>(['history', 'seq']);
    const storedHistory = stored.get('history') as RoomMessage[] | undefined;
    if (storedHistory) this.history = storedHistory;

    const storedSeq = stored.get('seq') as number | undefined;
    if (storedSeq !== undefined) this.seq = storedSeq;
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
      const { jwtVerify } = await import('jose');
      const secret = new TextEncoder().encode(sessionSecret);
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
      });

      const userId = typeof payload.sub === 'string' ? payload.sub.trim() : '';
      if (!userId) {
        return new Response('Unauthorized', { status: 401 });
      }

      request.headers.set('X-User-ID', userId);
      return request;
    } catch {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  async onConnect(connection: Party.Connection, ctx: Party.ConnectionContext) {
    // Store authenticated user ID from the request headers set in onBeforeConnect
    const userId = ctx.request.headers.get('X-User-ID') ?? '';
    if (userId) {
      this.connectionUsers.set(connection.id, userId);
    }

    connection.send(JSON.stringify({ type: 'HISTORY', messages: this.history }));
  }

  async onClose(connection: Party.Connection) {
    this.connectionUsers.delete(connection.id);
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
    const authenticatedUserId = this.connectionUsers.get(sender.id);
    if (!authenticatedUserId) return; // reject if no auth record

    if ('authorId' in msg) {
      (msg as ChatMessage).authorId = authenticatedUserId;
    }

    this.seq++;
    msg.seq = this.seq;

    this.history = [...this.history, msg].slice(-HISTORY_LIMIT);

    await this.room.storage.put({ history: this.history, seq: this.seq });

    this.room.broadcast(JSON.stringify(msg));
  }
}
