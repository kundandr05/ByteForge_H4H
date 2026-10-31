import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/prisma';

describe('Job Management APIs (Phase 3)', () => {
  beforeEach(async () => {
    await prisma.schedulingRunDetail.deleteMany({});
    await prisma.schedulingRun.deleteMany({});
    await prisma.assignment.deleteMany({});
    await prisma.technicianUnavailability.deleteMany({});
    await prisma.disruptionEvent.deleteMany({});
    await prisma.job.deleteMany({});
    await prisma.technician.deleteMany({});
    await prisma.auditLog.deleteMany({});
  });

  const validJobPayload = {
    customerName: 'St. Jude Hospital',
    description: 'Medical gas pipeline pressure regulator check',
    requiredSkills: ['MEDICAL_GAS', 'PRESSURE_SYSTEMS'],
    priority: 'CRITICAL',
    estimatedDuration: 90,
    latitude: 37.7749,
    longitude: -122.4194,
    serviceZone: 'ZONE_HEALTHCARE',
    earliestStart: '2026-10-31T08:00:00.000Z',
    latestEnd: '2026-10-31T16:00:00.000Z',
    slaDeadline: '2026-10-31T14:00:00.000Z',
    status: 'PENDING',
  };

  // 1. Job Creation
  describe('POST /api/jobs', () => {
    it('creates a job with complete validation, 201 status, and transactional audit log', async () => {
      const res = await request(app).post('/api/jobs').send(validJobPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Job created successfully');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.customerName).toBe('St. Jude Hospital');
      expect(res.body.data.requiredSkills).toEqual(['MEDICAL_GAS', 'PRESSURE_SYSTEMS']);
      expect(res.body.data.priority).toBe('CRITICAL');

      // Verify audit log creation
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'JOB', entityId: res.body.data.id, action: 'CREATE' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.description).toContain('St. Jude Hospital');
    });

    it('rejects invalid coordinates with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .send({ ...validJobPayload, latitude: 120.0 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects negative or zero job duration with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .send({ ...validJobPayload, estimatedDuration: -30 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects inverted time range (earliestStart >= latestEnd) with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .send({
          ...validJobPayload,
          earliestStart: '2026-10-31T18:00:00.000Z',
          latestEnd: '2026-10-31T10:00:00.000Z',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // 2. Job Retrieval & Filtering
  describe('GET /api/jobs', () => {
    beforeEach(async () => {
      // Seed 3 test jobs
      await request(app).post('/api/jobs').send({
        ...validJobPayload,
        customerName: 'Alpha Tech Campus',
        priority: 'HIGH',
        serviceZone: 'ZONE_NORTH',
        status: 'PENDING',
      });
      await request(app).post('/api/jobs').send({
        ...validJobPayload,
        customerName: 'Beta Logistics Hub',
        priority: 'LOW',
        serviceZone: 'ZONE_SOUTH',
        status: 'ASSIGNED',
      });
      await request(app).post('/api/jobs').send({
        ...validJobPayload,
        customerName: 'Gamma Solar Park',
        priority: 'CRITICAL',
        serviceZone: 'ZONE_NORTH',
        status: 'PENDING',
      });
    });

    it('retrieves all jobs with pagination metadata', async () => {
      const res = await request(app).get('/api/jobs?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.totalPages).toBe(2);
      expect(res.body.meta.hasNext).toBe(true);
    });

    it('searches jobs by customer name', async () => {
      const res = await request(app).get('/api/jobs?search=Alpha');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].customerName).toBe('Alpha Tech Campus');
    });

    it('filters jobs by priority', async () => {
      const res = await request(app).get('/api/jobs?priority=CRITICAL');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].customerName).toBe('Gamma Solar Park');
    });

    it('filters jobs by service zone', async () => {
      const res = await request(app).get('/api/jobs?serviceZone=ZONE_NORTH');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('filters jobs by status', async () => {
      const res = await request(app).get('/api/jobs?status=ASSIGNED');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].customerName).toBe('Beta Logistics Hub');
    });
  });

  // 3. Single Job Retrieval
  describe('GET /api/jobs/:id', () => {
    it('retrieves an individual job by UUID with assignment relations', async () => {
      const created = await request(app).post('/api/jobs').send(validJobPayload);
      const jobId = created.body.data.id;

      const res = await request(app).get(`/api/jobs/${jobId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(jobId);
      expect(res.body.data.customerName).toBe('St. Jude Hospital');
    });

    it('returns 404 with JOB_NOT_FOUND for non-existent ID', async () => {
      const res = await request(app).get('/api/jobs/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('JOB_NOT_FOUND');
    });
  });

  // 4. Job Updates
  describe('PUT /api/jobs/:id', () => {
    it('updates job details and creates audit log entry', async () => {
      const created = await request(app).post('/api/jobs').send(validJobPayload);
      const jobId = created.body.data.id;

      const res = await request(app)
        .put(`/api/jobs/${jobId}`)
        .send({
          description: 'Updated pipeline regulator check specifications',
          priority: 'HIGH',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe('Updated pipeline regulator check specifications');
      expect(res.body.data.priority).toBe('HIGH');

      // Check update audit log
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'JOB', entityId: jobId, action: 'UPDATE' },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects updates on terminal COMPLETED jobs with UNSAFE_OPERATION', async () => {
      const created = await request(app).post('/api/jobs').send(validJobPayload);
      const jobId = created.body.data.id;

      // Force job to COMPLETED
      await prisma.job.update({ where: { id: jobId }, data: { status: 'COMPLETED' } });

      const res = await request(app)
        .put(`/api/jobs/${jobId}`)
        .send({ customerName: 'Attempt to change completed' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNSAFE_OPERATION');
    });
  });

  // 5. Job Status State Machine
  describe('PATCH /api/jobs/:id/status', () => {
    it('allows valid state transitions: PENDING -> ASSIGNED -> IN_PROGRESS -> COMPLETED', async () => {
      const created = await request(app).post('/api/jobs').send(validJobPayload);
      const jobId = created.body.data.id;

      // 1. PENDING -> ASSIGNED
      const step1 = await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'ASSIGNED' });
      expect(step1.status).toBe(200);
      expect(step1.body.data.status).toBe('ASSIGNED');

      // 2. ASSIGNED -> IN_PROGRESS
      const step2 = await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'IN_PROGRESS' });
      expect(step2.status).toBe(200);
      expect(step2.body.data.status).toBe('IN_PROGRESS');

      // 3. IN_PROGRESS -> COMPLETED
      const step3 = await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'COMPLETED' });
      expect(step3.status).toBe(200);
      expect(step3.body.data.status).toBe('COMPLETED');

      // Verify audit logs for status transitions
      const auditCount = await prisma.auditLog.count({
        where: { entityType: 'JOB', entityId: jobId, action: 'STATUS_CHANGE' },
      });
      expect(auditCount).toBe(3);
    });

    it('rejects invalid state transition: PENDING -> COMPLETED with 400 INVALID_STATUS_TRANSITION', async () => {
      const created = await request(app).post('/api/jobs').send(validJobPayload);
      const jobId = created.body.data.id;

      const res = await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('rejects transitioning out of terminal COMPLETED state with 400 INVALID_STATUS_TRANSITION', async () => {
      const created = await request(app).post('/api/jobs').send(validJobPayload);
      const jobId = created.body.data.id;

      // Set to COMPLETED
      await prisma.job.update({ where: { id: jobId }, data: { status: 'COMPLETED' } });

      const res = await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  // 6. Job Deletion
  describe('DELETE /api/jobs/:id', () => {
    it('safely deletes an unassigned job and records audit log', async () => {
      const created = await request(app).post('/api/jobs').send(validJobPayload);
      const jobId = created.body.data.id;

      const res = await request(app).delete(`/api/jobs/${jobId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await prisma.job.findUnique({ where: { id: jobId } });
      expect(deleted).toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'JOB', entityId: jobId, action: 'DELETE' },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects deletion of an IN_PROGRESS job with UNSAFE_OPERATION', async () => {
      const created = await request(app).post('/api/jobs').send(validJobPayload);
      const jobId = created.body.data.id;

      // Set to IN_PROGRESS
      await prisma.job.update({ where: { id: jobId }, data: { status: 'IN_PROGRESS' } });

      const res = await request(app).delete(`/api/jobs/${jobId}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNSAFE_OPERATION');
    });
  });
});
