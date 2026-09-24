import gremlin from 'gremlin';

export type EntityScope =
  { type: 'campaign'; id: string } | { type: 'user'; id: string } | { type: 'global' };
export interface GraphIdentity {
  entityId: string;
  kind: string;
  scope: string;
}

function objectId(value: string): string {
  if (!/^[0-9a-f]{24}$/.test(value)) throw new Error('Expected a canonical legacy ObjectId string');
  return value;
}

/** JanusGraph internal IDs never become application IDs. */
export function graphIdentity(kind: string, entityId: string, scope: EntityScope): GraphIdentity {
  if (!/^[A-Z][A-Za-z]{0,63}$/.test(kind)) throw new Error('Invalid entity kind');
  const scopeKey = scope.type === 'global' ? 'global' : `${scope.type}:${objectId(scope.id)}`;
  return { entityId: objectId(entityId), kind, scope: scopeKey };
}

/** All three fields are required to use the unique composite index. Authorization belongs to repositories. */
export function findIdentity(identity: GraphIdentity): gremlin.process.GraphTraversal {
  return new gremlin.structure.Graph()
    .traversal()
    .V()
    .has('scope', identity.scope)
    .has('kind', identity.kind)
    .has('entityId', identity.entityId);
}
