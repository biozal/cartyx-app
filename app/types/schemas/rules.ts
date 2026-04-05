import { z } from 'zod';

export const createRuleSchema = z.object({
  campaignId: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Title is required'),
  content: z.string().trim().min(1, 'Rule content is required'),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional().default(false),
});

export const updateRuleSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Title is required'),
  content: z.string().trim().min(1, 'Rule content is required'),
  tags: z.array(z.string()).optional().default([]),
  isPublic: z.boolean().optional(),
});

export const deleteRuleSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
});

export const listRulesSchema = z.object({
  campaignId: z.string().min(1),
  search: z.string().optional(),
  visibility: z.enum(['all', 'public', 'private']).optional().default('all'),
  tags: z.array(z.string()).optional(),
});

export const getRuleSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
});
