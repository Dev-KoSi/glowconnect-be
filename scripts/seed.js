// Add the showcase listings to your real MongoDB (safe to re-run; only adds missing ones).
//   npm run seed -w backend
try {
  process.loadEnvFile(require('node:path').join(__dirname, '..', '.env'));
} catch {
  /* no .env */
}

const config = require('../src/config');
const { connectDB, disconnectDB } = require('../src/db/connect');
const { seedSampleData } = require('../src/data/sample');

(async () => {
  if (!config.mongoUri) {
    console.error('Set MONGODB_URI in backend/.env first (the temporary database seeds itself).');
    process.exit(1);
  }
  await connectDB();
  const added = await seedSampleData();
  console.log(added ? `Added ${added} showcase listings.` : 'All showcase listings already exist; their beauticians were renewed.');
  await disconnectDB();
})().catch(async (err) => {
  console.error('Seeding failed:', err.message);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
