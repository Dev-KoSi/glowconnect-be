const { Router } = require('express');
const { CATEGORIES, listActiveServices, findActiveService, toPublicService } = require('../services/listing.service');
const { asyncHandler } = require('../utils/asyncHandler');

const router = Router();

// Public marketplace: listings from beauticians with an active plan.
router.get('/', asyncHandler(async (req, res) => {
  res.json({ services: await listActiveServices({ category: req.query.category }), categories: CATEGORIES });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const service = await findActiveService(req.params.id);
  res.json({ service: toPublicService(service.toObject()) });
}));

module.exports = router;
