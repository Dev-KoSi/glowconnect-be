// Cross-platform setup (no shell env syntax needed in package.json):
//   node server.js --production   → serve the built frontend from this port
//   backend/.env                  → settings (see .env.example)
if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';
try {
  process.loadEnvFile(require('node:path').join(__dirname, '.env'));
} catch {
  /* no .env file: use defaults */
}

const config = require('./src/config');
const { createApp } = require('./src/app');
const { connectDB, disconnectDB } = require('./src/db/connect');
const { seedSampleData } = require('./src/data/sample');
const { verifyMailer } = require('./src/services/mailer');

async function main() {
  const { inMemory } = await connectDB();
  if (inMemory) {
    console.warn('[db] MONGODB_URI is not set: using a TEMPORARY in-memory database. Data is lost on restart.');
  } else {
    console.log('[db] connected to MongoDB');
  }

  const seedFlag = config.seedSampleData;
  if (seedFlag === 'true' || (seedFlag !== 'false' && inMemory)) {
    const added = await seedSampleData();
    if (added) console.log(`[db] added ${added} showcase listings (set SEED_SAMPLE_DATA=false to skip)`);
  }

  try {
    const mode = await verifyMailer();
    if (mode === 'console') {
      console.warn('[mail] SMTP is not configured: sign-in codes will be printed here instead of emailed.');
    } else {
      console.log('[mail] SMTP ready');
    }
  } catch (err) {
    console.error(`[mail] SMTP check failed (${err.message}). Codes can't be emailed until this is fixed.`);
  }

  const server = createApp().listen(config.port, () => {
    const mode = config.isProduction ? 'production (serving frontend/dist)' : 'development';
    console.log(`[api] ${mode} server listening on http://localhost:${config.port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[api] Port ${config.port} is already in use. Stop the other process or set PORT in backend/.env.`);
      process.exit(1);
    }
    throw err;
  });

  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, closing server`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  if (err.name === 'MongooseServerSelectionError' || err.name === 'MongoServerSelectionError') {
    console.error(
      '[db] Could not reach MongoDB at MONGODB_URI.\n' +
        '     If you use MongoDB Atlas: Network Access → Add IP Address → "Add current IP address"\n' +
        '     (or 0.0.0.0/0 to allow anywhere), wait ~1 minute, then restart.\n' +
        '     Also check that the database user and password in the URI are correct.',
    );
  } else if (err.name === 'MongoServerError' && /auth/i.test(err.message)) {
    console.error('[db] MongoDB rejected the username/password in MONGODB_URI (Atlas → Database Access).');
  } else {
    console.error('[api] failed to start:', err.message);
  }
  process.exit(1);
});
