/**
 * Prints what a reset left behind: how many campaigns, and which hold the SRD spells.
 * A clean `dev:clear` + `dev:seed` gives 3 campaigns, every spell under one of them.
 *
 * Usage: npx tsx scripts/seed/summary.ts
 */
import { campaigns } from '../../app/server/repositories/campaigns';
import { Spell } from '../../app/server/db/models/Spell';
import { closeData } from '../../app/server/db/data-runtime';

try {
  const all = await campaigns.listAll();
  const spells = await Spell.find({}, 'campaignId').lean();
  process.stdout.write(`campaigns: ${all.length} | spells: ${spells.length}\n`);
  const perCampaign = new Map<string, number>();
  for (const spell of spells)
    perCampaign.set(spell.campaignId, (perCampaign.get(spell.campaignId) ?? 0) + 1);
  for (const [campaignId, count] of perCampaign) {
    const name = all.find((campaign) => campaign._id === campaignId)?.name ?? campaignId;
    process.stdout.write(`  ${name}: ${count} spells\n`);
  }
} finally {
  await closeData();
}
