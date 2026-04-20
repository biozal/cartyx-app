import { z } from 'zod';

const pictureCropSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  width: z.number().finite().gt(0).max(1),
  height: z.number().finite().gt(0).max(1),
});

export const createCharacterSchema = z.object({
  campaignId: z.string().trim().min(1),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  race: z.string().trim().optional().default(''),
  characterClass: z.string().trim().optional().default(''),
  age: z.number().int().positive().nullable().optional().default(null),
  location: z.string().trim().optional().default(''),
  link: z
    .string()
    .trim()
    .regex(/^(https?:\/\/.+)?$/, 'Must be an HTTP or HTTPS URL')
    .optional()
    .default(''),
  picture: z.string().optional().default(''),
  pictureCrop: pictureCropSchema.nullable().optional().default(null),
  notes: z.string().optional().default(''),
  gmNotes: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(false),
  sessionId: z.string().trim().min(1).optional(),
  sessions: z.array(z.string()).optional().default([]),
});

export const updateCharacterSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  race: z.string().trim().optional().default(''),
  characterClass: z.string().trim().optional().default(''),
  age: z.number().int().positive().nullable().optional().default(null),
  location: z.string().trim().optional().default(''),
  link: z
    .string()
    .trim()
    .regex(/^(https?:\/\/.+)?$/, 'Must be an HTTP or HTTPS URL')
    .optional()
    .default(''),
  picture: z.string().optional().default(''),
  pictureCrop: pictureCropSchema.nullable().optional().default(null),
  notes: z.string().optional().default(''),
  gmNotes: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional(),
  sessionId: z.string().trim().min(1).optional(),
  sessions: z.array(z.string()).optional().default([]),
});

export const deleteCharacterSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
});

export const listCharactersSchema = z.object({
  campaignId: z.string().min(1),
  sessionId: z.string().optional(),
  search: z.string().optional(),
  visibility: z.enum(['all', 'public', 'private']).optional().default('all'),
  tags: z.array(z.string()).optional(),
});

export const getCharacterSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
});

export const updateCharacterStatusSchema = z.object({
  id: z.string().min(1),
  campaignId: z.string().min(1),
  value: z.enum(['alive', 'deceased']),
});

export const addCharacterRelationshipSchema = z.object({
  characterId: z.string().min(1),
  campaignId: z.string().min(1),
  targetCharacterId: z.string().min(1),
  descriptor: z.string().trim().min(1),
  reciprocalDescriptor: z.string().trim().min(1),
  isPublic: z.boolean().optional().default(false),
});

export const updateCharacterRelationshipSchema = z.object({
  characterId: z.string().min(1),
  campaignId: z.string().min(1),
  targetCharacterId: z.string().min(1),
  descriptor: z.string().trim().min(1).optional(),
  reciprocalDescriptor: z.string().trim().min(1).optional(),
  isPublic: z.boolean().optional(),
});

export const removeCharacterRelationshipSchema = z.object({
  characterId: z.string().min(1),
  campaignId: z.string().min(1),
  targetCharacterId: z.string().min(1),
});
