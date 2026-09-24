/**
 * Reopens one account whose provider revocation ended without a known outcome.
 *
 * A logout closes the account's row before asking the provider to withdraw the grant,
 * and reopens it when the provider answers. If nothing is ever learned — a timeout, a
 * response that never arrived — the row stays closed, because the alternative is
 * telling the user they logged out while leaving the account loginable. Only a person
 * who has checked the provider's own state can say what happened, which is what this
 * command records.
 *
 * Check first, then run:
 *   - Google: https://myaccount.google.com/permissions for the affected account.
 *   - GitHub: the account's authorized OAuth apps.
 *
 * Usage:
 *   npm run identity:resolve-revocation -- --user <id> --provider google|github|apple \
 *     --client <oauth client id> --outcome revoked|not-revoked
 *
 * `--outcome` is recorded in the operator's own log by being required here: both
 * outcomes reopen the row, because either way the uncertainty is gone. What differs is
 * what the operator should do next, which the command prints.
 */
import { createRevocationAdmission } from '../../app/server/repositories/identity/revocation-admission';
import { getStateStore } from '../../app/server/db/data-runtime';

const state = getStateStore();

function flag(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value?.trim() || value.startsWith('--'))
    throw new Error(`Missing --${name}. See the usage comment in this file.`);
  return value.trim();
}

const userId = flag('user');
const provider = flag('provider');
const clientId = flag('client');
const outcome = flag('outcome');
if (!['google', 'github', 'apple'].includes(provider)) throw new Error('Unknown provider');
if (!['revoked', 'not-revoked'].includes(outcome))
  throw new Error('--outcome must be revoked or not-revoked');

const admission = createRevocationAdmission(state, {
  provider: provider as 'google' | 'github' | 'apple',
  clientId,
});

const before = await admission.inspect(userId);
if (before.status !== 'blocked-unresolved')
  throw new Error(`Account is ${before.status}; only a stranded account can be resolved`);

await admission.resolve(userId);
const after = await admission.inspect(userId);
if (after.status !== 'open') throw new Error('The account did not reopen');

process.stdout.write(
  `Account ${userId} reopened after a ${outcome} revocation.\n` +
    (outcome === 'not-revoked'
      ? 'The grant is still live: the stored tokens were never cleared, so the next logout will try again.\n'
      : 'The grant is gone: the next login will mint a fresh one.\n')
);

// The driver holds the event loop open, so say so explicitly rather than appearing to hang.
await state.close();
