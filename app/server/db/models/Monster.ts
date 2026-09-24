import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { cropSchema, now, objectId, touch, touchUpdate } from './schema-parts';

const abilityScoreSchema = z.object({
  score: z.number().default(10),
  mod: z.number().default(0),
  save: z.number().default(0),
});

const speedSchema = z.object({
  kind: z.enum(['walk', 'fly', 'swim', 'climb', 'burrow']),
  feet: z.number().default(30),
  notes: z.string().default(''),
});

const skillSchema = z.object({ name: z.string(), modifier: z.number().default(0) });

const senseSchema = z.object({ name: z.string(), range: z.number().nullable().default(null) });

const featureSchema = z.object({
  section: z.enum(['traits', 'actions', 'bonusActions', 'reactions', 'legendaryActions']),
  name: z.string(),
  description: z.string().default(''),
});

const linkSchema = z.object({ name: z.string(), url: z.string() });

const crSchema = z.object({
  value: z.number().default(0), // 0, 0.125 (1/8), 0.25 (1/4), 0.5 (1/2), int
  xp: z.number().default(0),
  proficiencyBonus: z.number().default(2),
});

// Subdocument defaults of `() => ({})` are filled in by Mongoose: hence prefault.
export const monsterSchema = z.object({
  _id: objectId,
  // ---- Identity / taxonomy ----
  name: z.string(),
  size: z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']).default('medium'),
  type: z.string().default(''),
  subtype: z.string().default(''),
  alignment: z.string().default(''),

  // ---- Stat block ----
  armorClass: z.number().default(10),
  armorClassNote: z.string().default(''),
  hitPoints: z
    .object({ average: z.number().default(1), formula: z.string().default('') })
    .prefault({}),
  initiativeMod: z.number().default(0),
  initiativePassive: z.number().default(10),
  speeds: z.array(speedSchema).default(() => [{ kind: 'walk' as const, feet: 30, notes: '' }]),
  abilities: z
    .object({
      str: abilityScoreSchema.prefault({}),
      dex: abilityScoreSchema.prefault({}),
      con: abilityScoreSchema.prefault({}),
      int: abilityScoreSchema.prefault({}),
      wis: abilityScoreSchema.prefault({}),
      cha: abilityScoreSchema.prefault({}),
    })
    .prefault({}),
  skills: z.array(skillSchema).default([]),
  resistances: z.array(z.string()).default([]),
  immunities: z.array(z.string()).default([]),
  vulnerabilities: z.array(z.string()).default([]),
  conditionImmunities: z.array(z.string()).default([]),
  senses: z.array(senseSchema).default([]),
  passivePerception: z.number().default(10),
  languages: z.array(z.string()).default([]),
  cr: crSchema.prefault({}),
  features: z.array(featureSchema).default([]),

  // ---- Cartyx additions ----
  picture: z.string().default(''),
  pictureCrop: cropSchema.nullable().default(null),
  links: z.array(linkSchema).default([]),
  gmNotes: z.string().default(''),
  tags: z.array(z.string()).default([]),
  sessionId: objectId.nullable().default(null),
  color: z.string().default('#9ca3af'),
  source: z.enum(['srd', 'custom']).default('custom'),
  isHomebrew: z.boolean().default(false),

  // ---- Ownership ----
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IMonster = z.infer<typeof monsterSchema>;

export const Monster = defineGraphModel<IMonster>({
  name: 'monsters',
  kind: 'Monster',
  modelName: 'Monster',
  schema: monsterSchema,
  index: {
    campaignId: 'ix_s1',
    createdBy: 'ix_s2',
    name: 'ix_s3',
    sessionId: 'ix_s4',
    source: 'ix_s5',
    updatedAt: 'ix_d1',
  },
  searchText: (monster) =>
    [monster.name, ...monster.features.map((feature) => feature.description)].join(' '),
  preSave: touch,
  preFindOneAndUpdate: (update) => touchUpdate(update),
});
