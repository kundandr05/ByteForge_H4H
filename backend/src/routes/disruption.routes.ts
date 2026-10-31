import { Router } from 'express';
import { disruptionController } from '../controllers/disruption.controller';

const router = Router();

// POST /api/disruptions - Register operational disruption event
router.post('/', (req, res, next) => disruptionController.createDisruption(req, res, next));

// GET /api/disruptions - List historical disruptions
router.get('/', (req, res, next) => disruptionController.getDisruptions(req, res, next));

// GET /api/disruptions/:id - Get disruption by ID
router.get('/:id', (req, res, next) => disruptionController.getDisruptionById(req, res, next));

// POST /api/disruptions/:id/recover - Execute disruption recovery replanning
router.post('/:id/recover', (req, res, next) =>
  disruptionController.recoverDisruption(req, res, next)
);

// GET /api/disruptions/:id/recovery-report - Get comprehensive recovery audit report
router.get('/:id/recovery-report', (req, res, next) =>
  disruptionController.getRecoveryReport(req, res, next)
);

export default router;
