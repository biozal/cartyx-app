import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { objectId } from './schema-parts';

/**
 * A realtime room's persisted message history, written by the realtime service so a
 * room survives a restart. The service keeps the latest messages per room and trims
 * the rest; `msg` is the room message exactly as broadcast.
 */
export const realtimeRoomMessageSchema = z.object({
  _id: objectId,
  roomId: z.string(),
  seq: z.number(),
  msg: z.unknown(),
});

export type IRealtimeRoomMessage = z.infer<typeof realtimeRoomMessageSchema>;

export const RealtimeRoomMessage = defineGraphModel<IRealtimeRoomMessage>({
  name: 'realtime_room_messages',
  kind: 'RealtimeRoomMessage',
  modelName: 'RealtimeRoomMessage',
  schema: realtimeRoomMessageSchema,
  index: { roomId: 'ix_s1', seq: 'ix_n1' },
  unique: { roomId_seq: (message) => [message.roomId, message.seq] },
});
