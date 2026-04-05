# Wiki Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rules feature to the Wiki system — GM-only CRUD, public/private visibility, drag-to-GM-screen with scrollable rendered markdown.

**Architecture:** Mirrors the existing Notes feature. Dedicated Mongoose model, TanStack Start server functions, React Query hooks, and Wiki panel integration. Rules use GM-only permissions (any GM can create/edit/delete any rule) with no session association.

**Tech Stack:** MongoDB/Mongoose, TanStack Start (createServerFn), React 19, TanStack Query, Zod, Tailwind CSS, ReactMarkdown, lucide-react

**Spec:** `docs/superpowers/specs/2026-04-05-wiki-rules-design.md`

---

## File Structure

### New Files

- `app/types/rule.ts` — TypeScript interfaces (RuleData, RuleListItem)
- `app/types/schemas/rules.ts` — Zod validation schemas
- `app/server/db/models/Rule.ts` — Mongoose model
- `app/server/functions/rules.ts` — Server functions (CRUD + list)
- `app/hooks/useRules.ts` — React Query hooks
- `app/components/wiki/rules/RulesPanel.tsx` — Wiki list panel with filtering
- `app/components/wiki/rules/RuleCard.tsx` — Draggable list item card
- `app/components/wiki/rules/RuleModal.tsx` — Editor modal (GM-only)
- `app/components/wiki/rules/RuleViewModal.tsx` — Read-only view modal (players)
- `app/components/wiki/rules/RuleWindow.tsx` — GM screen rendered content
- `app/components/mainview/gmscreens/RuleWindowWrapper.tsx` — GM screen wrapper with edit button

### Modified Files

- `app/utils/queryKeys.ts` — Add rules query keys
- `app/components/wiki/shared/WikiFilterBar.tsx` — Add `showSessionFilter` prop
- `app/components/wiki/WikiPanel.tsx` — Add "Rules" category
- `app/server/functions/gmscreens.ts` — Add `rule` to `COLLECTION_REGISTRY`, import Rule model
- `app/components/mainview/gmscreens/GMScreensView.tsx` — Handle `rule` collection windows with edit support

---

### Task 1: Types & Validation Schemas

**Files:**

- Create: `app/types/rule.ts`
- Create: `app/types/schemas/rules.ts`

- [ ] **Step 1: Create TypeScript interfaces**

Create `app/types/rule.ts`:

```typescript
export interface RuleData {
  id: string;
  campaignId: string;
  createdBy: string;
  title: string;
  content: string;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleListItem {
  id: string;
  campaignId: string;
  createdBy: string;
  title: string;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Create Zod validation schemas**

Create `app/types/schemas/rules.ts`:

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add app/types/rule.ts app/types/schemas/rules.ts
git commit -m "feat(rules): add TypeScript types and Zod validation schemas"
```

---

### Task 2: Mongoose Model

**Files:**

- Create: `app/server/db/models/Rule.ts`

- [ ] **Step 1: Create Rule Mongoose model**

Create `app/server/db/models/Rule.ts`:

```typescript
import mongoose from 'mongoose';
import { normalizeTags } from '~/server/utils/helpers';

const ruleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  tags: { type: [String], default: [] },
  isPublic: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
});

ruleSchema.pre('save', function () {
  if (this.isModified('tags')) {
    this.tags = normalizeTags(this.tags);
  }
  this.updatedAt = new Date();
});

ruleSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as unknown;
  if (!update) return;

  if (Array.isArray(update)) {
    let hasSetStage = false;
    update.forEach((stage) => {
      if (!stage || typeof stage !== 'object') return;
      const stageObj = stage as Record<string, any>;
      if (!('$set' in stageObj)) return;
      hasSetStage = true;
      const set = stageObj.$set as Record<string, any>;
      if (Array.isArray(set.tags)) {
        set.tags = normalizeTags(set.tags as string[]);
      }
      set.updatedAt = new Date();
    });
    if (!hasSetStage) {
      update.push({ $set: { updatedAt: new Date() } });
    }
    this.setUpdate(update);
    return;
  }

  const updateObj = update as Record<string, any>;
  if ('$set' in updateObj) {
    const set = (updateObj.$set ??= {});
    if (Array.isArray(set.tags)) {
      set.tags = normalizeTags(set.tags as string[]);
    }
    set.updatedAt = new Date();
  } else {
    if (Array.isArray(updateObj.tags)) {
      updateObj.tags = normalizeTags(updateObj.tags as string[]);
    }
    updateObj.updatedAt = new Date();
  }
});

if (typeof (ruleSchema as { index?: unknown }).index === 'function') {
  ruleSchema.index({ campaignId: 1 });
  ruleSchema.index({ campaignId: 1, updatedAt: -1 });
  ruleSchema.index({ createdBy: 1 });
  ruleSchema.index({ tags: 1 });
  ruleSchema.index({ isPublic: 1 });
  ruleSchema.index({ title: 'text', content: 'text' });
}

export const Rule = mongoose.models.Rule || mongoose.model('Rule', ruleSchema);
```

- [ ] **Step 2: Commit**

```bash
git add app/server/db/models/Rule.ts
git commit -m "feat(rules): add Rule Mongoose model"
```

---

### Task 3: Server Functions

**Files:**

- Create: `app/server/functions/rules.ts`

- [ ] **Step 1: Create server functions file**

Create `app/server/functions/rules.ts`. This file contains two auth helpers (`requireCampaignMember` and `requireCampaignGM`) and five server functions.

Key differences from Notes:

