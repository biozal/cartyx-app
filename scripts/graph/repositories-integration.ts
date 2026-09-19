// Runs the repository contracts against real JanusGraph through the restricted
// application principal — the same store the running app uses. The in-memory store has
// diverged from the graph before; these prove each repository's guarantees on the real
// one. Every contract cleans up what it creates.
import { campaignsContract } from '../../tests/contracts/campaigns.contract';
import { uniqueKeysContract } from '../../tests/contracts/unique-keys.contract';
import { graphModelContract } from '../../tests/contracts/graph-model.contract';
import { closeData } from '../../app/server/db/data-runtime';

try {
  await uniqueKeysContract();
  process.stdout.write(
    'PASS: unique keys — duplicate refusal, concurrent inserts and renames, key release on rename and removal against real JanusGraph\n'
  );
  await graphModelContract();
  process.stdout.write(
    'PASS: graph model — MongoDB filters, updates, upserts, projections, saves and racing writers against real JanusGraph\n'
  );
  await campaignsContract();
  process.stdout.write(
    'PASS: campaigns — invite-code uniqueness, membership index, player limit under concurrent joins and removal against real JanusGraph\n'
  );
} finally {
  await closeData();
}
