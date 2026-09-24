import { readGraphConfig } from '../../app/server/db/graph/config';

/** Operator-only fixture wiring. Never imported by application runtime code. */
export function graphTestConnections() {
  const runtime = readGraphConfig();
  const operatorPassword = process.env.IDENTITY_GRAPH_OPERATOR_PASSWORD_FILE;
  if (!operatorPassword) {
    if (runtime.username !== 'cartyx_admin')
      throw new Error('Restricted fixtures require a separate operator credential');
    return { runtime, operator: runtime, restricted: false };
  }
  if (runtime.username !== 'cartyx_app')
    throw new Error('Restricted fixtures must use the application service principal');
  const operator = readGraphConfig({
    ...process.env,
    GREMLIN_USERNAME: 'cartyx_admin',
    GREMLIN_PASSWORD_FILE: operatorPassword,
  });
  if (operator.password === runtime.password)
    throw new Error('Fixture operator and service credentials must differ');
  return { runtime, operator, restricted: true };
}
