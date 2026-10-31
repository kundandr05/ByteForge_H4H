import { Router } from 'express';
import { schedulingController } from '../controllers/scheduling.controller';

const router = Router();

// POST /api/scheduling/generate - Generates and commits a schedule run
router.post('/generate', (req, res, next) => schedulingController.generateSchedule(req, res, next));

// GET /api/scheduling/current - Current schedule and active assignments
router.get('/current', (req, res, next) => schedulingController.getCurrentSchedule(req, res, next));

// GET /api/scheduling/runs - Paginated historical scheduling runs
router.get('/runs', (req, res, next) => schedulingController.getSchedulingRuns(req, res, next));

// GET /api/scheduling/runs/:id - Run details by UUID
router.get('/runs/:id', (req, res, next) => schedulingController.getSchedulingRunById(req, res, next));

// GET /api/scheduling/jobs/:jobId/explanation - Job explanation audit
router.get('/jobs/:jobId/explanation', (req, res, next) => schedulingController.getJobExplanation(req, res, next));

// GET /api/scheduling/technicians/:technicianId/schedule - Technician timeline
router.get('/technicians/:technicianId/schedule', (req, res, next) => schedulingController.getTechnicianSchedule(req, res, next));

export default router;
