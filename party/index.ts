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

  async onConnect(connection: Party.Connection) {
    connection.send(JSON.stringify({ type: 'HISTORY', messages: this.history }));
  }

  async onMessage(raw: string, _sender: Party.Connection) {
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

    // NOTE: Full sender identity validation (msg.authorId === connection user)
    // requires PartyKit connection state features to propagate the user ID
    // from onBeforeConnect headers to the connection object.

    this.seq++;
    msg.seq = this.seq;

    this.history = [...this.history, msg].slice(-HISTORY_LIMIT);

    await this.room.storage.put({ history: this.history, seq: this.seq });

    this.room.broadcast(JSON.stringify(msg));
  }
}
