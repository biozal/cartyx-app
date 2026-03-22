require('dotenv').config();
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email:      { type: String, required: true, unique: true },
  role:       { type: String, enum: ['gm', 'player', 'unknown'], default: 'unknown', index: true },
  firstName:  String,
  lastName:   String,
  provider:   String,
  providerId: String,
  avatarUrl:  String,
  campaigns:  [{ campaignId: mongoose.Schema.Types.ObjectId, joinedAt: Date, status: String }],
  lastLoginAt:{ type: Date, default: Date.now },
  createdAt:  { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected');

  // Seed Aaron as GM
  const aaron = await User.findOneAndUpdate(
    { email: 'alabeau@gmail.com' },
    {
      email: 'alabeau@gmail.com',
      role: 'gm',
      firstName: 'Aaron',
      lastName: 'LaBeau',
      provider: 'google',
    },
    { upsert: true, new: true, returnDocument: 'after' }
  );
  console.log('✅ GM seeded:', aaron.email, '| role:', aaron.role);

  // Drop old collections if they exist
  const cols = await mongoose.connection.db.listCollections().toArray();
  for (const col of cols) {
    if (['gamemasters', 'players'].includes(col.name)) {
      await mongoose.connection.db.dropCollection(col.name);
      console.log('🗑️  Dropped:', col.name);
    }
  }

  await mongoose.disconnect();
  console.log('Done');
}
migrate().catch(e => { console.error(e); process.exit(1); });
