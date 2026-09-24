import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { imageSchema, now, objectId, tags, touchAndNormalizeTags } from './schema-parts';

const locationLinkSchema = z.object({
  locationId: objectId,
  publicInfo: z.string().default(''),
  privateInfo: z.string().default(''),
});

export const organizationSchema = z.object({
  _id: objectId,
  name: z.string(),
  publicInfo: z.string().default(''),
  privateInfo: z.string().default(''),
  isPublic: z.boolean().default(false),
  images: z.array(imageSchema).default([]),
  locations: z.array(locationLinkSchema).default([]),
  tags: tags(),
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IOrganization = z.infer<typeof organizationSchema>;

export const Organization = defineGraphModel<IOrganization>({
  name: 'organizations',
  kind: 'Organization',
  modelName: 'Organization',
  schema: organizationSchema,
  index: { campaignId: 'ix_s1', createdBy: 'ix_s2', isPublic: 'ix_b1', updatedAt: 'ix_d1' },
  searchText: (organization) => `${organization.name} ${organization.publicInfo}`,
  preSave: touchAndNormalizeTags,
});
