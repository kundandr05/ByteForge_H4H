import { Router } from 'express';
import { healthController } from '../controllers/healthController';

const router = Router();

router.get('/', healthController.getHealth);
router.get('/database', healthController.getDatabaseHealth);

export default router;
