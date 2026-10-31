import { Router } from 'express';
import aiBookingController from '../controllers/aiBooking.controller';

const router = Router();

router.post('/parse-booking', aiBookingController.parsePrompt);
router.post('/book', aiBookingController.bookJob);

export default router;
