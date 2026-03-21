'use strict';

// Load the model without connecting to MongoDB
const User = require('../../../src/models/User');

describe('User schema', () => {
  it('has expected paths defined', () => {
    const paths = User.schema.paths;
    expect(paths).toHaveProperty('email');
    expect(paths).toHaveProperty('role');
    expect(paths).toHaveProperty('provider');
    expect(paths).toHaveProperty('providerId');
    expect(paths).toHaveProperty('firstName');
    expect(paths).toHaveProperty('lastName');
    expect(paths).toHaveProperty('avatarUrl');
    expect(paths).toHaveProperty('lastLoginAt');
    expect(paths).toHaveProperty('createdAt');
  });

  it('role defaults to "unknown"', () => {
    const user = new User({ name: 'Test' });
    expect(user.role).toBe('unknown');
  });

  it('role enum only accepts gm, player, unknown', () => {
    const user = new User({ role: 'admin' });
    const err = user.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.role).toBeDefined();
  });

  it('accepts valid role values', () => {
    for (const role of ['gm', 'player', 'unknown']) {
      const user = new User({ role });
      const err = user.validateSync();
      // Only role-related errors checked; email/providerId can be absent
      expect(err?.errors?.role).toBeUndefined();
    }
  });

  it('campaigns is an array', () => {
    const user = new User({});
    expect(Array.isArray(user.campaigns)).toBe(true);
  });

  it('lastLoginAt defaults to a date', () => {
    const user = new User({});
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });

  it('createdAt defaults to a date', () => {
    const user = new User({});
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('email field has sparse unique index', () => {
    const emailPath = User.schema.path('email');
    expect(emailPath.options.unique).toBe(true);
    expect(emailPath.options.sparse).toBe(true);
  });

  it('providerId field has sparse unique index', () => {
    const providerIdPath = User.schema.path('providerId');
    expect(providerIdPath.options.unique).toBe(true);
    expect(providerIdPath.options.sparse).toBe(true);
  });
});
