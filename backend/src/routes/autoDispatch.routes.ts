import { Router } from 'express';
import { autoDispatchController } from '../controllers/autoDispatch.controller';

const router = Router();

// Admin automated allocation & direct automatic scheduling controls
router.post('/auto-allocate', autoDispatchController.autoAllocateAll);
router.post('/auto-allocate/:jobId', autoDispatchController.startAllocation);
router.post('/auto-schedule-all', autoDispatchController.autoScheduleAll);
router.post('/simulate/:jobId', autoDispatchController.simulateResponse);

// Real-time cascade status & SSE stream
router.get('/stream', autoDispatchController.subscribeToStream);
router.get('/status', autoDispatchController.getAllCascades);
router.get('/status/:jobId', autoDispatchController.getCascadeById);

// Technician live dispatch offers (Incoming alerts & Accept / Reject cascade)
router.get('/technician/:technicianId/active-offer', autoDispatchController.getActiveOffer);
router.post('/offers/:jobId/accept', autoDispatchController.acceptOffer);
router.post('/offers/:jobId/reject', autoDispatchController.rejectOffer);

// Technician specialized features: Discover offers & Earnings dashboard & Online status toggle
router.get('/technicians/discover', autoDispatchController.getDiscoverOffers);
router.get('/technicians/:id/earnings', autoDispatchController.getEarnings);
router.patch('/technicians/:id/online-status', autoDispatchController.updateOnlineStatus);

export default router;
