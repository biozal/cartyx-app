import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId, tags, touchAndNormalizeTags, touchUpdate } from './schema-parts';

export const noteSchema = z.object({
  _id: objectId,
  title: z.string(),
  tags: tags(),
  note: z.string(),
  isPublic: z.boolean().default(false),
  isReadOnly: z.boolean().default(false),
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
  sessionId: objectId.nullish(),
  campaignId: objectId,
});

export type INote = z.infer<typeof noteSchema>;

export const Note = defineGraphModel<INote>({
  name: 'notes',
  kind: 'Note',
  modelName: 'Note',
  schema: noteSchema,
  index: {
    campaignId: 'ix_s1',
    sessionId: 'ix_s2',
    createdBy: 'ix_s3',
    isPublic: 'ix_b1',
    updatedAt: 'ix_d1',
  },
  searchText: (note) => `${note.title} ${note.note}`,
  preSave: touchAndNormalizeTags,
  preFindOneAndUpdate: (update) => touchUpdate(update, { tags: true }),
});
