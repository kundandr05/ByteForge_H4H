import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/config/prisma';

describe('Technician Management APIs (Phase 3)', () => {
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

  const validTechnicianPayload = {
    name: 'Elena Rostova',
    email: 'elena.rostova@dispatchgrid.io',
    phone: '+1-555-0109',
    skills: ['HVAC', 'REFRIGERATION'],
    serviceZones: ['ZONE_NORTH', 'ZONE_EAST'],
    latitude: 37.7749,
    longitude: -122.4194,
    shiftStart: '08:00',
    shiftEnd: '17:00',
    availabilityStatus: 'AVAILABLE',
  };

  // 1. Technician Creation
  describe('POST /api/technicians', () => {
    it('creates a technician with complete validation, 201 status, and audit log', async () => {
      const res = await request(app).post('/api/technicians').send(validTechnicianPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Technician created successfully');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe('Elena Rostova');
      expect(res.body.data.email).toBe('elena.rostova@dispatchgrid.io');
      expect(res.body.data.skills).toEqual(['HVAC', 'REFRIGERATION']);
      expect(res.body.data.serviceZones).toEqual(['ZONE_NORTH', 'ZONE_EAST']);

      // Verify audit log creation
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'TECHNICIAN', entityId: res.body.data.id, action: 'CREATE' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.description).toContain('Elena Rostova');
    });

    it('rejects duplicate email with 409 DUPLICATE_EMAIL', async () => {
      await request(app).post('/api/technicians').send(validTechnicianPayload);

      const res = await request(app).post('/api/technicians').send({
        ...validTechnicianPayload,
        name: 'Another Tech With Same Email',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('DUPLICATE_EMAIL');
    });

    it('rejects invalid shift format (e.g. non-24h "8:00") with 400 VALIDATION_ERROR', async () => {
      const res = await request(app).post('/api/technicians').send({
        ...validTechnicianPayload,
        shiftStart: '8:00',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('rejects identical shiftStart and shiftEnd with 400 VALIDATION_ERROR', async () => {
      const res = await request(app).post('/api/technicians').send({
        ...validTechnicianPayload,
        shiftStart: '08:00',
        shiftEnd: '08:00',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // 2. Technician Retrieval & Filtering
  describe('GET /api/technicians', () => {
    beforeEach(async () => {
      await request(app).post('/api/technicians').send({
        ...validTechnicianPayload,
        name: 'Sarah Connor',
        email: 'sarah@dispatchgrid.io',
        skills: ['HVAC', 'ELECTRICAL'],
        serviceZones: ['ZONE_NORTH'],
        availabilityStatus: 'AVAILABLE',
      });
      await request(app).post('/api/technicians').send({
        ...validTechnicianPayload,
        name: 'John Connor',
        email: 'john@dispatchgrid.io',
        skills: ['PLUMBING'],
        serviceZones: ['ZONE_SOUTH'],
        availabilityStatus: 'ON_SHIFT',
      });
      await request(app).post('/api/technicians').send({
        ...validTechnicianPayload,
        name: 'Kyle Reese',
        email: 'kyle@dispatchgrid.io',
        skills: ['ELECTRICAL'],
        serviceZones: ['ZONE_NORTH'],
        availabilityStatus: 'UNAVAILABLE',
      });
    });

    it('retrieves paginated list of technicians with meta', async () => {
      const res = await request(app).get('/api/technicians?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.totalPages).toBe(2);
    });

    it('searches technicians by name', async () => {
      const res = await request(app).get('/api/technicians?search=Sarah');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('Sarah Connor');
    });

    it('filters technicians by skill tag', async () => {
      const res = await request(app).get('/api/technicians?skill=PLUMBING');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('John Connor');
    });

    it('filters technicians by service zone', async () => {
      const res = await request(app).get('/api/technicians?serviceZone=ZONE_NORTH');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('filters technicians by availability status', async () => {
      const res = await request(app).get('/api/technicians?availability=ON_SHIFT');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].name).toBe('John Connor');
    });
  });

  // 3. Single Technician Retrieval
  describe('GET /api/technicians/:id', () => {
    it('retrieves single technician by UUID with assignments and unavailabilities', async () => {
      const created = await request(app).post('/api/technicians').send(validTechnicianPayload);
      const techId = created.body.data.id;

      const res = await request(app).get(`/api/technicians/${techId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(techId);
      expect(res.body.data.name).toBe('Elena Rostova');
      expect(res.body.data.assignments).toBeDefined();
    });

    it('returns 404 with TECHNICIAN_NOT_FOUND for non-existent ID', async () => {
      const res = await request(app).get('/api/technicians/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('TECHNICIAN_NOT_FOUND');
    });
  });

  // 4. Technician Updates
  describe('PUT /api/technicians/:id', () => {
    it('updates technician information and creates audit log', async () => {
      const created = await request(app).post('/api/technicians').send(validTechnicianPayload);
      const techId = created.body.data.id;

      const res = await request(app)
        .put(`/api/technicians/${techId}`)
        .send({
          phone: '+1-555-9999',
          skills: ['HVAC', 'SOLAR', 'CONTROLS'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('+1-555-9999');
      expect(res.body.data.skills).toContain('SOLAR');

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'TECHNICIAN', entityId: techId, action: 'UPDATE' },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects update if target email is taken by another technician', async () => {
      const tech1 = await request(app).post('/api/technicians').send(validTechnicianPayload);
      const tech2 = await request(app).post('/api/technicians').send({
        ...validTechnicianPayload,
        name: 'Second Tech',
        email: 'second@dispatchgrid.io',
      });

      const res = await request(app)
        .put(`/api/technicians/${tech2.body.data.id}`)
        .send({ email: tech1.body.data.email });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('DUPLICATE_EMAIL');
    });
  });

  // 5. Technician Availability Updates
  describe('PATCH /api/technicians/:id/availability', () => {
    it('updates technician availability and records audit log', async () => {
      const created = await request(app).post('/api/technicians').send(validTechnicianPayload);
      const techId = created.body.data.id;

      const res = await request(app)
        .patch(`/api/technicians/${techId}/availability`)
        .send({ availabilityStatus: 'ON_SHIFT' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.availabilityStatus).toBe('ON_SHIFT');

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'TECHNICIAN', entityId: techId, action: 'AVAILABILITY_CHANGE' },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects invalid availability status value with 400 VALIDATION_ERROR', async () => {
      const created = await request(app).post('/api/technicians').send(validTechnicianPayload);
      const techId = created.body.data.id;

      const res = await request(app)
        .patch(`/api/technicians/${techId}/availability`)
        .send({ availabilityStatus: 'SLEEPING' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  // 6. Technician Deletion
  describe('DELETE /api/technicians/:id', () => {
    it('safely deletes a technician with no active assignments and records audit log', async () => {
      const created = await request(app).post('/api/technicians').send(validTechnicianPayload);
      const techId = created.body.data.id;

      const res = await request(app).delete(`/api/technicians/${techId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const deleted = await prisma.technician.findUnique({ where: { id: techId } });
      expect(deleted).toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'TECHNICIAN', entityId: techId, action: 'DELETE' },
      });
      expect(audit).not.toBeNull();
    });

    it('rejects deletion of a technician with active scheduled assignments with 400 UNSAFE_OPERATION', async () => {
      const createdTech = await request(app).post('/api/technicians').send(validTechnicianPayload);
      const techId = createdTech.body.data.id;

      // Create a job and assign it to technician
      const job = await prisma.job.create({
        data: {
          customerName: 'Active Job Customer',
          description: 'Emergency test',
          requiredSkills: JSON.stringify(['HVAC']),
          priority: 'HIGH',
          estimatedDuration: 60,
          latitude: 37.77,
          longitude: -122.42,
          serviceZone: 'ZONE_NORTH',
          earliestStart: new Date('2026-10-31T08:00:00Z'),
          latestEnd: new Date('2026-10-31T12:00:00Z'),
          slaDeadline: new Date('2026-10-31T11:00:00Z'),
          status: 'ASSIGNED',
        },
      });

      await prisma.assignment.create({
        data: {
          jobId: job.id,
          technicianId: techId,
          scheduledStart: new Date('2026-10-31T09:00:00Z'),
          scheduledEnd: new Date('2026-10-31T10:00:00Z'),
          status: 'SCHEDULED',
        },
      });

      const res = await request(app).delete(`/api/technicians/${techId}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('UNSAFE_OPERATION');
      expect(res.body.message).toContain('active assignment');
    });
  });
});
