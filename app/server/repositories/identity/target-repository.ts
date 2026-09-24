import { createTargetIdentityLogin } from './target-login';
import { createTargetIdentityReader } from './target-reader';
import { createTargetIdentitySettings } from './target-settings';
import { createTargetIdentityTokens } from './target-tokens';
import type { ImmutableProfileStore } from './profile-model';
import type { ReservationStateStore } from './reservations';
import type { IdentityRepository } from './types';

/**
 * Assembles the graph and control-state facets into the one interface the application
 * uses. It holds no logic of its own: each facet keeps its own contract, and this file
 * exists so that no caller has to know which store answers which question.
 */
export function createTargetIdentityRepository(
  state: ReservationStateStore,
  graph: ImmutableProfileStore
): IdentityRepository {
  return {
    ...createTargetIdentityReader(state, graph),
    ...createTargetIdentityLogin(state, graph),
    ...createTargetIdentitySettings(state, graph),
    ...createTargetIdentityTokens(state),
  };
}
