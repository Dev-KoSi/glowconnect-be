const { Router } = require('express');
const { plans } = require('../services/subscription.service');

const router = Router();

router.get('/', (_req, res) => {
  res.json({ plans });
});

module.exports = router;
