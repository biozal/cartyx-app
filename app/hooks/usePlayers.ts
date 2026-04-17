import { createServerFn } from '@tanstack/react-start';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { PlayerData, PlayerListItem } from '~/types/player';
import { captureException } from '~/providers/PostHogProvider';
import { queryKeys } from '~/utils/queryKeys';
import {
  listPlayersSchema,
  getPlayerSchema,
  updatePlayerSchema,
  deletePlayerSchema,
  updatePlayerStatusSchema,
  playerRelationshipSchema,
  removePlayerRelationshipSchema,
  validateInviteCodeSchema,
  completeJoinWizardSchema,
} from '~/types/schemas/players';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return String(error);
}

// ---------------------------------------------------------------------------
// Server function wrappers — dynamic imports keep Mongoose server-only.
// TanStack Start compiles these to RPC stubs on the client.
// ---------------------------------------------------------------------------

const listPlayersFn = createServerFn({ method: 'GET' })
  .inputValidator(listPlayersSchema)
  .handler(async ({ data }) => {
    const { listPlayers } = await import('~/server/functions/players');
    return listPlayers({ data });
  });

const getPlayerFn = createServerFn({ method: 'GET' })
  .inputValidator(getPlayerSchema)
  .handler(async ({ data }) => {
    const { getPlayer } = await import('~/server/functions/players');
    return getPlayer({ data });
  });

const updatePlayerFn = createServerFn({ method: 'POST' })
  .inputValidator(updatePlayerSchema)
  .handler(async ({ data }) => {
    const { updatePlayer } = await import('~/server/functions/players');
    return updatePlayer({ data });
  });

const deletePlayerFn = createServerFn({ method: 'POST' })
  .inputValidator(deletePlayerSchema)
  .handler(async ({ data }) => {
    const { deletePlayer } = await import('~/server/functions/players');
    return deletePlayer({ data });
  });

const updatePlayerStatusFn = createServerFn({ method: 'POST' })
  .inputValidator(updatePlayerStatusSchema)
  .handler(async ({ data }) => {
    const { updatePlayerStatus } = await import('~/server/functions/players');
    return updatePlayerStatus({ data });
  });

const addPlayerRelationshipFn = createServerFn({ method: 'POST' })
  .inputValidator(playerRelationshipSchema)
  .handler(async ({ data }) => {
    const { addPlayerRelationship } = await import('~/server/functions/players');
    return addPlayerRelationship({ data });
  });

const updatePlayerRelationshipFn = createServerFn({ method: 'POST' })
  .inputValidator(playerRelationshipSchema)
  .handler(async ({ data }) => {
    const { updatePlayerRelationship } = await import('~/server/functions/players');
    return updatePlayerRelationship({ data });
  });

const removePlayerRelationshipFn = createServerFn({ method: 'POST' })
  .inputValidator(removePlayerRelationshipSchema)
  .handler(async ({ data }) => {
    const { removePlayerRelationship } = await import('~/server/functions/players');
    return removePlayerRelationship({ data });
  });

const validateInviteCodeFn = createServerFn({ method: 'POST' })
  .inputValidator(validateInviteCodeSchema)
  .handler(async ({ data }) => {
    const { validateInviteCode } = await import('~/server/functions/players');
    return validateInviteCode({ data });
  });

const completeJoinWizardFn = createServerFn({ method: 'POST' })
  .inputValidator(completeJoinWizardSchema)
  .handler(async ({ data }) => {
    const { completeJoinWizard } = await import('~/server/functions/players');
    return completeJoinWizard({ data });
  });

const getActivePlayerSchema = z.object({
  campaignId: z.string().min(1),
});

const getActivePlayerFn = createServerFn({ method: 'GET' })
  .inputValidator(getActivePlayerSchema)
  .handler(async ({ data }) => {
    const { getActivePlayer } = await import('~/server/functions/players');
    return getActivePlayer({ data });
  });

// ---------------------------------------------------------------------------
// Query Hooks
// ---------------------------------------------------------------------------

export function usePlayers(campaignId: string, search?: string) {
  const {
    data: players = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.players.list(campaignId, search),
    queryFn: () =>
      listPlayersFn({
        data: {
          campaignId,
          search,
        },
      }),
    enabled: !!campaignId,
  });

  return {
    players: players as PlayerListItem[],
    isLoading,
    error: extractErrorMessage(error),
  };
}

export function usePlayer(id: string, campaignId: string) {
  const {
    data: player = null,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.players.detail(id, campaignId),
    queryFn: () => getPlayerFn({ data: { id, campaignId } }),
    enabled: !!id && !!campaignId,
  });

  return {
    player: player as PlayerData | null,
    isLoading,
    error: extractErrorMessage(error),
  };
}

export function useActivePlayer(campaignId: string) {
  const {
    data: player = null,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.players.active(campaignId),
    queryFn: () => getActivePlayerFn({ data: { campaignId } }),
    enabled: !!campaignId,
  });

  return {
    player: player as PlayerData | null,
    isLoading,
    error: extractErrorMessage(error),
  };
}

// ---------------------------------------------------------------------------
// Mutation Hooks
// ---------------------------------------------------------------------------

interface UpdatePlayerInput {
  id: string;
  campaignId: string;
  firstName: string;
  lastName: string;
  race: string;
  characterClass: string;
  age: number;
  gender?: string;
  location?: string;
  link?: string;
  picture?: string;
  pictureCrop?: { x: number; y: number; width: number; height: number } | null;
  description?: string;
  backstory?: string;
  gmNotes?: string;
  color?: string;
  eyeColor?: string;
  hairColor?: string;
  weight?: number | null;
  height?: string;
  size?: string;
  appearance?: string;
}

