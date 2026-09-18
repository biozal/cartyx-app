/**
 * Separate from `data-runtime` so that code which only needs to recognise an outage
 * does not import the runtime composition, which validates its credentials at import
 * time and therefore requires a configured environment.
 */
export class DataUnavailableError extends Error {
  readonly status = 503;
  constructor() {
    super('Database not connected');
    this.name = 'DataUnavailableError';
  }
}
