import { test as base, expect } from '@playwright/test';

/**
 * Extended test fixtures for tabletop multi-user testing.
 *
 * TODO: Implement auth fixtures once test accounts are set up.
 * These fixtures will:
 * - gmPage: Log in as a GM user and navigate to a campaign
 * - playerPage: Log in as a player and navigate to the same campaign
 */
export const test = base.extend<{
  campaignUrl: string;
}>({
  campaignUrl: async ({}, use) => {
    // TODO: Replace with actual test campaign URL once seeded
    await use('/play/TEST_CAMPAIGN_ID');
  },
});

export { expect };