- `createRule`, `updateRule`, `deleteRule` use `requireCampaignGM` (not `requireCampaignMember`)
- `updateRule` and `deleteRule` do NOT check `createdBy` — any GM can edit/delete any rule
- No `sessionId` anywhere
- No `isReadOnly` check
- `listRules` constrains non-GMs to public rules only (they can't see private rules at all)

```typescript
import { createServerFn } from '@tanstack/react-start';
import { getSession } from '../session';
import { connectDB, isDBConnected } from '../db/connection';
import { User } from '../db/models/User';
import { Campaign } from '../db/models/Campaign';
import { Rule } from '../db/models/Rule';
import { serverCaptureException, serverCaptureEvent } from '../utils/posthog';
import { normalizeTags } from '../utils/helpers';
import { removeDocumentRefsFromScreens } from './gmscreens-helpers';
import { ensureTags as ensureTagsFn } from './tags';
import type { RuleData, RuleListItem } from '~/types/rule';
import {
  createRuleSchema,
  updateRuleSchema,
  deleteRuleSchema,
  listRulesSchema,
  getRuleSchema,
} from '~/types/schemas/rules';

function serializeRule(r: {
  _id: unknown;
  campaignId: unknown;
  createdBy: unknown;
  title?: string;
  content?: string;
  tags?: string[];
  isPublic?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): RuleData {
  return {
    id: String(r._id),
    campaignId: String(r.campaignId),
    createdBy: String(r.createdBy),
    title: r.title ?? '',
    content: r.content ?? '',
    tags: r.tags ?? [],
    isPublic: r.isPublic ?? false,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : '',
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : '',
  };
}

function serializeRuleListItem(r: {
  _id: unknown;
  campaignId: unknown;
  createdBy: unknown;
  title?: string;
  tags?: string[];
  isPublic?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}): RuleListItem {
  return {
    id: String(r._id),
    campaignId: String(r.campaignId),
    createdBy: String(r.createdBy),
    title: r.title ?? '',
    tags: r.tags ?? [],
    isPublic: r.isPublic ?? false,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : '',
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : '',
  };
}

async function requireCampaignMember(
  campaignId: string
): Promise<{ userId: string; sessionUserId: string; isGM: boolean }> {
  const user = await getSession();
  if (!user) throw new Error('Not authenticated');

  await connectDB();
  if (!isDBConnected()) throw new Error('Database not available');

  const dbUser = await User.findOne({ providerId: user.id });
  if (!dbUser) throw new Error('User not found');

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const userId = String(dbUser._id);
  const members = campaign.members ?? [];
  const member = members.find(
    (m: { userId: unknown; role?: string }) => String(m.userId) === userId
  );
  const isGM = String(campaign.gameMasterId) === userId || member?.role === 'gm';
  const isMember = !!member || isGM;
  if (!isMember) throw new Error('Forbidden');

  return { userId, sessionUserId: user.id, isGM };
}

async function requireCampaignGM(
  campaignId: string
): Promise<{ userId: string; sessionUserId: string }> {
  const user = await getSession();
  if (!user) throw new Error('Not authenticated');

  await connectDB();
  if (!isDBConnected()) throw new Error('Database not available');

  const dbUser = await User.findOne({ providerId: user.id });
  if (!dbUser) throw new Error('User not found');

  const campaign = await Campaign.findById(campaignId);
  if (!campaign) throw new Error('Campaign not found');

  const userId = String(dbUser._id);
  const members = campaign.members ?? [];
  const isGM =
    String(campaign.gameMasterId) === userId ||
    members.some(
      (m: { userId: unknown; role?: string }) => String(m.userId) === userId && m.role === 'gm'
    );
  if (!isGM) throw new Error('Forbidden');

  return { userId, sessionUserId: user.id };
}

// ---------------------------------------------------------------------------
// createRule
// ---------------------------------------------------------------------------

export { createRuleSchema };

export const createRule = createServerFn({ method: 'POST' })
  .inputValidator(createRuleSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined;
    try {
      const gm = await requireCampaignGM(data.campaignId);
      sessionUserId = gm.sessionUserId;
      const userId = gm.userId;

      const now = new Date();
      const finalTags = normalizeTags(data.tags ?? []);
      const ruleData: Record<string, unknown> = {
        campaignId: data.campaignId,
        createdBy: userId,
        title: data.title.trim(),
        content: data.content.trim(),
        tags: finalTags,
        isPublic: data.isPublic ?? false,
        createdAt: now,
        updatedAt: now,
      };
      const doc = await Rule.create(ruleData);

      await ensureTagsFn({ data: { campaignId: data.campaignId, tags: finalTags } });

      serverCaptureEvent(sessionUserId, 'rule_created', {
        campaign_id: data.campaignId,
        rule_id: String(doc._id),
      });

      return { success: true, rule: serializeRule(doc) };
    } catch (e) {
      serverCaptureException(e, sessionUserId, {
        action: 'createRule',
        campaignId: data.campaignId,
      });
      throw e;
    }
  });

// ---------------------------------------------------------------------------
// updateRule
// ---------------------------------------------------------------------------

export { updateRuleSchema };

export const updateRule = createServerFn({ method: 'POST' })
  .inputValidator(updateRuleSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined;
    try {
      const gm = await requireCampaignGM(data.campaignId);
      sessionUserId = gm.sessionUserId;
      const userId = gm.userId;

      const existing = await Rule.findById(data.id);
      if (!existing) throw new Error('Rule not found');
      if (String(existing.campaignId) !== data.campaignId) throw new Error('Forbidden');

      const finalTags = normalizeTags(data.tags ?? []);
      existing.title = data.title.trim();
      existing.content = data.content.trim();
      existing.tags = finalTags;
      if (data.isPublic !== undefined) {
        existing.isPublic = data.isPublic;
      }
      existing.updatedAt = new Date();
      await existing.save();

      await ensureTagsFn({ data: { campaignId: data.campaignId, tags: finalTags } });

      serverCaptureEvent(sessionUserId, 'rule_updated', {
        campaign_id: data.campaignId,
        rule_id: data.id,
        updated_by: userId,
      });

      return { success: true, rule: serializeRule(existing) };
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'updateRule', ruleId: data.id });
      throw e;
    }
  });

// ---------------------------------------------------------------------------
// deleteRule
// ---------------------------------------------------------------------------

export { deleteRuleSchema };

export const deleteRule = createServerFn({ method: 'POST' })
  .inputValidator(deleteRuleSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined;
    try {
      const gm = await requireCampaignGM(data.campaignId);
      sessionUserId = gm.sessionUserId;
      const userId = gm.userId;

      const existing = await Rule.findById(data.id);
      if (!existing) throw new Error('Rule not found');
      if (String(existing.campaignId) !== data.campaignId) throw new Error('Forbidden');

      await existing.deleteOne();

      try {
        await removeDocumentRefsFromScreens(data.campaignId, 'rule', data.id);
      } catch (cleanupError) {
        serverCaptureException(cleanupError, sessionUserId, {
          action: 'deleteRule.cleanup',
          campaignId: data.campaignId,
          ruleId: data.id,
        });
      }

      serverCaptureEvent(sessionUserId, 'rule_deleted', {
        campaign_id: data.campaignId,
        rule_id: data.id,
        deleted_by: userId,
      });

      return { success: true };
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'deleteRule', ruleId: data.id });
      throw e;
    }
  });

// ---------------------------------------------------------------------------
// listRules
// ---------------------------------------------------------------------------

export { listRulesSchema };

export const listRules = createServerFn({ method: 'GET' })
  .inputValidator(listRulesSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined;
    try {
      const member = await requireCampaignMember(data.campaignId);
      sessionUserId = member.sessionUserId;

      const filter: Record<string, unknown> = { campaignId: data.campaignId };

      if (member.isGM) {
        // GMs see all rules; apply visibility filter only when explicitly requested
        if (data.visibility === 'public') {
          filter.isPublic = true;
        } else if (data.visibility === 'private') {
          filter.isPublic = false;
        }
      } else {
        // Non-GMs can only see public rules
        filter.isPublic = true;
      }

      if (data.search && data.search.trim()) {
        filter.$text = { $search: data.search.trim() };
      }

      if (data.tags && data.tags.length > 0) {
        const normalizedTags = [...new Set(normalizeTags(data.tags))];
        if (normalizedTags.length > 0) {
          filter.tags = { $all: normalizedTags };
        }
      }

      const docs = await Rule.find(filter).select('-content').sort({ updatedAt: -1 }).lean();

      return (
        docs as Array<{
          _id: unknown;
          campaignId: unknown;
          createdBy: unknown;
          title?: string;
          tags?: string[];
          isPublic?: boolean;
          createdAt?: Date;
          updatedAt?: Date;
        }>
      ).map(serializeRuleListItem);
    } catch (e) {
      serverCaptureException(e, sessionUserId, {
        action: 'listRules',
        campaignId: data.campaignId,
      });
      throw e;
    }
  });

// ---------------------------------------------------------------------------
// getRule
// ---------------------------------------------------------------------------

export { getRuleSchema };

export const getRule = createServerFn({ method: 'GET' })
  .inputValidator(getRuleSchema)
  .handler(async ({ data }) => {
    let sessionUserId: string | undefined;
    try {
      const member = await requireCampaignMember(data.campaignId);
      sessionUserId = member.sessionUserId;

      const doc = await Rule.findById(data.id);
      if (!doc) return null;
      if (String(doc.campaignId) !== data.campaignId) return null;

      // Non-GMs can only see public rules
      if (!doc.isPublic && !member.isGM) {
        return null;
      }

      return serializeRule(doc);
    } catch (e) {
      serverCaptureException(e, sessionUserId, { action: 'getRule', ruleId: data.id });
      throw e;
    }
  });
```

- [ ] **Step 2: Verify the app compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to the new files

- [ ] **Step 3: Commit**

```bash
git add app/server/functions/rules.ts
git commit -m "feat(rules): add server functions for CRUD and listing"
```

---

### Task 4: Query Keys & React Query Hooks

**Files:**

- Modify: `app/utils/queryKeys.ts`
- Create: `app/hooks/useRules.ts`

- [ ] **Step 1: Add rules query keys**

In `app/utils/queryKeys.ts`, add a `rules` entry to the `queryKeys` object, after the `characters` entry and before the `tags` entry:

```typescript
  rules: {
    all: ['rules'] as const,
    list: (
      campaignId: string,
      search?: string,
      visibility?: string,
      tags?: string[]
    ) =>
      [
        'rules',
        'list',
        campaignId,
        search ?? '',
        visibility ?? 'all',
        tags ?? [],
      ] as const,
    detail: (id: string, campaignId?: string) => ['rules', 'detail', campaignId ?? '', id] as const,
  },
```

- [ ] **Step 2: Create React Query hooks**

Create `app/hooks/useRules.ts`:

```typescript
import { createServerFn } from '@tanstack/react-start';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { RuleData, RuleListItem } from '~/types/rule';
import { captureException } from '~/providers/PostHogProvider';
import { queryKeys } from '~/utils/queryKeys';
import {
  listRulesSchema,
  getRuleSchema,
  createRuleSchema,
  updateRuleSchema,
  deleteRuleSchema,
} from '~/types/schemas/rules';

// ---------------------------------------------------------------------------
// Server function wrappers — dynamic imports keep Mongoose server-only.
// ---------------------------------------------------------------------------

const listRulesFn = createServerFn({ method: 'GET' })
  .inputValidator(listRulesSchema)
  .handler(async ({ data }) => {
    const { listRules } = await import('~/server/functions/rules');
    return listRules({ data });
  });

const getRuleFn = createServerFn({ method: 'GET' })
  .inputValidator(getRuleSchema)
  .handler(async ({ data }) => {
    const { getRule } = await import('~/server/functions/rules');
    return getRule({ data });
  });

const createRuleFn = createServerFn({ method: 'POST' })
  .inputValidator(createRuleSchema)
  .handler(async ({ data }) => {
    const { createRule } = await import('~/server/functions/rules');
    return createRule({ data });
  });

const updateRuleFn = createServerFn({ method: 'POST' })
  .inputValidator(updateRuleSchema)
  .handler(async ({ data }) => {
    const { updateRule } = await import('~/server/functions/rules');
    return updateRule({ data });
  });

const deleteRuleFn = createServerFn({ method: 'POST' })
  .inputValidator(deleteRuleSchema)
  .handler(async ({ data }) => {
    const { deleteRule } = await import('~/server/functions/rules');
    return deleteRule({ data });
  });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

interface ListRulesFilters {
  search?: string;
  visibility?: 'all' | 'public' | 'private';
  tags?: string[];
}

export function useRules(campaignId: string, filters?: ListRulesFilters) {
  const search = filters?.search;
  const visibility = filters?.visibility;
  const tags = filters?.tags;

  const {
    data: rules = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.rules.list(campaignId, search, visibility, tags),
    queryFn: () =>
      listRulesFn({
        data: {
          campaignId,
          search,
          visibility,
          tags,
        },
      }),
    enabled: !!campaignId,
  });

  return {
    rules: rules as RuleListItem[],
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  };
}

export function useRule(id: string, campaignId: string) {
  const {
    data: rule = null,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.rules.detail(id, campaignId),
    queryFn: () => getRuleFn({ data: { id, campaignId } }),
    enabled: !!id && !!campaignId,
  });

  return {
    rule: rule as RuleData | null,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  };
}

interface CreateRuleInput {
  campaignId: string;
  title: string;
  content: string;
  tags?: string[];
  isPublic?: boolean;
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: CreateRuleInput) => createRuleFn({ data: input }),
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['rules', 'list', campaignId], exact: false });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.list(campaignId) });
    },
    onError: (e) => {
      captureException(e, { action: 'createRule' });
    },
  });

  const create = async (input: CreateRuleInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    create,
    isLoading: mutation.isPending,
    error:
      mutation.error instanceof Error
        ? mutation.error.message
        : mutation.error
          ? String(mutation.error)
          : null,
  };
}

interface UpdateRuleInput {
  id: string;
  campaignId: string;
  title: string;
  content: string;
  tags?: string[];
  isPublic?: boolean;
}

export function useUpdateRule() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: UpdateRuleInput) => updateRuleFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['rules', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.rules.detail(variables.id, variables.campaignId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.list(variables.campaignId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all });
    },
    onError: (e, variables) => {
      captureException(e, { action: 'updateRule', ruleId: variables.id });
    },
  });

  const update = async (input: UpdateRuleInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    update,
    isLoading: mutation.isPending,
    error:
      mutation.error instanceof Error
        ? mutation.error.message
        : mutation.error
          ? String(mutation.error)
          : null,
  };
}

interface DeleteRuleInput {
  id: string;
  campaignId: string;
}

export function useDeleteRule() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: DeleteRuleInput) => deleteRuleFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['rules', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.removeQueries({
        queryKey: queryKeys.rules.detail(variables.id, variables.campaignId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all });
    },
    onError: (e, variables) => {
      captureException(e, { action: 'deleteRule', ruleId: variables.id });
    },
  });

  const remove = async (input: DeleteRuleInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    remove,
    isLoading: mutation.isPending,
    error:
      mutation.error instanceof Error
        ? mutation.error.message
        : mutation.error
          ? String(mutation.error)
          : null,
  };
}
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors related to the new files

- [ ] **Step 4: Commit**

```bash
git add app/utils/queryKeys.ts app/hooks/useRules.ts
git commit -m "feat(rules): add query keys and React Query hooks"
```

---

### Task 5: WikiFilterBar — Optional Session Filter

**Files:**

- Modify: `app/components/wiki/shared/WikiFilterBar.tsx`

- [ ] **Step 1: Add showSessionFilter prop**

In `app/components/wiki/shared/WikiFilterBar.tsx`, make the session-related props optional and add a `showSessionFilter` prop:

Update the `WikiFilterBarProps` interface — make `sessionId`, `onSessionChange`, and `sessions` optional, and add `showSessionFilter`:

```typescript
interface WikiFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sessionId?: string;
  onSessionChange?: (value: string) => void;
  visibility: 'all' | 'public' | 'private';
  onVisibilityChange: (value: 'all' | 'public' | 'private') => void;
  sessions?: CampaignData['sessions'];
  onCreateClick: () => void;
  campaignId: string;
  filterTags: string[];
  onFilterTagsChange: (tags: string[]) => void;
  searchPlaceholder?: string;
  showSessionFilter?: boolean;
}
```

Update the function signature to destructure `showSessionFilter` with default `true`:

```typescript
export function WikiFilterBar({
  search,
  onSearchChange,
  sessionId,
  onSessionChange,
  visibility,
  onVisibilityChange,
  sessions,
  onCreateClick,
  campaignId,
  filterTags,
  onFilterTagsChange,
  searchPlaceholder = 'Search...',
  showSessionFilter = true,
}: WikiFilterBarProps) {
```

Wrap the session select in a conditional — replace the existing `<div className="flex gap-2">` block with:

```tsx
<div className="flex gap-2">
  {showSessionFilter && sessions && onSessionChange && (
    <div className="flex-1">
      <label htmlFor="wiki-session-filter" className="sr-only">
        Filter by session
      </label>
      <select
        id="wiki-session-filter"
        value={sessionId ?? ''}
        onChange={(e) => onSessionChange(e.target.value)}
        className="w-full bg-[#080A12] border border-white/[0.07] rounded px-2 py-1.5 font-sans font-semibold text-[11px] text-slate-300 outline-none focus:border-blue-500/50 transition-colors"
      >
        <option value="">All Sessions</option>
        <option value="__none__">No Session</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            Session {session.number}: {session.name}
          </option>
        ))}
      </select>
    </div>
  )}

  <div className={showSessionFilter && sessions && onSessionChange ? 'w-32' : 'flex-1'}>
    <label htmlFor="wiki-visibility-filter" className="sr-only">
      Filter by visibility
    </label>
    <select
      id="wiki-visibility-filter"
      value={visibility}
      onChange={(e) => onVisibilityChange(e.target.value as 'all' | 'public' | 'private')}
      className="w-full bg-[#080A12] border border-white/[0.07] rounded px-2 py-1.5 font-sans font-semibold text-[11px] text-slate-300 outline-none focus:border-blue-500/50 transition-colors"
    >
      <option value="all">All</option>
      <option value="public">Public Only</option>
      <option value="private">Private Only</option>
    </select>
  </div>
