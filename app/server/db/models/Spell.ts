import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId, tags, touchAndNormalizeTags, touchUpdate } from './schema-parts';

const diceSchema = z.object({ count: z.number().nullish(), sides: z.number().nullish() });

const modifierSchema = z.object({
  id: z.string(),
  type: z.string(),
  dice: diceSchema.nullish(),
  scaling: z.object({ perStep: diceSchema.nullish() }).nullish(),
  fixedValue: z.number().nullish(),
  damageType: z.string().nullish(),
  atHigherLevels: z.string().nullish(),
  notes: z.string().nullish(),
});

const conditionSchema = z.object({ id: z.string(), action: z.string(), condition: z.string() });

const higherLevelSchema = z.object({
  id: z.string(),
  level: z.number(),
  description: z.string(),
});

// Mongoose nested paths always exist, with their defaults filled in: hence prefault.
export const spellSchema = z.object({
  _id: objectId,
  campaignId: objectId,
  createdBy: objectId,
  source: z.enum(['srd', 'homebrew']).default('homebrew'),
  name: z.string(),
  description: z.string(),
  imageUrl: z.string().nullish(),
  level: z.number().min(0).max(9),
  school: z.string(),
  version: z.string().nullish(),
  castingTime: z
    .object({
      value: z.number().default(1),
      unit: z.string().default('action'),
      reactionCondition: z.string().nullish(),
    })
    .prefault({}),
  components: z
    .object({
      verbal: z.boolean().default(false),
      somatic: z.boolean().default(false),
      material: z.boolean().default(false),
      materialDescription: z.string().nullish(),
    })
    .prefault({}),
  range: z
    .object({ type: z.string().default('self'), distance: z.number().nullish() })
    .prefault({}),
  duration: z
    .object({
      type: z.string().default('instantaneous'),
      value: z.number().nullish(),
      unit: z.string().nullish(),
      concentration: z.boolean().default(false),
    })
    .prefault({}),
  ritual: z.boolean().default(false),
  higherLevelScaling: z
    .object({ enabled: z.boolean().default(false), type: z.string().nullish() })
    .prefault({}),
  classes: z.array(z.string()).default([]),
  attackSave: z
    .object({
      kind: z.string().default('none'),
      attackType: z.string().nullish(),
      saveAbility: z.string().nullish(),
      saveEffect: z.string().nullish(),
    })
    .prefault({}),
  modifiers: z.array(modifierSchema).default([]),
  conditions: z.array(conditionSchema).default([]),
  higherLevels: z.array(higherLevelSchema).default([]),
  areaOfEffect: z
    .object({
      shape: z.string().default('none'),
      size: z.number().nullish(),
      width: z.number().nullish(),
    })
    .prefault({}),
  tags: tags(),
  createdAt: now(),
  updatedAt: now(),
});

export type ISpell = z.infer<typeof spellSchema>;

export const Spell = defineGraphModel<ISpell>({
  name: 'spells',
  kind: 'Spell',
  modelName: 'Spell',
  schema: spellSchema,
  index: {
    campaignId: 'ix_s1',
    createdBy: 'ix_s2',
    school: 'ix_s3',
    source: 'ix_s4',
    level: 'ix_n1',
    updatedAt: 'ix_d1',
  },
  searchText: (spell) => `${spell.name} ${spell.description}`,
  preSave: touchAndNormalizeTags,
  preFindOneAndUpdate: (update) => touchUpdate(update, { tags: true }),
});
