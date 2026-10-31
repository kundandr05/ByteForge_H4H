import { Router } from 'express';
import { jobController } from '../controllers/job.controller';

const router = Router();

// Job collection routes
router.post('/', jobController.createJob);
router.get('/', jobController.getJobs);

// Job individual resource routes
router.get('/:id', jobController.getJobById);
router.put('/:id', jobController.updateJob);
router.patch('/:id/status', jobController.updateJobStatus);
router.delete('/:id', jobController.deleteJob);

export default router;
