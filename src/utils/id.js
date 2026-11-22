const { randomUUID } = require('node:crypto');

const createId = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;

module.exports = { createId };
