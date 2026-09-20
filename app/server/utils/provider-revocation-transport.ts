import type {
  IdentityOAuthProvider,
  ProviderRevocationPlan,
  ProviderRevocationResponse,
} from '../repositories/identity/provider-revocation';
import type { EncryptedIdentityToken } from '../repositories/identity/types';

/** Inactive adapter. Credentials are supplied privately and never saved in journals. */
export function createProviderRevocationTransport(config: {
  provider: IdentityOAuthProvider;
  clientId: string;
  clientSecret?: string;
  decrypt: (envelope: EncryptedIdentityToken) => string;
  fetch: typeof fetch;
}) {
  // Capture application configuration so a later caller mutation cannot retarget dispatch.
  const { provider, clientId, clientSecret, decrypt, fetch: request } = config;
  return {
    provider,
    clientId,
    async send(plan: ProviderRevocationPlan): Promise<ProviderRevocationResponse> {
      if (plan.provider !== provider || plan.clientId !== clientId)
        throw new Error('Identity provider revocation application mismatch');
      const accessToken = decrypt(plan.accessToken);
      // Preserve current logout behavior. Apple account deletion/revocation is separate.
      if (provider === 'apple') return { kind: 'skipped', reason: 'apple_logout' };
      if (provider === 'github' && !clientSecret)
        return { kind: 'skipped', reason: 'github_credentials' };
      const common: RequestInit = {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      };
      const response =
        provider === 'google'
          ? await request('https://oauth2.googleapis.com/revoke', {
              ...common,
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ token: accessToken }),
            })
          : await request(
              `https://api.github.com/applications/${encodeURIComponent(clientId)}/token`,
              {
                ...common,
                method: 'DELETE',
                headers: {
                  Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                  Accept: 'application/vnd.github+json',
                  'X-GitHub-Api-Version': '2026-03-10',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ access_token: accessToken }),
              }
            );
      // Retain only the status. Bodies/headers can contain credentials or private data.
      await response.body?.cancel().catch(() => undefined);
      return { kind: 'http', status: response.status };
    },
  };
}
