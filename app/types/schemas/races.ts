import { z } from 'zod';

export const createRaceSchema = z.object({
  campaignId: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Title is required'),
  content: z.string().trim().min(1, 'Content is required'),
  tags: z.array(z.string()).optional().default([]),
});

export const updateRaceSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
  title: z.string().trim().min(1, 'Title is required'),
  content: z.string().trim().min(1, 'Content is required'),
  tags: z.array(z.string()).optional().default([]),
});

export const deleteRaceSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
});

export const listRacesSchema = z.object({
  campaignId: z.string().trim().min(1),
  search: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const getRaceSchema = z.object({
  id: z.string().trim().min(1),
  campaignId: z.string().trim().min(1),
});
