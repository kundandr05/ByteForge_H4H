import { Router } from 'express';
import { disruptionController } from '../controllers/disruption.controller';

const router = Router();

// GET /api/recovery/history - Retrieve paginated historical recovery runs
router.get('/history', (req, res, next) => disruptionController.getRecoveryHistory(req, res, next));

// GET /api/recovery/:id/comparison - Retrieve before/after metrics comparison for recovery run
router.get('/:id/comparison', (req, res, next) =>
  disruptionController.getRecoveryComparison(req, res, next)
);

export default router;
