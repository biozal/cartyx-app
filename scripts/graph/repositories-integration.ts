// Runs the repository contracts against real JanusGraph through the restricted
// application principal — the same store the running app uses. The in-memory store has
// diverged from the graph before; these prove each repository's guarantees on the real
// one. Every contract cleans up what it creates.
import { campaignsContract } from '../../tests/contracts/campaigns.contract';
import { closeData } from '../../app/server/db/data-runtime';

try {
  await campaignsContract();
  process.stdout.write(
    'PASS: campaigns — invite-code uniqueness, membership index, player limit under concurrent joins and removal against real JanusGraph\n'
  );
} finally {
  await closeData();
}
