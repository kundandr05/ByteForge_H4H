import { Router } from 'express';
import healthRoutes from './healthRoutes';
import jobRoutes from './job.routes';
import technicianRoutes from './technician.routes';
import schedulingRoutes from './scheduling.routes';
import optimizationRoutes from './optimization.routes';
import disruptionRoutes from './disruption.routes';
import recoveryRoutes from './recovery.routes';
import auditRoutes from './audit.routes';
import explainabilityRoutes from './explainability.routes';
import customerRoutes from './customer.routes';
import aiBookingRoutes from './aiBooking.routes';
import autoDispatchRoutes from './autoDispatch.routes';

const router = Router();

// Health check endpoints
router.use('/health', healthRoutes);

// Job management endpoints
router.use('/jobs', jobRoutes);

// Technician management endpoints
router.use('/technicians', technicianRoutes);

// Customer tracking endpoints
router.use('/customers', customerRoutes);

// AI Voice & Chat booking endpoints
router.use('/ai', aiBookingRoutes);

// Automated nearest-neighbor allocation & live cascades
router.use('/dispatch', autoDispatchRoutes);

// Scheduling engine endpoints
router.use('/scheduling', schedulingRoutes);

// Assignment optimization engine endpoints
router.use('/optimization', optimizationRoutes);

// Disruption management endpoints
router.use('/disruptions', disruptionRoutes);

// Recovery engine endpoints
router.use('/recovery', recoveryRoutes);

// Audit history endpoints
router.use('/audit', auditRoutes);

// Centralized explainability endpoints
router.use('/explanations', explainabilityRoutes);

export default router;
