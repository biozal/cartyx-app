import type { ClientSession } from 'mongoose';
import { User } from '../../db/models/User';
import { createMongoMembershipMirror } from './mongo';

/**
 * Transitional Mongo-only binding for campaign creation's existing transaction.
 * A target identity cutover must replace this orchestration before activation.
 * It cannot silently write through a separately selected identity backend.
 */
export function membershipMirrorForMongoTransaction(session: ClientSession) {
  return createMongoMembershipMirror(User, session);
}
