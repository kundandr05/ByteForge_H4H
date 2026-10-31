import { Router } from 'express';
import { explainabilityController } from '../controllers/explainability.controller';

const router = Router();

// GET /api/explanations/jobs/:jobId - Explain job assignment status and candidate evaluations
router.get('/jobs/:jobId', (req, res, next) =>
  explainabilityController.explainJob(req, res, next)
);

// GET /api/explanations/assignments/:assignmentId - Explain specific assignment rationale and constraint verification
router.get('/assignments/:assignmentId', (req, res, next) =>
  explainabilityController.explainAssignment(req, res, next)
);

// GET /api/explanations/scheduling-runs/:runId - Explain scheduling run metrics and decision breakdown
router.get('/scheduling-runs/:runId', (req, res, next) =>
  explainabilityController.explainSchedulingRun(req, res, next)
);

// GET /api/explanations/optimization-runs/:runId - Explain optimization decisions, accepted and rejected swaps
router.get('/optimization-runs/:runId', (req, res, next) =>
  explainabilityController.explainOptimizationRun(req, res, next)
);

// GET /api/explanations/recovery-runs/:runId - Explain disruption recovery actions and alternatives considered
router.get('/recovery-runs/:runId', (req, res, next) =>
  explainabilityController.explainRecoveryRun(req, res, next)
);

export default router;
