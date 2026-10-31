import { Router } from 'express';
import customerController from '../controllers/customer.controller';

const router = Router();

router.get('/', customerController.getAllCustomers);
router.get('/:name', customerController.getCustomerByName);

export default router;
