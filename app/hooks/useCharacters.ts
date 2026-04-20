import { createServerFn } from '@tanstack/react-start';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CharacterData, CharacterListItem } from '~/types/character';
import { captureException } from '~/providers/PostHogProvider';
import { queryKeys } from '~/utils/queryKeys';
import {
  listCharactersSchema,
  getCharacterSchema,
  createCharacterSchema,
  updateCharacterSchema,
  deleteCharacterSchema,
  updateCharacterStatusSchema,
  addCharacterRelationshipSchema,
  updateCharacterRelationshipSchema,
  removeCharacterRelationshipSchema,
} from '~/types/schemas/characters';

// ---------------------------------------------------------------------------
// Server function wrappers — dynamic imports keep Mongoose server-only.
// TanStack Start compiles these to RPC stubs on the client.
// ---------------------------------------------------------------------------

const listCharactersFn = createServerFn({ method: 'GET' })
  .inputValidator(listCharactersSchema)
  .handler(async ({ data }) => {
    const { listCharacters } = await import('~/server/functions/characters');
    return listCharacters({ data });
  });

const getCharacterFn = createServerFn({ method: 'GET' })
  .inputValidator(getCharacterSchema)
  .handler(async ({ data }) => {
    const { getCharacter } = await import('~/server/functions/characters');
    return getCharacter({ data });
  });

const createCharacterFn = createServerFn({ method: 'POST' })
  .inputValidator(createCharacterSchema)
  .handler(async ({ data }) => {
    const { createCharacter } = await import('~/server/functions/characters');
    return createCharacter({ data });
  });

const updateCharacterFn = createServerFn({ method: 'POST' })
  .inputValidator(updateCharacterSchema)
  .handler(async ({ data }) => {
    const { updateCharacter } = await import('~/server/functions/characters');
    return updateCharacter({ data });
  });

const deleteCharacterFn = createServerFn({ method: 'POST' })
  .inputValidator(deleteCharacterSchema)
  .handler(async ({ data }) => {
    const { deleteCharacter } = await import('~/server/functions/characters');
    return deleteCharacter({ data });
  });

const updateCharacterStatusFn = createServerFn({ method: 'POST' })
  .inputValidator(updateCharacterStatusSchema)
  .handler(async ({ data }) => {
    const { updateCharacterStatus } = await import('~/server/functions/characters');
    return updateCharacterStatus({ data });
  });

const addCharacterRelationshipFn = createServerFn({ method: 'POST' })
  .inputValidator(addCharacterRelationshipSchema)
  .handler(async ({ data }) => {
    const { addCharacterRelationship } = await import('~/server/functions/characters');
    return addCharacterRelationship({ data });
  });

const updateCharacterRelationshipFn = createServerFn({ method: 'POST' })
  .inputValidator(updateCharacterRelationshipSchema)
  .handler(async ({ data }) => {
    const { updateCharacterRelationship } = await import('~/server/functions/characters');
    return updateCharacterRelationship({ data });
  });

const removeCharacterRelationshipFn = createServerFn({ method: 'POST' })
  .inputValidator(removeCharacterRelationshipSchema)
  .handler(async ({ data }) => {
    const { removeCharacterRelationship } = await import('~/server/functions/characters');
    return removeCharacterRelationship({ data });
  });

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

interface ListCharactersFilters {
  sessionId?: string;
  search?: string;
  visibility?: 'all' | 'public' | 'private';
  tags?: string[];
}

export function useCharacters(campaignId: string, filters?: ListCharactersFilters) {
  const sessionId = filters?.sessionId;
  const search = filters?.search;
  const visibility = filters?.visibility;
  const tags = filters?.tags;

  const {
    data: characters = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.characters.list(campaignId, sessionId, search, visibility, tags),
    queryFn: () =>
      listCharactersFn({
        data: {
          campaignId,
          sessionId,
          search,
          visibility,
          tags,
        },
      }),
    enabled: !!campaignId,
  });

  return {
    characters: characters as CharacterListItem[],
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  };
}

export function useCharacter(id: string, campaignId: string) {
  const {
    data: character = null,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.characters.detail(id, campaignId),
    queryFn: () => getCharacterFn({ data: { id, campaignId } }),
    enabled: !!id && !!campaignId,
  });

  return {
    character: character as CharacterData | null,
    isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
  };
}

interface CreateCharacterInput {
  campaignId: string;
  firstName: string;
  lastName: string;
  race?: string;
  characterClass?: string;
  age?: number | null;
  location?: string;
  link?: string;
  picture?: string;
  pictureCrop?: { x: number; y: number; width: number; height: number } | null;
  notes?: string;
  gmNotes?: string;
  tags?: string[];
  isPublic?: boolean;
  sessionId?: string;
  sessions?: string[];
}

