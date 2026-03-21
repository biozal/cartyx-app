'use strict';

const { escapeHtml, providerConfigured, generateInviteCode } = require('../../../src/utils/helpers');

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('returns empty string for falsy input', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml('')).toBe('');
  });

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('handles numeric input by converting to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('providerConfigured', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false for unknown provider', () => {
    expect(providerConfigured('discord')).toBe(false);
  });

  it('returns false for google when env vars missing', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(providerConfigured('google')).toBe(false);
  });

  it('returns true for google when both env vars present', () => {
    process.env.GOOGLE_CLIENT_ID = 'fake-id';
    process.env.GOOGLE_CLIENT_SECRET = 'fake-secret';
    expect(providerConfigured('google')).toBe(true);
  });

  it('returns false for google when only one env var present', () => {
    process.env.GOOGLE_CLIENT_ID = 'fake-id';
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(providerConfigured('google')).toBe(false);
  });

  it('returns false for github when env vars missing', () => {
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    expect(providerConfigured('github')).toBe(false);
  });

  it('returns true for github when both env vars present', () => {
    process.env.GITHUB_CLIENT_ID = 'fake-id';
    process.env.GITHUB_CLIENT_SECRET = 'fake-secret';
    expect(providerConfigured('github')).toBe(true);
  });

  it('returns false for apple when env vars missing', () => {
    delete process.env.APPLE_CLIENT_ID;
    delete process.env.APPLE_TEAM_ID;
    delete process.env.APPLE_KEY_ID;
    delete process.env.APPLE_PRIVATE_KEY_PATH;
    expect(providerConfigured('apple')).toBe(false);
  });
});

describe('generateInviteCode', () => {
  it('returns a string in XXXX-XXXX format', () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it('generates unique codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));
    // With 32^8 possible codes, duplicates in 20 should be essentially impossible
    expect(codes.size).toBe(20);
  });

  it('only uses allowed characters (no O, 0, I, 1 to avoid confusion)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode().replace('-', '');
      expect(code).not.toMatch(/[OI01]/);
    }
  });
});
