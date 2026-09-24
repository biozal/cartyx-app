// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createProviderRevocationTransport } from '~/server/utils/provider-revocation-transport';
import type { ProviderRevocationPlan } from '~/server/repositories/identity/provider-revocation';

function plan(provider: ProviderRevocationPlan['provider']): ProviderRevocationPlan {
  return {
    version: 1,
    provider,
    clientId: 'fixture.client',
    clearOperationId: randomUUID(),
    fence: { userId: '1'.repeat(24), providerId: 'fixture_provider', tokenRevision: randomUUID() },
    accessToken: {
      ciphertext: 'YQ==',
      iv: Buffer.alloc(12).toString('base64'),
      authTag: Buffer.alloc(16).toString('base64'),
    },
  };
}

it.each(['google', 'github'] as const)(
  'sends one %s request without redirects and retains only HTTP status',
  async (provider) => {
    const response = {
      status: provider === 'google' ? 200 : 204,
      body: { cancel: vi.fn().mockResolvedValue(undefined) },
    };
    const request = vi.fn().mockResolvedValue(response);
    const decrypt = vi.fn().mockReturnValue('synthetic token+/&');
    const input = plan(provider);
    const transport = createProviderRevocationTransport({
      provider,
      clientId: input.clientId,
      clientSecret: 'fixture-secret',
      decrypt,
      fetch: request,
    });
    expect(await transport.send(input)).toEqual({ kind: 'http', status: response.status });
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('synthetic');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    if (provider === 'google') {
      expect(url).toBe('https://oauth2.googleapis.com/revoke');
      expect(init.method).toBe('POST');
      expect((init.body as URLSearchParams).get('token')).toBe('synthetic token+/&');
    } else {
      expect(url).toBe('https://api.github.com/applications/fixture.client/token');
      expect(init.method).toBe('DELETE');
      expect(init.headers).toMatchObject({
        Authorization: `Basic ${Buffer.from('fixture.client:fixture-secret').toString('base64')}`,
      });
      expect(JSON.parse(init.body as string)).toEqual({ access_token: 'synthetic token+/&' });
    }
    expect(decrypt).toHaveBeenCalledWith(input.accessToken);
    expect(response.body.cancel).toHaveBeenCalledTimes(1);
  }
);

it.each(['apple', 'github'] as const)(
  'records the existing %s skip without provider HTTP',
  async (provider) => {
    const request = vi.fn();
    const input = plan(provider);
    const transport = createProviderRevocationTransport({
      provider,
      clientId: input.clientId,
      decrypt: () => 'fixture',
      fetch: request,
    });
    expect(await transport.send(input)).toEqual({
      kind: 'skipped',
      reason: provider === 'apple' ? 'apple_logout' : 'github_credentials',
    });
    expect(request).not.toHaveBeenCalled();
  }
);

it('refuses an application mismatch before decrypting and never retries a failed fetch', async () => {
  const input = plan('google');
  const decrypt = vi.fn().mockReturnValue('fixture');
  const request = vi.fn().mockRejectedValue(new Error('transport interruption'));
  const transport = createProviderRevocationTransport({
    provider: 'google',
    clientId: input.clientId,
    decrypt,
    fetch: request,
  });
  await expect(transport.send({ ...input, clientId: 'another.client' })).rejects.toThrow(
    'application mismatch'
  );
  expect(decrypt).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  await expect(transport.send(input)).rejects.toThrow('transport interruption');
  expect(request).toHaveBeenCalledTimes(1);
});
