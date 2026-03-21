'use strict';

const Campaign = require('../../../src/models/Campaign');

describe('Campaign schema', () => {
  it('has expected paths defined', () => {
    const paths = Campaign.schema.paths;
    expect(paths).toHaveProperty('gameMasterId');
    expect(paths).toHaveProperty('name');
    expect(paths).toHaveProperty('description');
    expect(paths).toHaveProperty('imagePath');
    expect(paths['schedule.frequency']).toBeDefined();
    expect(paths['schedule.dayOfWeek']).toBeDefined();
    expect(paths['schedule.time']).toBeDefined();
    expect(paths['schedule.timezone']).toBeDefined();
    expect(paths).toHaveProperty('callUrl');
    expect(paths).toHaveProperty('dndBeyondUrl');
    expect(paths).toHaveProperty('maxPlayers');
    expect(paths).toHaveProperty('inviteCode');
    expect(paths).toHaveProperty('status');
    expect(paths).toHaveProperty('createdAt');
    expect(paths).toHaveProperty('updatedAt');
  });

  it('requires name', () => {
    const campaign = new Campaign({});
    const err = campaign.validateSync();
    expect(err).toBeDefined();
    expect(err.errors.name).toBeDefined();
  });

  it('passes validation when name is provided', () => {
    const campaign = new Campaign({ name: 'Test Campaign' });
    const err = campaign.validateSync();
    expect(err).toBeUndefined();
  });

  it('maxPlayers defaults to 4', () => {
    const campaign = new Campaign({ name: 'Test' });
    expect(campaign.maxPlayers).toBe(4);
  });

  it('status defaults to "active"', () => {
    const campaign = new Campaign({ name: 'Test' });
    expect(campaign.status).toBe('active');
  });

  it('createdAt defaults to a date', () => {
    const campaign = new Campaign({ name: 'Test' });
    expect(campaign.createdAt).toBeInstanceOf(Date);
  });

  it('updatedAt defaults to a date', () => {
    const campaign = new Campaign({ name: 'Test' });
    expect(campaign.updatedAt).toBeInstanceOf(Date);
  });

  it('inviteCode has sparse unique index', () => {
    const inviteCodePath = Campaign.schema.path('inviteCode');
    expect(inviteCodePath.options.unique).toBe(true);
    expect(inviteCodePath.options.sparse).toBe(true);
  });

  it('gameMasterId references User model', () => {
    const gmPath = Campaign.schema.path('gameMasterId');
    expect(gmPath.options.ref).toBe('User');
  });
});
