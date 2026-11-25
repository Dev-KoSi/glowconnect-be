const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { attachUser } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

let cachedConn = global.__mongooseConn;
if (!cachedConn) {
  cachedConn = global.__mongooseConn = { conn: null, promise: null };
}

async function connectDB() {
  if (cachedConn.conn) return cachedConn.conn;

  const mongoUri = process.env.MONGODB_URI || config.mongodbUri || config.mongoUri;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!cachedConn.promise) {
    cachedConn.promise = mongoose.connect(mongoUri, {
      bufferCommands: false,
    });
  }

  cachedConn.conn = await cachedConn.promise;
  return cachedConn.conn;
}

function createApp() {
  const app = express();

  // Behind a host's proxy (Render, Railway, Vercel rewrites…) so rate limits see the real client IP.
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
      // The API may be called from the separately hosted website (CORS still decides who may read it).
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: config.clientOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Ensure MongoDB is connected before attachUser or any /api route runs on serverless.
  app.use('/api', async (_req, _res, next) => {
    try {
      await connectDB();
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use('/api', attachUser);

  app.use('/api/health', require('./routes/health.routes'));
  app.use('/api/auth', require('./routes/auth.routes'));
  app.use('/api/plans', require('./routes/plans.routes'));
  app.use('/api/user', require('./routes/user.routes'));
  app.use('/api/services', require('./routes/services.routes'));
  app.use('/api/bookings', require('./routes/bookings.routes'));
  app.use('/api/client', require('./routes/client.routes'));
  app.use('/api/beautician', require('./routes/beautician.routes'));

  app.use('/api', notFound);

  // Single-port mode (`npm start`): serve the built React app and let it handle routing.
  // Skip on Vercel because static assets are served by Vercel's CDN and express.static() is ignored.
  if (!process.env.VERCEL && config.isProduction && fs.existsSync(config.frontendDist)) {
    app.use(express.static(config.frontendDist));
    app.get('*', (_req, res) => res.sendFile(path.join(config.frontendDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

const app = createApp();
app.createApp = createApp;

module.exports = app;