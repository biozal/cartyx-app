import { RealtimeRoomMessage } from '../../app/server/db/models/RealtimeRoomMessage';

export type StoredMessage = { roomId: string; seq: number; msg: unknown };

export interface HistoryStore {
  /** All messages for a room, ordered by seq ascending. */
  load(roomId: string): Promise<StoredMessage[]>;
  append(entry: StoredMessage): Promise<void>;
  /** Delete every message in the room with seq <= maxSeqInclusive. */
  deleteUpTo(roomId: string, maxSeqInclusive: number): Promise<void>;
}

export class MemoryHistoryStore implements HistoryStore {
  private rooms = new Map<string, StoredMessage[]>();

  async load(roomId: string): Promise<StoredMessage[]> {
    return [...(this.rooms.get(roomId) ?? [])].sort((a, b) => a.seq - b.seq);
  }
  async append(entry: StoredMessage): Promise<void> {
    const list = this.rooms.get(entry.roomId) ?? [];
    list.push(entry);
    this.rooms.set(entry.roomId, list);
  }
  async deleteUpTo(roomId: string, maxSeqInclusive: number): Promise<void> {
    const kept = (this.rooms.get(roomId) ?? []).filter((m) => m.seq > maxSeqInclusive);
    this.rooms.set(roomId, kept);
  }
}

/**
 * History in the graph, through the app's own model: one entity per message, unique
 * per (room, seq), so a room's history survives a restart of this service.
 */
export class GraphHistoryStore implements HistoryStore {
  async load(roomId: string): Promise<StoredMessage[]> {
    const rows = await RealtimeRoomMessage.find({ roomId }).sort({ seq: 1 }).lean();
    return rows.map((row) => ({ roomId: row.roomId, seq: row.seq, msg: row.msg }));
  }
  async append(entry: StoredMessage): Promise<void> {
    await RealtimeRoomMessage.create({ roomId: entry.roomId, seq: entry.seq, msg: entry.msg });
  }
  async deleteUpTo(roomId: string, maxSeqInclusive: number): Promise<void> {
    await RealtimeRoomMessage.deleteMany({ roomId, seq: { $lte: maxSeqInclusive } });
  }
}
