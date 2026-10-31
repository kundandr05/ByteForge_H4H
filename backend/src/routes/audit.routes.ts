import { Router } from 'express';
import { auditController } from '../controllers/audit.controller';

const router = Router();

// GET /api/audit - List audit logs with pagination, filtering & sorting
router.get('/', (req, res, next) => auditController.getAuditLogs(req, res, next));

// GET /api/audit/entity/:entityType/:entityId - Query audit logs for a specific entity
router.get('/entity/:entityType/:entityId', (req, res, next) =>
  auditController.getAuditLogsByEntity(req, res, next)
);

// GET /api/audit/:id - Retrieve individual audit record
router.get('/:id', (req, res, next) => auditController.getAuditLogById(req, res, next));

export default router;
