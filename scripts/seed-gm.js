const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('No MONGODB_URI'); process.exit(1); }

const gmSchema = new mongoose.Schema({
  email:       { type: String, required: true, unique: true },
  firstName:   String,
  lastName:    String,
  avatarPath:  String,
  lastLoginAt: Date,
  createdAt:   { type: Date, default: Date.now }
});
const GM = mongoose.model('GameMaster', gmSchema);

async function seed() {
  await mongoose.connect(uri);
  const gm = await GM.findOneAndUpdate(
    { email: 'alabeau@gmail.com' },
    {
      email: 'alabeau@gmail.com',
      firstName: 'Aaron',
      lastName: 'LaBeau',
      createdAt: new Date()
    },
    { upsert: true, new: true }
  );
  console.log('✅ GM seeded:', gm.email, gm._id.toString());
  await mongoose.disconnect();
}
seed().catch(e => { console.error(e); process.exit(1); });