</div>
```

- [ ] **Step 2: Verify CharactersPanel still works**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors — CharactersPanel still passes all required props and the defaults make it backward-compatible.

- [ ] **Step 3: Commit**

```bash
git add app/components/wiki/shared/WikiFilterBar.tsx
git commit -m "feat(wiki): make session filter optional in WikiFilterBar"
```

---

### Task 6: RuleCard Component

**Files:**

- Create: `app/components/wiki/rules/RuleCard.tsx`

- [ ] **Step 1: Create RuleCard component**

Create `app/components/wiki/rules/RuleCard.tsx`:

```tsx
import { Globe, Lock } from 'lucide-react';
import type { RuleListItem } from '~/types/rule';

interface RuleCardProps {
  rule: RuleListItem;
  onClick: (rule: RuleListItem) => void;
}

export function RuleCard({ rule, onClick }: RuleCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData(
          'application/x-cartyx-document',
          JSON.stringify({
            collection: 'rule',
            documentId: rule.id,
            title: rule.title,
          })
        );
        e.dataTransfer.effectAllowed = 'copy';
        e.currentTarget.style.opacity = '0.4';
      }}
      onDragEnd={(e) => {
        e.currentTarget.style.opacity = '';
      }}
      onClick={() => onClick(rule)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(rule);
        }
      }}
      className="flex items-start gap-3 px-4 py-3 border-b border-white/[0.05] hover:bg-white/[0.03] transition-colors group cursor-grab active:cursor-grabbing"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-slate-200 group-hover:text-blue-400 transition-colors truncate">
            {rule.title}
          </span>
          {rule.isPublic ? (
            <Globe className="h-3.5 w-3.5 text-emerald-500 shrink-0" aria-label="Public" />
          ) : (
            <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-label="Private" />
          )}
        </div>

        {rule.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {rule.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/wiki/rules/RuleCard.tsx
git commit -m "feat(rules): add RuleCard component with drag support"
```

---

### Task 7: RuleModal (Editor)

**Files:**

- Create: `app/components/wiki/rules/RuleModal.tsx`

- [ ] **Step 1: Create RuleModal component**

Create `app/components/wiki/rules/RuleModal.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Globe, Lock } from 'lucide-react';
import { FormInput } from '~/components/FormInput';
import { PixelButton } from '~/components/PixelButton';
import { MarkdownEditor } from '~/components/shared/MarkdownEditor';
import { useCreateRule, useUpdateRule, useDeleteRule, useRule } from '~/hooks/useRules';
import { TagAutocompleteInput } from '~/components/shared/TagAutocompleteInput';

interface RuleModalProps {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
  ruleId?: string;
}

interface FieldErrors {
  title?: string;
  content?: string;
}

export function RuleModal({ isOpen, onClose, campaignId, ruleId }: RuleModalProps) {
  const { rule: fetchedRule, isLoading: isFetchingRule } = useRule(ruleId ?? '', campaignId);
  const { create, isLoading: isCreating } = useCreateRule();
  const { update, isLoading: isUpdating } = useUpdateRule();
  const { remove, isLoading: isDeleting } = useDeleteRule();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Reset form when switching ruleId or opening the modal
  useEffect(() => {
    setTitle('');
    setContent('');
    setTags([]);
    setIsPublic(false);
    setError(null);
    setFieldErrors({});
    setHasSubmitted(false);
    setShowDeleteConfirm(false);
  }, [ruleId, isOpen]);

  // Populate form once the fetched rule resolves in edit mode
  useEffect(() => {
    if (ruleId && fetchedRule) {
      setTitle(fetchedRule.title);
      setContent(fetchedRule.content);
      setTags(fetchedRule.tags);
      setIsPublic(fetchedRule.isPublic);
    }
  }, [ruleId, fetchedRule]);

  const validate = useCallback((): FieldErrors => {
    const errors: FieldErrors = {};
    if (!title.trim()) errors.title = 'Title is required';
    if (!content.trim()) errors.content = 'Rule content is required';
    return errors;
  }, [title, content]);

  useEffect(() => {
    if (hasSubmitted) {
      setFieldErrors(validate());
    }
  }, [hasSubmitted, validate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    setError(null);

    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const input = {
      campaignId,
      title: title.trim(),
      content: content.trim(),
      tags,
      isPublic,
    };

    let success = false;
    if (ruleId) {
      const result = await update({ ...input, id: ruleId });
      success = !!result;
    } else {
      const result = await create(input);
      success = !!result;
    }

    if (success) {
      onClose();
    } else {
      setError('Failed to save rule. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!ruleId) return;
    setError(null);
    const result = await remove({ id: ruleId, campaignId });
    if (result) {
      onClose();
    } else {
      setError('Failed to delete rule. Please try again.');
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) return null;

  const isLoadingRule = !!(ruleId && isFetchingRule);
  const isSaving = isCreating || isUpdating;
  const isDisabled = isLoadingRule || isSaving || isDeleting;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-modal-title"
        className="w-full h-full max-w-[90vw] max-h-[90vh] sm:max-w-[90vw] sm:max-h-[90vh] bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
          <h2
            id="rule-modal-title"
            className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest"
          >
            {ruleId ? 'Edit Rule' : 'Create Rule'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 min-h-0">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <FormInput
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Critical Hit Rules"
            disabled={isDisabled}
            error={fieldErrors.title}
          />

          <MarkdownEditor
            label="Rule Content"
            value={content}
            onChange={setContent}
            placeholder="Write the rule details in markdown..."
            disabled={isDisabled}
            error={fieldErrors.content}
            minHeight="16rem"
            id="rule-modal-editor"
          />

          {/* Tags */}
          <div>
            <label
              htmlFor="rule-tags-input"
              className="block text-xs font-semibold text-slate-400 mb-2 tracking-wide"
            >
              Tags
            </label>
            <TagAutocompleteInput
              campaignId={campaignId}
              selectedTags={tags}
              onTagsChange={setTags}
              placeholder="Type a tag and press Enter"
              disabled={isDisabled}
              id="rule-tags-input"
            />
            <p className="text-xs text-slate-700 mt-1.5">
              Press Enter or comma to add. Suggestions appear as you type.
            </p>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="rule-visibility"
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                className="sr-only"
                disabled={isDisabled}
              />
              <div
                className={`h-10 px-4 rounded-xl border flex items-center gap-2.5 transition-all ${
                  !isPublic
                    ? 'bg-blue-600/10 border-blue-500/50 text-blue-300 shadow-sm shadow-blue-500/10'
                    : 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:border-white/20'
                }`}
              >
                <Lock className="h-3.5 w-3.5" />
                <span className="font-sans font-bold text-xs">Private</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="rule-visibility"
                checked={isPublic}
                onChange={() => setIsPublic(true)}
                className="sr-only"
                disabled={isDisabled}
              />
              <div
                className={`h-10 px-4 rounded-xl border flex items-center gap-2.5 transition-all ${
                  isPublic
                    ? 'bg-emerald-600/10 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/10'
                    : 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:border-white/20'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="font-sans font-bold text-xs">Public</span>
              </div>
            </label>
          </div>
        </div>

        <footer className="flex items-center justify-between px-4 sm:px-6 py-4 border-t border-white/[0.07] bg-white/[0.01] shrink-0">
          <div>
            {ruleId && !showDeleteConfirm && (
              <PixelButton
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDisabled}
                type="button"
              >
                <span className="text-rose-400">Delete</span>
              </PixelButton>
            )}
            {ruleId && showDeleteConfirm && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-400 font-semibold">Delete this rule?</span>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  type="button"
                >
                  <span className="text-rose-400">
                    {isDeleting ? 'Deleting...' : 'Yes, delete'}
                  </span>
                </PixelButton>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  type="button"
                >
                  Cancel
                </PixelButton>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <PixelButton
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={isSaving || isDeleting}
              type="button"
            >
              Cancel
            </PixelButton>
            <PixelButton variant="primary" size="sm" disabled={isDisabled} type="submit">
              {isSaving
                ? 'Saving...'
                : isLoadingRule
                  ? 'Loading...'
                  : ruleId
                    ? 'Update Rule'
                    : 'Create Rule'}
            </PixelButton>
          </div>
        </footer>
      </form>
    </div>,
    document.body
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/components/wiki/rules/RuleModal.tsx
git commit -m "feat(rules): add RuleModal editor component"
```

---

### Task 8: RuleViewModal & RuleWindow

**Files:**

- Create: `app/components/wiki/rules/RuleWindow.tsx`
- Create: `app/components/wiki/rules/RuleViewModal.tsx`

- [ ] **Step 1: Create RuleWindow component**

Create `app/components/wiki/rules/RuleWindow.tsx`:

```tsx
import { Globe, Lock } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { RuleData } from '~/types/rule';
import { MARKDOWN_PROSE_CLASSES } from '~/utils/markdownProseClasses';

interface RuleWindowProps {
  rule: RuleData;
}

export function RuleWindow({ rule }: RuleWindowProps) {
  return (
    <div className="flex flex-col gap-4 p-4 overflow-auto h-full">
      {/* Title */}
      <h2 className="text-sm font-bold text-slate-200">{rule.title}</h2>

      {/* Visibility badge */}
      <div className="flex">
        {rule.isPublic ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
            <Globe className="h-3 w-3" />
            Public
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold">
            <Lock className="h-3 w-3" />
            Private
          </span>
        )}
      </div>

      {/* Tags */}
      {rule.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rule.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-sans font-bold text-[9px] tracking-tight"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Rendered markdown content */}
      <div className={MARKDOWN_PROSE_CLASSES}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{rule.content}</ReactMarkdown>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create RuleViewModal component**

Create `app/components/wiki/rules/RuleViewModal.tsx`:

```tsx
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { RuleWindow } from './RuleWindow';
import { useRule } from '~/hooks/useRules';

interface RuleViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  ruleId: string;
  campaignId: string;
}

export function RuleViewModal({ isOpen, onClose, ruleId, campaignId }: RuleViewModalProps) {
  const { rule, isLoading } = useRule(ruleId, campaignId);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-view-modal-title"
        className="w-full max-w-lg max-h-[90vh] bg-[#0D1117] border border-white/[0.07] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/[0.07] shrink-0">
          <h2
            id="rule-view-modal-title"
            className="font-sans font-bold text-sm text-blue-400 uppercase tracking-widest"
          >
            Rule
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-slate-500 animate-pulse">Loading rule...</p>
            </div>
          ) : rule ? (
            <RuleWindow rule={rule} />
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-slate-500">Rule not found</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/components/wiki/rules/RuleWindow.tsx app/components/wiki/rules/RuleViewModal.tsx
git commit -m "feat(rules): add RuleWindow and RuleViewModal components"
```

---

### Task 9: RulesPanel & Wiki Integration

**Files:**

- Create: `app/components/wiki/rules/RulesPanel.tsx`
- Modify: `app/components/wiki/WikiPanel.tsx`

- [ ] **Step 1: Create RulesPanel component**

Create `app/components/wiki/rules/RulesPanel.tsx`:

```tsx
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { ScrollText } from 'lucide-react';
import { WikiCategoryHeader } from '~/components/wiki/shared/WikiCategoryHeader';
import { WikiFilterBar } from '~/components/wiki/shared/WikiFilterBar';
import { RuleCard } from './RuleCard';
import { RuleModal } from './RuleModal';
import { RuleViewModal } from './RuleViewModal';
import { useRules } from '~/hooks/useRules';
import { useCampaign } from '~/hooks/useCampaigns';
import type { RuleListItem } from '~/types/rule';

interface RulesPanelProps {
  onBack: () => void;
}

export function RulesPanel({ onBack }: RulesPanelProps) {
  const { campaignId } = useParams({ from: '/campaigns/$campaignId/play' });
  const { campaign } = useCampaign(campaignId);
  const isGM = campaign?.isGM ?? false;

  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | undefined>();
  const [viewRuleId, setViewRuleId] = useState<string | undefined>();

  const { rules, isLoading, error } = useRules(campaignId, {
    search: search || undefined,
    visibility,
    tags: filterTags.length > 0 ? filterTags : undefined,
  });

  const handleCreateClick = () => {
    setSelectedRuleId(undefined);
    setIsModalOpen(true);
  };

  const handleRuleClick = (rule: RuleListItem) => {
    if (isGM) {
      setSelectedRuleId(rule.id);
      setIsModalOpen(true);
    } else {
      setViewRuleId(rule.id);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedRuleId(undefined);
  };

  const handleViewModalClose = () => {
    setViewRuleId(undefined);
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#080A12]">
      <WikiCategoryHeader title="Rules" onBack={onBack} />
      <WikiFilterBar
        search={search}
        onSearchChange={setSearch}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        onCreateClick={handleCreateClick}
        campaignId={campaignId}
        filterTags={filterTags}
        onFilterTagsChange={setFilterTags}
        searchPlaceholder="Search rules..."
        showSessionFilter={false}
      />

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="font-sans font-semibold text-xs text-slate-500 animate-pulse">
            Loading rules...
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="font-sans font-semibold text-xs text-rose-400">{error}</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="h-12 w-12 rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
            <ScrollText className="h-6 w-6 text-slate-600" />
          </div>
          <p className="font-sans font-semibold text-xs text-slate-500">
            No rules found matching your filters.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="flex flex-col">
            {rules.map((rule) => (
              <RuleCard key={rule.id} rule={rule} onClick={handleRuleClick} />
            ))}
          </div>
        </div>
      )}

      {isGM && (
        <RuleModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          campaignId={campaignId}
          ruleId={selectedRuleId}
        />
      )}
      {viewRuleId && (
        <RuleViewModal
          isOpen={!!viewRuleId}
          onClose={handleViewModalClose}
          ruleId={viewRuleId}
          campaignId={campaignId}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add Rules category to WikiPanel**

In `app/components/wiki/WikiPanel.tsx`:

1. Add imports at the top:

```typescript
import { Users, ScrollText } from 'lucide-react';
import { CharactersPanel } from './characters/CharactersPanel';
import { RulesPanel } from './rules/RulesPanel';
```

2. Update the type and categories array:

```typescript
type WikiCategoryId = 'characters' | 'rules';

const WIKI_CATEGORIES: WikiCategory[] = [
  { id: 'characters', label: 'Characters', icon: Users },
  { id: 'rules', label: 'Rules', icon: ScrollText },
];
```

3. Add the rules panel rendering in the conditional block. After the `selectedCategory === 'characters'` branch, add:

```typescript
      ) : selectedCategory === 'rules' ? (
        <RulesPanel onBack={() => setSelectedCategory(null)} />
```

- [ ] **Step 3: Verify the app compiles**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/components/wiki/rules/RulesPanel.tsx app/components/wiki/WikiPanel.tsx
git commit -m "feat(rules): add RulesPanel and integrate into WikiPanel"
```

---

### Task 10: GM Screen Integration

**Files:**

- Create: `app/components/mainview/gmscreens/RuleWindowWrapper.tsx`
- Modify: `app/server/functions/gmscreens.ts`
- Modify: `app/components/mainview/gmscreens/GMScreensView.tsx`

- [ ] **Step 1: Add rule to COLLECTION_REGISTRY**

In `app/server/functions/gmscreens.ts`:

1. Add import at the top (after the Character import on line 8):

```typescript
import { Rule } from '../db/models/Rule';
```

2. Add `rule` entry to `COLLECTION_REGISTRY` (after the `character` entry, before the closing `};` on line 154):

```typescript
  rule: {
    async fetch(ids: string[], campaignId: string) {
      return Rule.find({ _id: { $in: ids }, campaignId }, '_id title content')
        .lean()
        .then((docs) =>
          docs.map((d) => ({
            _id: d._id,
            title: (d as { title?: string }).title,
            content: (d as { content?: string }).content,
          }))
        ) as Promise<Array<{ _id: unknown; title?: string; content?: string }>>;
    },
  },
```

- [ ] **Step 2: Create RuleWindowWrapper**

Create `app/components/mainview/gmscreens/RuleWindowWrapper.tsx`:

```tsx
import { Pencil } from 'lucide-react';
import { RuleWindow } from '~/components/wiki/rules/RuleWindow';
import { RuleModal } from '~/components/wiki/rules/RuleModal';
import { useRule } from '~/hooks/useRules';

export function EditRuleModalWrapper({
  campaignId,
  ruleId,
  onClose,
}: {
  campaignId: string;
  ruleId: string;
  onClose: () => void;
}) {
  return <RuleModal isOpen onClose={onClose} campaignId={campaignId} ruleId={ruleId} />;
}

export function RuleWindowWrapper({
  ruleId,
  campaignId,
  isGM,
  onEdit,
}: {
  ruleId: string;
  campaignId: string;
  isGM: boolean;
  onEdit: () => void;
}) {
  const { rule, isLoading } = useRule(ruleId, campaignId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500 animate-pulse">Loading rule...</p>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-slate-500">Rule not found</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      {isGM && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-2 right-2 z-10 p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors"
          aria-label="Edit rule"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <RuleWindow rule={rule} />
    </div>
  );
}
```

- [ ] **Step 3: Update GMScreensView to handle rule windows**

In `app/components/mainview/gmscreens/GMScreensView.tsx`:

1. Add import for RuleWindowWrapper (near the CharacterWindowWrapper import on line 13):

```typescript
import { RuleWindowWrapper, EditRuleModalWrapper } from './RuleWindowWrapper';
```

2. Add state for editing rule ID (near `editingCharacterId` state on line 42):

```typescript
const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
```

3. In the window content rendering block (around line 390-408), update the conditional to handle rules. Replace the `if (w.collection === 'character') { ... } else { ... }` block with:

```typescript
        if (w.collection === 'character') {
          windowContent = (
            <CharacterWindowWrapper
              characterId={w.documentId}
              campaignId={campaignId}
              onEdit={() => setEditingCharacterId(w.documentId)}
            />
          );
        } else if (w.collection === 'rule') {
          windowContent = (
            <RuleWindowWrapper
              ruleId={w.documentId}
              campaignId={campaignId}
              isGM={campaign?.isGM ?? false}
              onEdit={() => setEditingRuleId(w.documentId)}
            />
          );
        } else {
          windowContent = (
            <div className="p-4 overflow-auto h-full">
              <div className={MARKDOWN_PROSE_CLASSES}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown>
              </div>
            </div>
          );
        }
```

4. Add the edit rule modal at the bottom of the return JSX (after the `editingCharacterId` block around line 613-619):

```tsx
{
  editingRuleId !== null && (
    <EditRuleModalWrapper
      campaignId={campaignId}
      ruleId={editingRuleId}
      onClose={() => setEditingRuleId(null)}
    />
  );
}
```

- [ ] **Step 4: Verify `campaign` is accessible in the window rendering scope**

The GMScreensView component already has access to `campaign` via its props or hooks. Verify by checking the existing code. If `campaign` is not available in scope, use `useCampaign(campaignId)` to get it. The `isGM` flag is needed for the `RuleWindowWrapper`.

Check: Look at the component's existing imports and props for `campaign` — it's passed as a prop or available via hook. The code at line 40 references `campaign?.isGM` check in play.tsx so the value flows through.

Run: `npx tsc --noEmit 2>&1 | head -30`

If `campaign` is not in scope, add:

```typescript
import { useCampaign } from '~/hooks/useCampaigns';
```

And in the component body:

```typescript
const { campaign } = useCampaign(campaignId);
```

- [ ] **Step 5: Commit**

```bash
git add app/server/functions/gmscreens.ts app/components/mainview/gmscreens/RuleWindowWrapper.tsx app/components/mainview/gmscreens/GMScreensView.tsx
git commit -m "feat(rules): integrate rules into GM screen with edit support"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Lint check**

Run: `npx eslint app/types/rule.ts app/types/schemas/rules.ts app/server/db/models/Rule.ts app/server/functions/rules.ts app/hooks/useRules.ts app/components/wiki/rules/ app/components/mainview/gmscreens/RuleWindowWrapper.tsx --fix`
Expected: No errors (or auto-fixed)

- [ ] **Step 3: Dev server smoke test**

Run: `npm run dev`
Expected: App starts without errors. Navigate to a campaign, open the Wiki panel, and verify "Rules" appears as a category.

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore(rules): lint fixes"
```