export function useUpdatePlayer() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: UpdatePlayerInput) => updatePlayerFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['players', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.detail(variables.id, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.active(variables.campaignId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all });
    },
    onError: (e, variables) => {
      captureException(e, { action: 'updatePlayer', playerId: variables.id });
    },
  });

  const update = async (input: UpdatePlayerInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    update,
    isLoading: mutation.isPending,
    error: extractErrorMessage(mutation.error),
  };
}

interface DeletePlayerInput {
  id: string;
  campaignId: string;
}

export function useDeletePlayer() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: DeletePlayerInput) => deletePlayerFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['players', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.removeQueries({
        queryKey: queryKeys.players.detail(variables.id, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.active(variables.campaignId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.gmscreens.all });
    },
    onError: (e, variables) => {
      captureException(e, { action: 'deletePlayer', playerId: variables.id });
    },
  });

  const remove = async (input: DeletePlayerInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    remove,
    isLoading: mutation.isPending,
    error: extractErrorMessage(mutation.error),
  };
}

interface UpdatePlayerStatusInput {
  id: string;
  campaignId: string;
  value: 'alive' | 'deceased';
}

export function useUpdatePlayerStatus() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: UpdatePlayerStatusInput) => updatePlayerStatusFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['players', 'list', variables.campaignId],
        exact: false,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.detail(variables.id, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.active(variables.campaignId),
      });
    },
    onError: (e, variables) => {
      captureException(e, { action: 'updatePlayerStatus', playerId: variables.id });
    },
  });

  const updateStatus = async (input: UpdatePlayerStatusInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    updateStatus,
    isLoading: mutation.isPending,
    error: extractErrorMessage(mutation.error),
  };
}

interface AddPlayerRelationshipInput {
  playerId: string;
  campaignId: string;
  characterId: string;
  descriptor: string;
  isPublic?: boolean;
}

export function useAddPlayerRelationship() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: AddPlayerRelationshipInput) =>
      addPlayerRelationshipFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.detail(variables.playerId, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.active(variables.campaignId),
      });
    },
    onError: (e, variables) => {
      captureException(e, {
        action: 'addPlayerRelationship',
        playerId: variables.playerId,
      });
    },
  });

  const addRelationship = async (input: AddPlayerRelationshipInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    addRelationship,
    isLoading: mutation.isPending,
    error: extractErrorMessage(mutation.error),
  };
}

interface UpdatePlayerRelationshipInput {
  playerId: string;
  campaignId: string;
  characterId: string;
  descriptor: string;
  isPublic?: boolean;
}

export function useUpdatePlayerRelationship() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: UpdatePlayerRelationshipInput) =>
      updatePlayerRelationshipFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.detail(variables.playerId, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.active(variables.campaignId),
      });
    },
    onError: (e, variables) => {
      captureException(e, {
        action: 'updatePlayerRelationship',
        playerId: variables.playerId,
      });
    },
  });

  const updateRelationship = async (input: UpdatePlayerRelationshipInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    updateRelationship,
    isLoading: mutation.isPending,
    error: extractErrorMessage(mutation.error),
  };
}

interface RemovePlayerRelationshipInput {
  playerId: string;
  campaignId: string;
  characterId: string;
}

export function useRemovePlayerRelationship() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: RemovePlayerRelationshipInput) =>
      removePlayerRelationshipFn({ data: input }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.detail(variables.playerId, variables.campaignId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.players.active(variables.campaignId),
      });
    },
    onError: (e, variables) => {
      captureException(e, {
        action: 'removePlayerRelationship',
        playerId: variables.playerId,
      });
    },
  });

  const removeRelationship = async (input: RemovePlayerRelationshipInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    removeRelationship,
    isLoading: mutation.isPending,
    error: extractErrorMessage(mutation.error),
  };
}

interface ValidateInviteCodeInput {
  inviteCode: string;
}

export function useValidateInviteCode() {
  const mutation = useMutation({
    mutationFn: async (input: ValidateInviteCodeInput) => validateInviteCodeFn({ data: input }),
    onError: (e) => {
      captureException(e, { action: 'validateInviteCode' });
    },
  });

  const validate = async (input: ValidateInviteCodeInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    validate,
    isLoading: mutation.isPending,
    error: extractErrorMessage(mutation.error),
  };
}

interface CompleteJoinWizardInput {
  campaignId: string;
  player: {
    firstName: string;
    lastName: string;
    race: string;
    characterClass: string;
    age: number;
    gender?: string;
    location?: string;
    link?: string;
    picture?: string;
    pictureCrop?: { x: number; y: number; width: number; height: number } | null;
    description?: string;
    backstory?: string;
    color?: string;
    eyeColor?: string;
    hairColor?: string;
    weight?: number | null;
    height?: string;
    size?: string;
    appearance?: string;
  };
  characters?: Array<{
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
    relationship: {
      descriptor: string;
      isPublic?: boolean;
    };
  }>;
}

export function useCompleteJoinWizard() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: CompleteJoinWizardInput) => completeJoinWizardFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.list() });
    },
    onError: (e) => {
      captureException(e, { action: 'completeJoinWizard' });
    },
  });

  const complete = async (input: CompleteJoinWizardInput) => {
    try {
      return await mutation.mutateAsync(input);
    } catch {
      return null;
    }
  };

  return {
    complete,
    isLoading: mutation.isPending,
    error: extractErrorMessage(mutation.error),
  };
}
