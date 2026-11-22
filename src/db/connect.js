const mongoose = require('mongoose');
const config = require('../config');
const models = require('../models');

let memoryServer = null;

/**
 * Connect to MongoDB. With no MONGODB_URI, start a temporary in-memory MongoDB
 * so the app still runs locally (its data is wiped when the server stops).
 */
async function connectDB(uri = config.mongoUri) {
  let target = uri;
  let inMemory = false;

  if (!target && config.isProduction) {
    // Never silently fall back to a throwaway database on a live server.
    throw new Error('MONGODB_URI is required in production. Set it in your host’s environment variables.');
  }

  if (!target) {
    // Loaded lazily: only needed when no real database is configured.
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    target = memoryServer.getUri('glowconnect');
    inMemory = true;
  }

  mongoose.set('strictQuery', true);
  // Generous timeout: the first TLS handshake to Atlas can be slow on some connections.
  await mongoose.connect(target, { serverSelectionTimeoutMS: 30_000 });
  // Build indexes (unique email/username, TTLs) before taking traffic.
  await Promise.all(Object.values(models).map((m) => m.init()));
  return { inMemory };
}

async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

module.exports = { connectDB, disconnectDB };
