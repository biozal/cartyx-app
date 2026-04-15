/**
 * Seed the dev database with 3 test campaigns, each with sessions,
 * characters, and a generated placeholder image.
 *
 * Usage:
 *   npx tsx scripts/dev-seed.ts
 *
 * Shortcut:
 *   npm run dev:seed
 *
 * Prerequisites:
 *   - MONGODB_URI must be set
 *   - A User document must exist (run `node scripts/seed-gm.cjs` first)
 *
 * Safety: refuses to run if NODE_ENV is "production".
 */
import mongoose from 'mongoose';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Safety guard
// ---------------------------------------------------------------------------
function assertNotProduction(uri: string): void {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run in production.');
    process.exit(1);
  }
  if (/prod/i.test(uri)) {
    console.error('MONGODB_URI looks like a production connection string. Aborting.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Image generation — creates simple SVG-based PNG placeholders
// ---------------------------------------------------------------------------
function generateCampaignSvg(
  title: string,
  colors: { bg: string; fg: string; accent: string }
): string {
  const initials = title
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.bg}"/>
      <stop offset="100%" style="stop-color:${colors.accent}"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${colors.fg}" stroke-opacity="0.08" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="800" height="450" fill="url(#bg)"/>
  <rect width="800" height="450" fill="url(#grid)"/>
  <circle cx="400" cy="180" r="80" fill="${colors.fg}" fill-opacity="0.15"/>
  <text x="400" y="200" text-anchor="middle" font-family="Georgia, serif" font-size="64" font-weight="bold" fill="${colors.fg}">${initials}</text>
  <text x="400" y="320" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="${colors.fg}">${escapeXml(title)}</text>
  <text x="400" y="360" text-anchor="middle" font-family="sans-serif" font-size="14" fill="${colors.fg}" fill-opacity="0.6">Test Campaign — Dev Seed</text>
</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function saveImage(svgContent: string, filename: string): string {
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads', 'campaigns');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, svgContent, 'utf-8');
  return `/uploads/campaigns/${filename}`;
}

// ---------------------------------------------------------------------------
// Campaign definitions
// ---------------------------------------------------------------------------
interface CampaignDef {
  name: string;
  description: string;
  schedule: { frequency: string; dayOfWeek: string; time: string; timezone: string };
  maxPlayers: number;
  colors: { bg: string; fg: string; accent: string };
  sessions: { name: string; number: number; status: 'not_started' | 'active' | 'completed' }[];
  characters: {
    firstName: string;
    lastName: string;
    race: string;
    characterClass: string;
    notes: string;
    tags: string[];
  }[];
}

const CAMPAIGNS: CampaignDef[] = [
  {
    name: 'The Lost Mines of Phandelver',
    description:
      'A classic introductory adventure. The party has been hired to escort a wagon of supplies to the rough-and-tumble settlement of Phandalin. Along the way, they stumble into a web of intrigue involving the mysterious Wave Echo Cave.',
    schedule: {
      frequency: 'weekly',
      dayOfWeek: 'Saturday',
      time: '18:00',
      timezone: 'America/Chicago',
    },
    maxPlayers: 5,
    colors: { bg: '#1a3a2a', fg: '#e8e0d0', accent: '#2d5a3f' },
    sessions: [
      { name: 'Goblin Arrows', number: 1, status: 'completed' },
      { name: "The Spider's Web", number: 2, status: 'completed' },
      { name: 'Wave Echo Cave', number: 3, status: 'not_started' },
    ],
    characters: [
      {
        firstName: 'Thorin',
        lastName: 'Ironforge',
        race: 'Dwarf',
        characterClass: 'Fighter',
        notes:
          'Veteran miner turned adventurer. Seeking revenge against the orcs that destroyed his clan.',
        tags: ['npc', 'ally'],
      },
      {
        firstName: 'Elara',
        lastName: 'Moonwhisper',
        race: 'Elf',
        characterClass: 'Wizard',
        notes: 'Scholar from Neverwinter Academy studying ancient dwarven magic.',
        tags: ['npc', 'quest-giver'],
      },
    ],
  },
  {
    name: 'Curse of Strahd',
    description:
      'Under raging storm clouds, the vampire darklord Strahd von Zarovich looks down from the tall windows of Castle Ravenloft. The adventurers have been lured into his domain of dread — Barovia. Can they escape, or will they become permanent residents?',
    schedule: {
      frequency: 'biweekly',
      dayOfWeek: 'Friday',
      time: '19:30',
      timezone: 'America/New_York',
    },
    maxPlayers: 4,
    colors: { bg: '#2a1a2e', fg: '#d4c8e0', accent: '#4a2a5a' },
    sessions: [
      { name: 'Into the Mists', number: 1, status: 'completed' },
      { name: 'Village of Barovia', number: 2, status: 'active' },
    ],
    characters: [
      {
        firstName: 'Ireena',
        lastName: 'Kolyana',
        race: 'Human',
        characterClass: 'Noble',
        notes:
          'The adopted daughter of Burgomaster Kolyan Indirovich. Strahd believes she is the reincarnation of Tatyana.',
        tags: ['npc', 'key-character'],
      },
      {
        firstName: 'Ismark',
        lastName: 'Kolyanovich',
        race: 'Human',
        characterClass: 'Fighter',
        notes:
          'Ireena\'s brother. Known as "Ismark the Lesser." Desperate to protect his sister from Strahd.',
        tags: ['npc', 'ally'],
      },
      {
        firstName: 'Madam',
        lastName: 'Eva',
        race: 'Human',
        characterClass: 'Seer',
        notes:
          "A Vistani fortune teller who can read the Tarokka cards to reveal the party's destiny.",
        tags: ['npc', 'quest-giver'],
      },
    ],
  },
  {
    name: "Storm King's Thunder",
    description:
      'Giants have emerged from their strongholds to threaten civilization as never before. Hill giants steal crops and livestock, frost giants plunder coastal towns, and fire giants press gangs into service. The ordning — the social structure of giantkind — has shattered.',
    schedule: {
      frequency: 'weekly',
      dayOfWeek: 'Wednesday',
      time: '20:00',
      timezone: 'America/Los_Angeles',
    },
    maxPlayers: 6,
    colors: { bg: '#1a2a3a', fg: '#d0e0f0', accent: '#2a4a6a' },
    sessions: [{ name: 'A Great Upheaval', number: 1, status: 'not_started' }],
    characters: [
      {
        firstName: 'Harshnag',
        lastName: 'the Grim',
        race: 'Frost Giant',
        characterClass: 'Barbarian',
        notes:
          'A legendary frost giant who has long been a friend to small folk. Now seeks to restore the ordning.',
        tags: ['npc', 'ally', 'giant'],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  assertNotProduction(uri);
  await mongoose.connect(uri, { autoIndex: false });

  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get database handle.');
    process.exit(1);
  }

  // Find the GM user to own the campaigns
  const user = await db.collection('users').findOne({ role: 'gm' });
  if (!user) {
    console.error(
      'No GM user found. Run `node scripts/seed-gm.cjs` first, then log in to create a User doc.'
    );
    console.error('Alternatively, any user with role "gm" in the users collection will work.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const gmId = user._id;
  console.log(`Using GM: ${user.firstName ?? user.email} (${gmId})\n`);

  const campaignIds: mongoose.Types.ObjectId[] = [];

  for (const def of CAMPAIGNS) {
    // Generate and save campaign image
    const svg = generateCampaignSvg(def.name, def.colors);
    const filename = `seed-${crypto.randomBytes(4).toString('hex')}.svg`;
    const imagePath = saveImage(svg, filename);
    console.log(`  image  ${imagePath}`);

    // Create campaign
    const inviteCode = crypto.randomBytes(4).toString('hex');
    const campaignResult = await db.collection('campaigns').insertOne({
      gameMasterId: gmId,
      name: def.name,
      description: def.description,
      imagePath,
      schedule: def.schedule,
      links: [],
      maxPlayers: def.maxPlayers,
      inviteCode,
      status: 'active',
      members: [{ userId: gmId, role: 'gm', joinedAt: new Date() }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const campaignId = campaignResult.insertedId;
    campaignIds.push(campaignId as unknown as mongoose.Types.ObjectId);
    console.log(`  campaign  ${def.name} (${campaignId})`);

    // Create sessions
    for (const sess of def.sessions) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (def.sessions.length - sess.number) * 7);

      await db.collection('sessions').insertOne({
        campaignId,
        name: sess.name,
        gm: gmId,
        number: sess.number,
        startDate,
        status: sess.status,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`    session #${sess.number}  ${sess.name} [${sess.status}]`);
    }

    // Create characters
    for (const char of def.characters) {
      await db.collection('characters').insertOne({
        firstName: char.firstName,
        lastName: char.lastName,
        race: char.race,
        characterClass: char.characterClass,
        notes: char.notes,
        gmNotes: '',
        tags: char.tags,
        isPublic: false,
        sessions: [],
        campaignId,
        createdBy: gmId,
        picture: '',
        pictureCrop: null,
        location: '',
        link: '',
        age: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(
        `    character  ${char.firstName} ${char.lastName} (${char.race} ${char.characterClass})`
      );
    }

    console.log('');
  }

  // Update user's campaign list
  await db.collection('users').updateOne(
    { _id: gmId },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw driver update
      $push: {
        campaigns: {
          $each: campaignIds.map((id) => ({
            campaignId: id,
            joinedAt: new Date(),
            status: 'active',
          })),
        },
      } as any,
    }
  );
  console.log(`Updated GM user with ${campaignIds.length} campaign references.`);

  console.log('\nDone. 3 test campaigns seeded with sessions, characters, and images.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exitCode = 1;
});