export function useCreateCharacter() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: CreateCharacterInput) => createCharacterFn({ data: input }),
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: ['characters', 'list', campaignId], exact: false });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.list(campaignId) });
    },
    onError: (e) => {
      captureException(e, { action: 'createCharacter' });
    },
  });

  const create = async (input: CreateCharacterInput) => {
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

interface UpdateCharacterInput {
  id: string;
  campaignId: string;
  firstName: string;
  lastName: string;
  race?: string;
  characterClass?: string;
  age?: number | null;
  location?: string;
  link?: string;
  picture?: string;
  pictureCrop?: { x: number; y: number; width: number; height: number } | null;
  notes?: string;
  gmNotes?: string;
  tags?: string[];
  isPublic?: boolean;
  sessionId?: string;
  sessions?: string[];
}

export function useUpdateCharacter() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: UpdateCharacterInput) => updateCharacterFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['characters', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(variables.id, variables.campaignId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tags.list(variables.campaignId) });
      // Refresh GM screen windows that may display this character's content
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all });
    },
    onError: (e, variables) => {
      captureException(e, { action: 'updateCharacter', characterId: variables.id });
    },
  });

  const update = async (input: UpdateCharacterInput) => {
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

interface DeleteCharacterInput {
  id: string;
  campaignId: string;
}

export function useDeleteCharacter() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: DeleteCharacterInput) => deleteCharacterFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['characters', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.removeQueries({
        queryKey: queryKeys.characters.detail(variables.id, variables.campaignId),
      });
      // Refresh GM screen windows — server removes refs for deleted characters
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all });
    },
    onError: (e, variables) => {
      captureException(e, { action: 'deleteCharacter', characterId: variables.id });
    },
  });

  const remove = async (input: DeleteCharacterInput) => {
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

// ---------------------------------------------------------------------------
// useUpdateCharacterStatus
// ---------------------------------------------------------------------------

interface UpdateCharacterStatusInput {
  id: string;
  campaignId: string;
  value: 'alive' | 'deceased';
}

export function useUpdateCharacterStatus() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: UpdateCharacterStatusInput) =>
      updateCharacterStatusFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['characters', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(variables.id, variables.campaignId),
      });
    },
    onError: (e, variables) => {
      captureException(e, { action: 'updateCharacterStatus', characterId: variables.id });
    },
  });

  const updateStatus = async (input: UpdateCharacterStatusInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    updateStatus,
    isLoading: mutation.isPending,
    error:
      mutation.error instanceof Error
        ? mutation.error.message
        : mutation.error
          ? String(mutation.error)
          : null,
  };
}

// ---------------------------------------------------------------------------
// useAddCharacterRelationship
// ---------------------------------------------------------------------------

interface AddCharacterRelationshipInput {
  characterId: string;
  campaignId: string;
  targetCharacterId: string;
  descriptor: string;
  reciprocalDescriptor: string;
  isPublic?: boolean;
}

export function useAddCharacterRelationship() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: AddCharacterRelationshipInput) =>
      addCharacterRelationshipFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['characters', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(variables.characterId, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(variables.targetCharacterId, variables.campaignId),
      });
    },
    onError: (e, variables) => {
      captureException(e, {
        action: 'addCharacterRelationship',
        characterId: variables.characterId,
      });
    },
  });

  const addRelationship = async (input: AddCharacterRelationshipInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    addRelationship,
    isLoading: mutation.isPending,
    error:
      mutation.error instanceof Error
        ? mutation.error.message
        : mutation.error
          ? String(mutation.error)
          : null,
  };
}

// ---------------------------------------------------------------------------
// useUpdateCharacterRelationship
// ---------------------------------------------------------------------------

interface UpdateCharacterRelationshipInput {
  characterId: string;
  campaignId: string;
  targetCharacterId: string;
  descriptor?: string;
  reciprocalDescriptor?: string;
  isPublic?: boolean;
}

export function useUpdateCharacterRelationship() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: UpdateCharacterRelationshipInput) =>
      updateCharacterRelationshipFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['characters', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(variables.characterId, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(variables.targetCharacterId, variables.campaignId),
      });
    },
    onError: (e, variables) => {
      captureException(e, {
        action: 'updateCharacterRelationship',
        characterId: variables.characterId,
      });
    },
  });

  const updateRelationship = async (input: UpdateCharacterRelationshipInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    updateRelationship,
    isLoading: mutation.isPending,
    error:
      mutation.error instanceof Error
        ? mutation.error.message
        : mutation.error
          ? String(mutation.error)
          : null,
  };
}

// ---------------------------------------------------------------------------
// useRemoveCharacterRelationship
// ---------------------------------------------------------------------------

interface RemoveCharacterRelationshipInput {
  characterId: string;
  campaignId: string;
  targetCharacterId: string;
}

export function useRemoveCharacterRelationship() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: RemoveCharacterRelationshipInput) =>
      removeCharacterRelationshipFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['characters', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(variables.characterId, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.characters.detail(variables.targetCharacterId, variables.campaignId),
      });
    },
    onError: (e, variables) => {
      captureException(e, {
        action: 'removeCharacterRelationship',
        characterId: variables.characterId,
      });
    },
  });

  const removeRelationship = async (input: RemoveCharacterRelationshipInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    removeRelationship,
    isLoading: mutation.isPending,
    error:
      mutation.error instanceof Error
        ? mutation.error.message
        : mutation.error
          ? String(mutation.error)
          : null,
  };
}
