import { Router } from 'express';
import { technicianController } from '../controllers/technician.controller';

const router = Router();

// Technician collection routes
router.post('/', technicianController.createTechnician);
router.get('/', technicianController.getTechnicians);

// Technician individual resource routes
router.get('/:id', technicianController.getTechnicianById);
router.put('/:id', technicianController.updateTechnician);
router.patch('/:id/availability', technicianController.updateAvailability);
router.delete('/:id', technicianController.deleteTechnician);

export default router;
