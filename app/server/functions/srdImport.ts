import { Spell } from '../db/models/Spell';
import { Race } from '../db/models/Race';
import { Rule } from '../db/models/Rule';
import { getSrdSpells, getSrdRaces, getSrdRules } from '../data/srd';

interface ImportArgs {
  campaignId: string;
  gmId: string;
}

/**
 * Insert all bundled SRD 5.2.1 content (spells, races, rules) into a campaign.
 * Spells are marked source:'srd' (read-only); races/rules match the dev-seed shape.
 */
export async function importSrdContent({ campaignId, gmId }: ImportArgs) {
  const now = new Date();

  const spellDocs = getSrdSpells().map((s) => ({
    ...s,
    source: 'srd' as const,
    campaignId,
    createdBy: gmId,
    createdAt: now,
    updatedAt: now,
  }));
  const raceDocs = getSrdRaces().map((r) => ({
    ...r,
    campaignId,
    createdBy: gmId,
    createdAt: now,
    updatedAt: now,
  }));
  const ruleDocs = getSrdRules().map((r) => ({
    ...r,
    isPublic: true,
    campaignId,
    createdBy: gmId,
    createdAt: now,
    updatedAt: now,
  }));

  if (spellDocs.length) await Spell.insertMany(spellDocs);
  if (raceDocs.length) await Race.insertMany(raceDocs);
  if (ruleDocs.length) await Rule.insertMany(ruleDocs);

  return { spells: spellDocs.length, races: raceDocs.length, rules: ruleDocs.length };
}
