import { z } from 'zod';
import { defineGraphModel } from '~/server/repositories/graph-model';
import { now, objectId, touch } from './schema-parts';

export const organizationMembershipSchema = z.object({
  _id: objectId,
  organizationId: objectId,
  memberKind: z.enum(['player', 'character']),
  memberId: objectId,
  title: z.string().default(''),
  publicNotes: z.string().default(''),
  privateNotes: z.string().default(''),
  campaignId: objectId,
  createdBy: objectId,
  createdAt: now(),
  updatedAt: now(),
});

export type IOrganizationMembership = z.infer<typeof organizationMembershipSchema>;

export const OrganizationMembership = defineGraphModel<IOrganizationMembership>({
  name: 'organizationmemberships',
  kind: 'OrganizationMembership',
  modelName: 'OrganizationMembership',
  schema: organizationMembershipSchema,
  index: {
    organizationId: 'ix_s1',
    campaignId: 'ix_s2',
    memberKind: 'ix_s3',
    memberId: 'ix_s4',
  },
  unique: {
    organizationId_memberKind_memberId: (membership) => [
      membership.organizationId,
      membership.memberKind,
      membership.memberId,
    ],
  },
  preSave: touch,
});
