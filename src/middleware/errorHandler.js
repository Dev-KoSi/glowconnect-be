const mongoose = require('mongoose');
const { HttpError } = require('../utils/httpError');

function notFound(req, _res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.originalUrl}`, 'NOT_FOUND'));
}

/** Translate library errors (JSON parsing, Mongoose) into clean API errors. */
function normalize(err) {
  if (err instanceof HttpError) return err;
  if (err.type === 'entity.parse.failed') return new HttpError(400, 'Request body is not valid JSON', 'INVALID_JSON');
  if (err instanceof mongoose.Error.CastError) return new HttpError(404, 'Not found', 'NOT_FOUND');
  if (err instanceof mongoose.Error.ValidationError) {
    const fields = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    return new HttpError(400, 'Invalid details', 'VALIDATION_ERROR', { fields });
  }
  if (err.code === 11000) return new HttpError(409, 'That already exists', 'DUPLICATE');
  return err;
}

// eslint-disable-next-line no-unused-vars
function errorHandler(rawErr, _req, res, _next) {
  const err = normalize(rawErr);
  const status = err.status || 500;
  if (status >= 500) console.error('[api]', rawErr);
  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: status >= 500 && !(err instanceof HttpError) ? 'Something went wrong' : err.message,
      ...(err.details && { details: err.details }),
    },
  });
}

module.exports = { notFound, errorHandler };
