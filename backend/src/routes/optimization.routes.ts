import { Router } from 'express';
import { optimizationController } from '../controllers/optimization.controller';

const router = Router();

// POST /api/optimization/run - Executes optimization and commits improvements
router.post('/run', (req, res, next) => optimizationController.runOptimization(req, res, next));

// POST /api/optimization/preview - Previews optimization in-memory without persistence
router.post('/preview', (req, res, next) => optimizationController.previewOptimization(req, res, next));

// GET /api/optimization/runs - Paginated list of historical optimization runs
router.get('/runs', (req, res, next) => optimizationController.getOptimizationRuns(req, res, next));

// GET /api/optimization/runs/:id - Optimization run details
router.get('/runs/:id', (req, res, next) => optimizationController.getOptimizationRunById(req, res, next));

// GET /api/optimization/runs/:id/comparison - Before-and-after comparison report
router.get('/runs/:id/comparison', (req, res, next) => optimizationController.getOptimizationComparison(req, res, next));

// GET /api/optimization/runs/:id/changes - Detailed list of changed assignments
router.get('/runs/:id/changes', (req, res, next) => optimizationController.getOptimizationChanges(req, res, next));

export default router;
