// Operator tool. A reindex scan outruns a single bounded request, so it is started in
// one request and polled in later ones through JanusGraph's index job status.
import { readGraphConfig } from '../../app/server/db/graph/config';
import { submitGraphRequest } from '../../app/server/db/graph/transport';

const config = readGraphConfig();
if (config.username !== 'cartyx_admin') throw new Error('Reindex requires the operator credential');
const requested = process.argv.slice(2);
const POLL_INTERVAL_MS = 5_000;
const DEADLINE_MS = 30 * 60 * 1000;

const names: string[] = (await submitGraphRequest(
  config,
  `
  def m = graph.openManagement()
  try { return m.getGraphIndexes(Vertex.class).collect { it.name() } } finally { m.rollback() }
`
)) as string[];
const targets = requested.length ? requested.filter((name) => names.includes(name)) : names;
if (requested.length && targets.length !== requested.length)
  throw new Error(`Unknown index: ${requested.filter((name) => !names.includes(name)).join(', ')}`);

for (const name of targets) {
  const started = await submitGraphRequest(
    config,
    `
    import org.janusgraph.core.schema.SchemaAction
    def m = graph.openManagement()
    try {
      def index = m.getGraphIndex(name)
      if (index == null) throw new IllegalStateException('Unknown index')
      m.updateIndex(index, SchemaAction.REINDEX)
      m.commit()
      return 'started'
    } catch (Exception e) { m.rollback(); throw e }
  `,
    { name }
  );
  if (started[0] !== 'started') throw new Error(`Unexpected reindex start for ${name}`);
  const deadline = Date.now() + DEADLINE_MS;
  for (;;) {
    const status = await submitGraphRequest(
      config,
      `
      def m = graph.openManagement()
      try {
        def job = m.getIndexJobStatus(m.getGraphIndex(name))
        return job == null ? 'unknown' : (job.isDone() ? 'done' : 'running')
      } finally { m.rollback() }
    `,
      { name }
    );
    if (status[0] === 'done') break;
    if (Date.now() > deadline) throw new Error(`Reindex of ${name} exceeded its deadline`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  process.stdout.write(`Reindexed ${name}\n`);
}
process.stdout.write(`Reindex complete for ${targets.length} index(es)\n`);
